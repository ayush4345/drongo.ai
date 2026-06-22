import { writeFileSync } from "node:fs";
import type { SettlementWitness } from "./types.js";

/**
 * Flatten a {@link SettlementWitness} into the flat signal map snarkjs expects in
 * `input.json`.
 *
 * The signal names below are the LOCKED interface with the circuit team (T1). If the
 * circuit declares different signal names, change them here (one place) rather than
 * scattering renames through the agent code.
 *
 * Public signals:  channelId, rateCommitment, escrow, settlementAmount, nullifier, Ax, Ay
 * Private signals: rate, rateBlind, totalUnits, channelSecret, R8x, R8y, S
 */
export function toCircuitInput(w: SettlementWitness): Record<string, string> {
  return {
    // public
    channelId: w.channelId,
    rateCommitment: w.rateCommitment,
    escrow: w.escrow,
    settlementAmount: w.settlementAmount,
    nullifier: w.nullifier,
    Ax: w.consumerPubKey.Ax,
    Ay: w.consumerPubKey.Ay,
    // private
    rate: w.rate,
    rateBlind: w.rateBlind,
    totalUnits: w.totalUnits,
    channelSecret: w.channelSecret,
    R8x: w.signature.R8x,
    R8y: w.signature.R8y,
    S: w.signature.S,
  };
}

/** Write the circuit input map to a JSON file for the prover. */
export function writeCircuitInput(path: string, w: SettlementWitness): void {
  writeFileSync(path, JSON.stringify(toCircuitInput(w), null, 2) + "\n");
}
