import * as snarkjs from "snarkjs";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PACKAGE_NAME = "proving-setup";

// Input/voucher building utilities (Poseidon commitments, EdDSA-Poseidon
// vouchers, address limbs, and the high-level `buildSettlementInputs`).
export * from "./inputs.js";

// Serialization bridge: snarkjs proof + public signals -> packed byte layout.
export * from "./serialize.js";

// EVM / Base serialization + Option-A address padding helpers.
export * from "./serialize-evm.js";

/**
 * A field-element value accepted from callers. Normalised internally to a
 * `bigint`; strings may be decimal (`"123"`) or hex (`"0x7b"`).
 */
export type FieldInput = string | number | bigint;

/**
 * Every `signal input` declared by `circuits/settlement.circom`, including both
 * the public inputs and the private witnesses. snarkjs requires a value for
 * each one in order to compute the witness.
 */
export interface SettlementCircuitInputs {
  // --- public inputs (emitted, in this order, as `publicSignals`) ---
  channel_id: FieldInput;
  rate_commitment: FieldInput;
  escrow_amount: FieldInput;
  settlement_amount: FieldInput;
  nullifier: FieldInput;
  consumer_pubkey_x: FieldInput;
  consumer_pubkey_y: FieldInput;
  depositor_hi: FieldInput;
  depositor_lo: FieldInput;
  provider_hi: FieldInput;
  provider_lo: FieldInput;
  token_hi: FieldInput;
  token_lo: FieldInput;
  // --- private witnesses ---
  rate: FieldInput;
  rate_blind: FieldInput;
  total_units: FieldInput;
  channel_secret: FieldInput;
  sig_R8x: FieldInput;
  sig_R8y: FieldInput;
  sig_S: FieldInput;
}

/** A Groth16 proof as produced by snarkjs. */
export interface Groth16Proof {
  pi_a: string[];
  pi_b: string[][];
  pi_c: string[];
  protocol: string;
  curve: string;
}

/**
 * Public signals in the order the circuit declares them in
 * `component main { public [...] }` — this matches the 13-element layout the
 * `SettlementVerifier` / `SlateEscrow` expect:
 * `[channel_id, rate_commitment, escrow_amount, settlement_amount, nullifier,
 *   consumer_pubkey_x, consumer_pubkey_y, depositor_hi, depositor_lo,
 *   provider_hi, provider_lo, token_hi, token_lo]`.
 */
export type PublicSignals = string[];

export interface SettlementProof {
  proof: Groth16Proof;
  publicSignals: PublicSignals;
}

export interface GenerateProofOptions {
  /** Path to the compiled circuit wasm. Defaults to the package's `settlement_js/settlement.wasm`. */
  wasmPath?: string;
  /** Path to the Groth16 proving key. Defaults to the package's `settlement_final.zkey`. */
  zkeyPath?: string;
}

/** Thrown when supplied inputs do not satisfy the circuit's input schema. */
export class CircuitInputValidationError extends Error {
  /** Every validation problem found, so callers can surface them all at once. */
  readonly issues: string[];

  constructor(issues: string[]) {
    super(`Invalid settlement circuit inputs:\n - ${issues.join("\n - ")}`);
    this.name = "CircuitInputValidationError";
    this.issues = issues;
  }
}

/** Thrown when the proving pipeline (artifact lookup or witness/proof generation) fails. */
export class ProofGenerationError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ProofGenerationError";
  }
}

// BN254 (alt_bn128) scalar field prime — the modulus every signal lives in.
const FIELD_PRIME =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const MAX_UINT64 = 1n << 64n;
const MAX_UINT128 = 1n << 128n;

type FieldBound = "field" | "uint64" | "uint128";

// Declaration order here defines the witness input order. `uint64` fields feed
// the in-circuit `LessEqThan(64)` range check; `uint128` fields are the address
// limbs (high/low halves of a 32-byte left-padded address payload).
const INPUT_SCHEMA: ReadonlyArray<{ name: keyof SettlementCircuitInputs; bound: FieldBound }> = [
  { name: "channel_id", bound: "field" },
  { name: "rate_commitment", bound: "field" },
  { name: "escrow_amount", bound: "uint64" },
  { name: "settlement_amount", bound: "uint64" },
  { name: "nullifier", bound: "field" },
  { name: "consumer_pubkey_x", bound: "field" },
  { name: "consumer_pubkey_y", bound: "field" },
  { name: "depositor_hi", bound: "uint128" },
  { name: "depositor_lo", bound: "uint128" },
  { name: "provider_hi", bound: "uint128" },
  { name: "provider_lo", bound: "uint128" },
  { name: "token_hi", bound: "uint128" },
  { name: "token_lo", bound: "uint128" },
  { name: "rate", bound: "field" },
  { name: "rate_blind", bound: "field" },
  { name: "total_units", bound: "field" },
  { name: "channel_secret", bound: "field" },
  { name: "sig_R8x", bound: "field" },
  { name: "sig_R8y", bound: "field" },
  { name: "sig_S", bound: "field" },
];

const KNOWN_FIELDS: ReadonlySet<string> = new Set(INPUT_SCHEMA.map((f) => f.name));

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const DEFAULT_WASM_PATH = path.join(packageRoot, "settlement_js", "settlement.wasm");
const DEFAULT_ZKEY_PATH = path.join(packageRoot, "settlement_final.zkey");

function parseFieldValue(name: string, raw: FieldInput, issues: string[]): bigint | undefined {
  let value: bigint;
  switch (typeof raw) {
    case "bigint":
      value = raw;
      break;
    case "number":
      if (!Number.isInteger(raw)) {
        issues.push(`"${name}" must be an integer, received ${raw}`);
        return undefined;
      }
      if (!Number.isSafeInteger(raw)) {
        issues.push(
          `"${name}" exceeds Number.MAX_SAFE_INTEGER; pass it as a string or bigint to avoid precision loss`,
        );
        return undefined;
      }
      value = BigInt(raw);
      break;
    case "string": {
      const trimmed = raw.trim();
      if (/^[0-9]+$/.test(trimmed) || /^0x[0-9a-fA-F]+$/.test(trimmed)) {
        value = BigInt(trimmed);
      } else {
        issues.push(`"${name}" must be a non-negative decimal or 0x-hex string, received "${raw}"`);
        return undefined;
      }
      break;
    }
    default:
      issues.push(`"${name}" must be a string, number, or bigint, received ${typeof raw}`);
      return undefined;
  }

  if (value < 0n) {
    issues.push(`"${name}" must be non-negative`);
    return undefined;
  }
  return value;
}

function checkBound(name: string, value: bigint, bound: FieldBound, issues: string[]): void {
  if (value >= FIELD_PRIME) {
    issues.push(`"${name}" must be less than the BN254 scalar field prime`);
    return;
  }
  if (bound === "uint64" && value >= MAX_UINT64) {
    issues.push(`"${name}" must fit in 64 bits (< 2^64) for the in-circuit range check`);
  }
  if (bound === "uint128" && value >= MAX_UINT128) {
    issues.push(`"${name}" must fit in 128 bits (< 2^128) as an address limb`);
  }
}

/**
 * Validate `inputs` against the `settlement.circom` schema and return the
 * normalised field elements. Collects every problem and throws a single
 * {@link CircuitInputValidationError} listing all of them.
 *
 * This checks structure, types, ranges, and the pure-arithmetic relations the
 * circuit enforces (`settlement_amount === total_units * rate` and
 * `settlement_amount <= escrow_amount`). The cryptographic-consistency
 * constraints (Poseidon rate commitment, EdDSA signature, nullifier hash) are
 * not recomputed here — they are enforced during witness generation and
 * surfaced as a {@link ProofGenerationError}.
 */
export function validateSettlementInputs(
  inputs: SettlementCircuitInputs,
): Record<keyof SettlementCircuitInputs, bigint> {
  if (inputs === null || typeof inputs !== "object") {
    throw new CircuitInputValidationError(["inputs must be an object"]);
  }

  const issues: string[] = [];
  const record = inputs as unknown as Record<string, unknown>;
  const values: Partial<Record<keyof SettlementCircuitInputs, bigint>> = {};

  for (const key of Object.keys(record)) {
    if (!KNOWN_FIELDS.has(key)) {
      issues.push(`unexpected input "${key}" is not part of the settlement circuit`);
    }
  }

  for (const { name, bound } of INPUT_SCHEMA) {
    const raw = record[name];
    if (raw === undefined || raw === null) {
      issues.push(`missing required input "${name}"`);
      continue;
    }
    const parsed = parseFieldValue(name, raw as FieldInput, issues);
    if (parsed === undefined) {
      continue;
    }
    checkBound(name, parsed, bound, issues);
    values[name] = parsed;
  }

  // Cross-field arithmetic relations — only checked when the operands parsed.
  const { settlement_amount, escrow_amount, total_units, rate } = values;
  if (total_units !== undefined && rate !== undefined && settlement_amount !== undefined) {
    const product = total_units * rate;
    if (settlement_amount !== product) {
      issues.push(
        `"settlement_amount" must equal total_units * rate (got ${settlement_amount}, expected ${product})`,
      );
    }
  }
  if (
    settlement_amount !== undefined &&
    escrow_amount !== undefined &&
    settlement_amount > escrow_amount
  ) {
    issues.push(
      `"settlement_amount" (${settlement_amount}) must not exceed "escrow_amount" (${escrow_amount})`,
    );
  }

  if (issues.length > 0) {
    throw new CircuitInputValidationError(issues);
  }

  return values as Record<keyof SettlementCircuitInputs, bigint>;
}

/**
 * Generate a Groth16 proof for the metered-settlement circuit.
 *
 * Validates `inputs` against the circuit schema, then runs snarkjs'
 * witness-calculation + proving pipeline.
 *
 * @param inputs   All circuit inputs (public + private). See {@link SettlementCircuitInputs}.
 * @param options  Optional overrides for the wasm / zkey artifact paths.
 * @returns        The proof and its public signals (13-element layout).
 * @throws {CircuitInputValidationError} if the inputs are malformed or inconsistent.
 * @throws {ProofGenerationError} if an artifact is missing or proving fails.
 */
export async function generateSettlementProof(
  inputs: SettlementCircuitInputs,
  options: GenerateProofOptions = {},
): Promise<SettlementProof> {
  const validated = validateSettlementInputs(inputs);

  // snarkjs accepts decimal strings; stringifying the bigints avoids any
  // number-precision or serialization ambiguity.
  const witnessInput: Record<string, string> = {};
  for (const { name } of INPUT_SCHEMA) {
    witnessInput[name] = validated[name].toString();
  }

  const wasmPath = options.wasmPath ?? DEFAULT_WASM_PATH;
  const zkeyPath = options.zkeyPath ?? DEFAULT_ZKEY_PATH;

  if (!existsSync(wasmPath)) {
    throw new ProofGenerationError(
      `Circuit wasm not found at "${wasmPath}". Compile settlement.circom or pass options.wasmPath.`,
    );
  }
  if (!existsSync(zkeyPath)) {
    throw new ProofGenerationError(
      `Proving key (zkey) not found at "${zkeyPath}". Run the Groth16 setup to produce it, or pass options.zkeyPath.`,
    );
  }

  try {
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      witnessInput,
      wasmPath,
      zkeyPath,
    );
    return { proof, publicSignals };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new ProofGenerationError(`Failed to generate settlement proof: ${reason}`, {
      cause: error,
    });
  }
}
