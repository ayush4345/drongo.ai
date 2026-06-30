import type { Groth16Proof, PublicSignals, SettlementProof } from "./index.js";

/**
 * Serialization bridge: converts a snarkjs Groth16 proof + public signals into
 * the byte/field layout the Soroban contracts expect.
 *
 * The on-chain `Proof` struct is `{ a: BytesN<64>, b: BytesN<128>, c: BytesN<64> }`
 * in the Ethereum-compatible uncompressed encoding the Soroban BN254 host
 * functions use:
 *   - G1 (64 bytes):  be(X) || be(Y)
 *   - G2 (128 bytes): be(X) || be(Y), each Fp2 element as be(c1) || be(c0)
 *                     (imaginary component FIRST, then real).
 *
 * snarkjs stores Fp2 coordinates as [c0, c1], so the G2 components are swapped
 * here. This mirrors `gen_verifier_data.js`, the generator the deployed
 * verifying key / `meteredverifier` contract were produced with.
 *
 * `public_signals` are emitted as `bigint`s (the contract's `Vec<U256>`); use
 * {@link fieldToBytes32} if a client needs the raw big-endian bytes instead.
 */

/** Number of public signals the metered-settlement circuit exposes. */
export const SETTLEMENT_PUBLIC_SIGNAL_COUNT = 13;

const TWO_POW_256 = 1n << 256n;

/** Thrown when a proof or public signals cannot be serialized for the contracts. */
export class ProofSerializationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProofSerializationError";
  }
}

/** The on-chain `Proof` struct as raw big-endian byte arrays. */
export interface SorobanProof {
  /** G1 point A — 64 bytes (be(X) || be(Y)). */
  a: Uint8Array;
  /** G2 point B — 128 bytes (be(X) || be(Y), each Fp2 be(c1) || be(c0)). */
  b: Uint8Array;
  /** G1 point C — 64 bytes (be(X) || be(Y)). */
  c: Uint8Array;
}

/** A proof and its public signals, serialized for a Soroban `settle` / `verify` call. */
export interface SerializedSettlement {
  proof: SorobanProof;
  /** 13 field elements, matching the contract's `Vec<U256>`. */
  publicSignals: bigint[];
}

function toBigInt(label: string, value: string | bigint): bigint {
  if (typeof value === "bigint") {
    return value;
  }
  try {
    return BigInt(value.trim());
  } catch {
    throw new ProofSerializationError(`${label} is not a valid integer: "${value}"`);
  }
}

/**
 * Encode a field element as a 32-byte big-endian array (the contract's
 * `U256::from_be_bytes` input). Throws if it does not fit in 32 bytes.
 */
export function fieldToBytes32(value: string | bigint, label = "field element"): Uint8Array {
  const v = toBigInt(label, value);
  if (v < 0n) {
    throw new ProofSerializationError(`${label} must be non-negative, received ${v}`);
  }
  if (v >= TWO_POW_256) {
    throw new ProofSerializationError(`${label} does not fit in 32 bytes: ${v}`);
  }
  const out = new Uint8Array(32);
  let x = v;
  for (let i = 31; i >= 0; i--) {
    out[i] = Number(x & 0xffn);
    x >>= 8n;
  }
  return out;
}

/** Hex-encode bytes (no `0x` prefix), e.g. for logging or cross-checking fixtures. */
export function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

function coord(label: string, arr: readonly string[], index: number): string {
  const value = arr[index];
  if (value === undefined) {
    throw new ProofSerializationError(`${label} is missing component ${index}`);
  }
  return value;
}

// G1 point [x, y, z] -> 64 bytes (affine; z must be 1).
function serializeG1(label: string, point: readonly string[]): Uint8Array {
  if (point.length < 2) {
    throw new ProofSerializationError(`${label} must have at least 2 coordinates`);
  }
  const z = point[2];
  if (z !== undefined && toBigInt(`${label}.z`, z) !== 1n) {
    throw new ProofSerializationError(`${label} is not in affine form (z = ${z})`);
  }
  const out = new Uint8Array(64);
  out.set(fieldToBytes32(coord(label, point, 0), `${label}.x`), 0);
  out.set(fieldToBytes32(coord(label, point, 1), `${label}.y`), 32);
  return out;
}

// G2 point [[x_c0, x_c1], [y_c0, y_c1], z] -> 128 bytes with c1 || c0 ordering.
function serializeG2(label: string, point: readonly (readonly string[])[]): Uint8Array {
  if (point.length < 2) {
    throw new ProofSerializationError(`${label} must have at least 2 Fp2 coordinates`);
  }
  const x = point[0];
  const y = point[1];
  if (x === undefined || y === undefined || x.length < 2 || y.length < 2) {
    throw new ProofSerializationError(`${label} Fp2 coordinates are malformed`);
  }
  const z = point[2];
  if (z !== undefined) {
    const z0 = coord(`${label}.z`, z, 0);
    const z1 = coord(`${label}.z`, z, 1);
    if (toBigInt(`${label}.z.c0`, z0) !== 1n || toBigInt(`${label}.z.c1`, z1) !== 0n) {
      throw new ProofSerializationError(`${label} is not in affine form (z = [${z0}, ${z1}])`);
    }
  }
  const out = new Uint8Array(128);
  out.set(fieldToBytes32(coord(`${label}.x`, x, 1), `${label}.x.c1`), 0); // imaginary first
  out.set(fieldToBytes32(coord(`${label}.x`, x, 0), `${label}.x.c0`), 32);
  out.set(fieldToBytes32(coord(`${label}.y`, y, 1), `${label}.y.c1`), 64);
  out.set(fieldToBytes32(coord(`${label}.y`, y, 0), `${label}.y.c0`), 96);
  return out;
}

/** Convert a snarkjs Groth16 proof into the on-chain {@link SorobanProof} byte layout. */
export function serializeProof(proof: Groth16Proof): SorobanProof {
  if (proof.protocol !== undefined && proof.protocol !== "groth16") {
    throw new ProofSerializationError(`unsupported proof protocol "${proof.protocol}", expected "groth16"`);
  }
  if (proof.curve !== undefined && proof.curve !== "bn128") {
    throw new ProofSerializationError(`unsupported proof curve "${proof.curve}", expected "bn128"`);
  }
  return {
    a: serializeG1("pi_a", proof.pi_a),
    b: serializeG2("pi_b", proof.pi_b),
    c: serializeG1("pi_c", proof.pi_c),
  };
}

/**
 * Convert snarkjs public signals (decimal strings) into the `bigint`s the
 * contract's `Vec<U256>` expects, validating count and range.
 */
export function serializePublicSignals(publicSignals: PublicSignals): bigint[] {
  if (publicSignals.length !== SETTLEMENT_PUBLIC_SIGNAL_COUNT) {
    throw new ProofSerializationError(
      `expected ${SETTLEMENT_PUBLIC_SIGNAL_COUNT} public signals, received ${publicSignals.length}`,
    );
  }
  return publicSignals.map((signal, index) => {
    const v = toBigInt(`public signal ${index}`, signal);
    if (v < 0n || v >= TWO_POW_256) {
      throw new ProofSerializationError(`public signal ${index} does not fit in 32 bytes: ${v}`);
    }
    return v;
  });
}

/**
 * Serialize a {@link SettlementProof} (the output of `generateSettlementProof`)
 * into the proof bytes + public-signal field elements for a Soroban
 * `slate-escrow.settle` / `meteredverifier.verify` call.
 */
export function serializeSettlement(result: SettlementProof): SerializedSettlement {
  return {
    proof: serializeProof(result.proof),
    publicSignals: serializePublicSignals(result.publicSignals),
  };
}
