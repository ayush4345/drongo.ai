import { buildPoseidon, buildEddsa, type Poseidon, type Eddsa } from "circomlibjs";
import type { FieldInput, SettlementCircuitInputs } from "./index.js";

/**
 * Helpers for assembling the inputs that `circuits/settlement.circom` expects:
 * Poseidon commitments, the EdDSA-Poseidon voucher signature, on-chain address
 * limbs, and a one-shot builder that produces a complete
 * {@link SettlementCircuitInputs} object ready to pass to
 * `generateSettlementProof`.
 *
 * The cryptographic primitives (Poseidon, Baby Jubjub EdDSA) are loaded from
 * `circomlibjs` and operate over the same BN254 scalar field as the circuit,
 * so every value returned here is already a valid field element.
 */

// BN254 (alt_bn128) scalar field prime — values must stay below this.
const FIELD_PRIME =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

// --- lazily-built, cached circomlibjs instances (WASM init is async) ---
let poseidonInstance: Promise<Poseidon> | undefined;
let eddsaInstance: Promise<Eddsa> | undefined;

function getPoseidon(): Promise<Poseidon> {
  return (poseidonInstance ??= buildPoseidon());
}

function getEddsa(): Promise<Eddsa> {
  return (eddsaInstance ??= buildEddsa());
}

/** Error thrown when a value supplied to a builder helper is malformed. */
export class InputBuildError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InputBuildError";
  }
}

/** Coerce a {@link FieldInput} to a `bigint`, validating range and format. */
function toFieldBigInt(label: string, value: FieldInput): bigint {
  let result: bigint;
  switch (typeof value) {
    case "bigint":
      result = value;
      break;
    case "number":
      if (!Number.isInteger(value)) {
        throw new InputBuildError(`${label} must be an integer, received ${value}`);
      }
      if (!Number.isSafeInteger(value)) {
        throw new InputBuildError(
          `${label} exceeds Number.MAX_SAFE_INTEGER; pass it as a string or bigint`,
        );
      }
      result = BigInt(value);
      break;
    case "string": {
      const trimmed = value.trim();
      if (!/^[0-9]+$/.test(trimmed) && !/^0x[0-9a-fA-F]+$/.test(trimmed)) {
        throw new InputBuildError(
          `${label} must be a non-negative decimal or 0x-hex string, received "${value}"`,
        );
      }
      result = BigInt(trimmed);
      break;
    }
    default:
      throw new InputBuildError(
        `${label} must be a string, number, or bigint, received ${typeof value}`,
      );
  }
  if (result < 0n) {
    throw new InputBuildError(`${label} must be non-negative`);
  }
  if (result >= FIELD_PRIME) {
    throw new InputBuildError(`${label} must be less than the BN254 scalar field prime`);
  }
  return result;
}

/** A 32-byte address payload: a Uint8Array, or a 64-char hex string (optionally `0x`-prefixed). */
export type AddressPayload = Uint8Array | string;

/** The high/low 128-bit limbs of a 32-byte address payload. */
export interface AddressLimbs {
  hi: bigint;
  lo: bigint;
}

function toPayloadBytes(label: string, payload: AddressPayload): Uint8Array {
  if (payload instanceof Uint8Array) {
    if (payload.length !== 32) {
      throw new InputBuildError(`${label} must be 32 bytes, received ${payload.length}`);
    }
    return payload;
  }
  if (typeof payload === "string") {
    const hex = payload.startsWith("0x") || payload.startsWith("0X") ? payload.slice(2) : payload;
    if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
      throw new InputBuildError(`${label} must be 64 hex characters (32 bytes), received "${payload}"`);
    }
    const bytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
    return bytes;
  }
  throw new InputBuildError(`${label} must be a Uint8Array or hex string`);
}

function bytesToBigIntBE(bytes: Uint8Array): bigint {
  let acc = 0n;
  for (const byte of bytes) {
    acc = (acc << 8n) | BigInt(byte);
  }
  return acc;
}

/**
 * Split a 32-byte address payload into its high/low 128-bit limbs,
 * matching the contracts' `address_to_field_pair` (big-endian, `hi = bytes[0..16]`,
 * `lo = bytes[16..32]`).
 */
export function addressPayloadToLimbs(payload: AddressPayload): AddressLimbs {
  const bytes = toPayloadBytes("address payload", payload);
  return {
    hi: bytesToBigIntBE(bytes.subarray(0, 16)),
    lo: bytesToBigIntBE(bytes.subarray(16, 32)),
  };
}

function toPrivateKeyBytes(privateKey: AddressPayload): Uint8Array {
  return toPayloadBytes("consumer private key", privateKey);
}

/** Poseidon hash of two field elements, returned as a `bigint`. */
export async function poseidon2(left: FieldInput, right: FieldInput): Promise<bigint> {
  const poseidon = await getPoseidon();
  const a = toFieldBigInt("poseidon input 0", left);
  const b = toFieldBigInt("poseidon input 1", right);
  return poseidon.F.toObject(poseidon([a, b]));
}

/** `rate_commitment = Poseidon(rate, rate_blind)`. */
export function computeRateCommitment(rate: FieldInput, rateBlind: FieldInput): Promise<bigint> {
  return poseidon2(rate, rateBlind);
}

/** `nullifier = Poseidon(channel_id, channel_secret)`. */
export function computeNullifier(
  channelId: FieldInput,
  channelSecret: FieldInput,
): Promise<bigint> {
  return poseidon2(channelId, channelSecret);
}

/** Voucher message signed by the consumer: `Poseidon(channel_id, total_units)`. */
export function computeVoucherMessage(
  channelId: FieldInput,
  totalUnits: FieldInput,
): Promise<bigint> {
  return poseidon2(channelId, totalUnits);
}

/** A Baby Jubjub public key (the circuit's `consumer_pubkey_x` / `consumer_pubkey_y`). */
export interface ConsumerPublicKey {
  x: bigint;
  y: bigint;
}

/** An EdDSA-Poseidon signature (the circuit's `sig_R8x` / `sig_R8y` / `sig_S`). */
export interface VoucherSignature {
  R8x: bigint;
  R8y: bigint;
  S: bigint;
}

/** Derive the consumer's Baby Jubjub public key from a 32-byte private key. */
export async function deriveConsumerPublicKey(
  privateKey: AddressPayload,
): Promise<ConsumerPublicKey> {
  const eddsa = await getEddsa();
  const pub = eddsa.prv2pub(toPrivateKeyBytes(privateKey));
  return { x: eddsa.F.toObject(pub[0]), y: eddsa.F.toObject(pub[1]) };
}

/** Sign a voucher message with EdDSA-Poseidon using a 32-byte private key. */
export async function signVoucher(
  privateKey: AddressPayload,
  message: FieldInput,
): Promise<VoucherSignature> {
  const eddsa = await getEddsa();
  const msg = eddsa.F.e(toFieldBigInt("voucher message", message));
  const sig = eddsa.signPoseidon(toPrivateKeyBytes(privateKey), msg);
  return {
    R8x: eddsa.F.toObject(sig.R8[0]),
    R8y: eddsa.F.toObject(sig.R8[1]),
    S: BigInt(sig.S),
  };
}

/** Verify an EdDSA-Poseidon voucher signature against a message and public key. */
export async function verifyVoucher(
  publicKey: ConsumerPublicKey,
  message: FieldInput,
  signature: VoucherSignature,
): Promise<boolean> {
  const eddsa = await getEddsa();
  const msg = eddsa.F.e(toFieldBigInt("voucher message", message));
  return eddsa.verifyPoseidon(
    msg,
    {
      R8: [eddsa.F.e(signature.R8x), eddsa.F.e(signature.R8y)],
      S: BigInt(signature.S),
    },
    [eddsa.F.e(publicKey.x), eddsa.F.e(publicKey.y)],
  );
}

/** A signed metering voucher, as produced by {@link createVoucher}. */
export interface Voucher {
  channelId: bigint;
  totalUnits: bigint;
  /** `Poseidon(channel_id, total_units)` — the signed message. */
  message: bigint;
  consumerPublicKey: ConsumerPublicKey;
  signature: VoucherSignature;
}

/**
 * Create a signed metering voucher (the **consumer** side of the protocol):
 * derives the public key, computes `message = Poseidon(channel_id, total_units)`,
 * and signs it.
 */
export async function createVoucher(
  privateKey: AddressPayload,
  channelId: FieldInput,
  totalUnits: FieldInput,
): Promise<Voucher> {
  const channelIdBig = toFieldBigInt("channelId", channelId);
  const totalUnitsBig = toFieldBigInt("totalUnits", totalUnits);
  const message = await computeVoucherMessage(channelIdBig, totalUnitsBig);
  const consumerPublicKey = await deriveConsumerPublicKey(privateKey);
  const signature = await signVoucher(privateKey, message);
  return {
    channelId: channelIdBig,
    totalUnits: totalUnitsBig,
    message,
    consumerPublicKey,
    signature,
  };
}

/**
 * Parameters for {@link buildSettlementInputs}. Supply the channel/pricing
 * values plus the address payloads, and exactly one of `consumerPrivateKey`
 * (to sign the voucher here) or a pre-signed `voucher`.
 */
export interface BuildSettlementInputsParams {
  channelId: FieldInput;
  channelSecret: FieldInput;
  rate: FieldInput;
  rateBlind: FieldInput;
  totalUnits: FieldInput;
  escrowAmount: FieldInput;
  depositorPayload: AddressPayload;
  providerPayload: AddressPayload;
  tokenPayload: AddressPayload;
  /** Consumer private key — when provided, the voucher is signed internally. */
  consumerPrivateKey?: AddressPayload;
  /** A voucher already signed by the consumer (public key + signature). */
  voucher?: { consumerPublicKey: ConsumerPublicKey; signature: VoucherSignature };
}

/**
 * Assemble a complete {@link SettlementCircuitInputs} object from domain-level
 * values: computes the Poseidon commitments, derives `settlement_amount`,
 * resolves the consumer voucher, and encodes the address limbs.
 *
 * The result is suitable to pass directly to `generateSettlementProof`, which
 * performs the full schema/range validation. When a pre-signed `voucher` is
 * supplied it is verified against `Poseidon(channel_id, total_units)` and an
 * {@link InputBuildError} is thrown if it does not match.
 *
 * @throws {InputBuildError} if values are malformed or the voucher is invalid.
 */
export async function buildSettlementInputs(
  params: BuildSettlementInputsParams,
): Promise<SettlementCircuitInputs> {
  const channelId = toFieldBigInt("channelId", params.channelId);
  const channelSecret = toFieldBigInt("channelSecret", params.channelSecret);
  const rate = toFieldBigInt("rate", params.rate);
  const rateBlind = toFieldBigInt("rateBlind", params.rateBlind);
  const totalUnits = toFieldBigInt("totalUnits", params.totalUnits);
  const escrowAmount = toFieldBigInt("escrowAmount", params.escrowAmount);

  const hasPrivateKey = params.consumerPrivateKey !== undefined;
  const hasVoucher = params.voucher !== undefined;
  if (hasPrivateKey === hasVoucher) {
    throw new InputBuildError(
      "provide exactly one of `consumerPrivateKey` or `voucher`",
    );
  }

  const settlementAmount = totalUnits * rate;
  const rateCommitment = await computeRateCommitment(rate, rateBlind);
  const nullifier = await computeNullifier(channelId, channelSecret);
  const message = await computeVoucherMessage(channelId, totalUnits);

  let consumerPublicKey: ConsumerPublicKey;
  let signature: VoucherSignature;
  if (params.consumerPrivateKey !== undefined) {
    consumerPublicKey = await deriveConsumerPublicKey(params.consumerPrivateKey);
    signature = await signVoucher(params.consumerPrivateKey, message);
  } else {
    // hasVoucher is guaranteed true here.
    const provided = params.voucher!;
    const valid = await verifyVoucher(provided.consumerPublicKey, message, provided.signature);
    if (!valid) {
      throw new InputBuildError(
        "supplied voucher signature is invalid for Poseidon(channel_id, total_units)",
      );
    }
    consumerPublicKey = provided.consumerPublicKey;
    signature = provided.signature;
  }

  const depositor = addressPayloadToLimbs(params.depositorPayload);
  const provider = addressPayloadToLimbs(params.providerPayload);
  const token = addressPayloadToLimbs(params.tokenPayload);

  return {
    channel_id: channelId.toString(),
    rate_commitment: rateCommitment.toString(),
    escrow_amount: escrowAmount.toString(),
    settlement_amount: settlementAmount.toString(),
    nullifier: nullifier.toString(),
    consumer_pubkey_x: consumerPublicKey.x.toString(),
    consumer_pubkey_y: consumerPublicKey.y.toString(),
    depositor_hi: depositor.hi.toString(),
    depositor_lo: depositor.lo.toString(),
    provider_hi: provider.hi.toString(),
    provider_lo: provider.lo.toString(),
    token_hi: token.hi.toString(),
    token_lo: token.lo.toString(),
    rate: rate.toString(),
    rate_blind: rateBlind.toString(),
    total_units: totalUnits.toString(),
    channel_secret: channelSecret.toString(),
    sig_R8x: signature.R8x.toString(),
    sig_R8y: signature.R8y.toString(),
    sig_S: signature.S.toString(),
  };
}
