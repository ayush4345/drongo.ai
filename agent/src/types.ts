/**
 * Core types for the Drongo AI agent harness.
 *
 * All quantities are integers (bigint) so they map cleanly onto field elements
 * in the BN254 scalar field used by the settlement circuit. Asset amounts are
 * expressed in atomic units (e.g. micro-USDC at 6 decimals).
 */

/** A point on BabyJubjub — the consumer's public signing key. */
export interface BabyJubPublicKey {
  Ax: bigint;
  Ay: bigint;
}

/** An EdDSA-BabyJubjub (Poseidon) signature, decomposed into circuit-friendly scalars. */
export interface EdDSASignature {
  R8x: bigint;
  R8y: bigint;
  S: bigint;
}

/**
 * A cumulative, monotonic metering voucher signed by the consumer.
 * The message that is actually signed is Poseidon(channelId, cumulativeUnits).
 * Only the latest voucher matters at settlement — each supersedes the previous.
 */
export interface Voucher {
  channelId: bigint;
  cumulativeUnits: bigint;
  signature: EdDSASignature;
}

/** The full set of channel parameters. Most are private; only escrow + the rate
 *  commitment ever touch the chain. */
export interface ChannelTerms {
  channelId: bigint;
  /** Private per-unit rate, in atomic asset units. */
  rate: bigint;
  /** Private blinding factor for the rate commitment. */
  rateBlind: bigint;
  /** Public on-chain escrow ceiling, in atomic asset units. */
  escrow: bigint;
  /** Private per-channel secret used to derive the settlement nullifier. */
  channelSecret: bigint;
}

/**
 * Public inputs + private witness for the settlement circuit.
 *
 * This is the locked interface ("the seam") with the ZK team (T1). All values are
 * decimal strings, ready to be written into a snarkjs `input.json`. The circuit
 * recomputes the voucher message as Poseidon(channelId, totalUnits) internally and
 * verifies the signature against it.
 */
export interface SettlementWitness {
  // ---- public inputs ----
  channelId: string;
  /** Poseidon(rate, rateBlind) — binds settlement to the agreed (hidden) rate. */
  rateCommitment: string;
  escrow: string;
  /** totalUnits * rate — revealed in the MVP; shielded in the stretch variant. */
  settlementAmount: string;
  /** Poseidon(channelId, channelSecret) — prevents double-settlement. */
  nullifier: string;
  consumerPubKey: { Ax: string; Ay: string };
  // ---- private witness ----
  rate: string;
  rateBlind: string;
  totalUnits: string;
  channelSecret: string;
  signature: { R8x: string; R8y: string; S: string };
}
