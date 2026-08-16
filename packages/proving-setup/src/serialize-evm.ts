/**
 * Serialization bridge: snarkjs Groth16 proof → Solidity verifier calldata.
 *
 * Solidity `SettlementVerifier.verifyProof` expects:
 *   a: uint256[2]
 *   b: uint256[2][2]  with Fp2 components swapped vs snarkjs ([c1, c0])
 *   c: uint256[2]
 *   input: uint256[13]
 *
 * Address payloads stay 32-byte left-padded (Option A) — use
 * {@link evmAddressToPayload} before `addressPayloadToLimbs`.
 */

import type { Groth16Proof, PublicSignals, SettlementProof } from "./index.js";
import {
  ProofSerializationError,
  SETTLEMENT_PUBLIC_SIGNAL_COUNT,
  serializePublicSignals,
} from "./serialize.js";

export interface EvmProof {
  a: readonly [bigint, bigint];
  b: readonly [readonly [bigint, bigint], readonly [bigint, bigint]];
  c: readonly [bigint, bigint];
}

export interface EvmSerializedSettlement {
  proof: EvmProof;
  publicSignals: readonly [
    bigint, bigint, bigint, bigint, bigint, bigint, bigint,
    bigint, bigint, bigint, bigint, bigint, bigint,
  ];
}

function toBigInt(label: string, value: string | bigint): bigint {
  if (typeof value === "bigint") return value;
  try {
    return BigInt(value.trim());
  } catch {
    throw new ProofSerializationError(`${label} is not a valid integer: "${value}"`);
  }
}

function g1(label: string, point: readonly string[]): readonly [bigint, bigint] {
  if (point.length < 2) {
    throw new ProofSerializationError(`${label} must have at least 2 coordinates`);
  }
  return [toBigInt(`${label}.x`, point[0]!), toBigInt(`${label}.y`, point[1]!)];
}

/**
 * snarkjs stores Fp2 as [c0, c1]; the Solidity verifier / BN254 pairing
 * precompile encoding used by snarkjs templates expects [c1, c0].
 */
function g2(
  label: string,
  point: readonly (readonly string[])[],
): readonly [readonly [bigint, bigint], readonly [bigint, bigint]] {
  if (point.length < 2) {
    throw new ProofSerializationError(`${label} must have at least 2 Fp2 coordinates`);
  }
  const x = point[0];
  const y = point[1];
  if (!x || !y || x.length < 2 || y.length < 2) {
    throw new ProofSerializationError(`${label} Fp2 coordinates are malformed`);
  }
  return [
    [toBigInt(`${label}.x.c1`, x[1]!), toBigInt(`${label}.x.c0`, x[0]!)],
    [toBigInt(`${label}.y.c1`, y[1]!), toBigInt(`${label}.y.c0`, y[0]!)],
  ];
}

/** Convert a snarkjs proof into Solidity `verifyProof` argument shape. */
export function serializeProofEvm(proof: Groth16Proof): EvmProof {
  if (proof.protocol !== undefined && proof.protocol !== "groth16") {
    throw new ProofSerializationError(`unsupported proof protocol "${proof.protocol}", expected "groth16"`);
  }
  if (proof.curve !== undefined && proof.curve !== "bn128") {
    throw new ProofSerializationError(`unsupported proof curve "${proof.curve}", expected "bn128"`);
  }
  return {
    a: g1("pi_a", proof.pi_a),
    b: g2("pi_b", proof.pi_b),
    c: g1("pi_c", proof.pi_c),
  };
}

export function serializeSettlementEvm(result: SettlementProof): EvmSerializedSettlement {
  const signals = serializePublicSignals(result.publicSignals);
  if (signals.length !== SETTLEMENT_PUBLIC_SIGNAL_COUNT) {
    throw new ProofSerializationError(
      `expected ${SETTLEMENT_PUBLIC_SIGNAL_COUNT} public signals, received ${signals.length}`,
    );
  }
  return {
    proof: serializeProofEvm(result.proof),
    publicSignals: signals as unknown as EvmSerializedSettlement["publicSignals"],
  };
}

/**
 * Left-pad a 20-byte EVM address to a 32-byte payload so existing hi/lo limb
 * encoding (`addressPayloadToLimbs`) stays unchanged (migration Option A).
 */
export function evmAddressToPayload(address: string): Uint8Array {
  const hex = address.startsWith("0x") || address.startsWith("0X") ? address.slice(2) : address;
  if (!/^[0-9a-fA-F]{40}$/.test(hex)) {
    throw new ProofSerializationError(`EVM address must be 20 bytes (40 hex chars), received "${address}"`);
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 20; i++) {
    out[12 + i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/** Decode a 32-byte left-padded payload back to a checksum-agnostic `0x` address. */
export function payloadToEvmAddress(payload: Uint8Array | string): `0x${string}` {
  let bytes: Uint8Array;
  if (typeof payload === "string") {
    const hex = payload.startsWith("0x") || payload.startsWith("0X") ? payload.slice(2) : payload;
    if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
      throw new ProofSerializationError(`padded address payload must be 64 hex characters`);
    }
    bytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
  } else {
    if (payload.length !== 32) {
      throw new ProofSerializationError(`padded address payload must be 32 bytes, received ${payload.length}`);
    }
    bytes = payload;
  }
  for (let i = 0; i < 12; i++) {
    if (bytes[i] !== 0) {
      throw new ProofSerializationError("padded address payload has non-zero high bytes");
    }
  }
  let hex = "0x";
  for (let i = 12; i < 32; i++) {
    hex += bytes[i]!.toString(16).padStart(2, "0");
  }
  return hex as `0x${string}`;
}

export function serializePublicSignalsEvm(publicSignals: PublicSignals): EvmSerializedSettlement["publicSignals"] {
  return serializePublicSignals(publicSignals) as unknown as EvmSerializedSettlement["publicSignals"];
}
