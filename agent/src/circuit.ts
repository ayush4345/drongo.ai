import { writeFileSync } from "node:fs";
import type { SettlementWitness } from "./types.js";

/**
 * Flatten a {@link SettlementWitness} into the flat signal map snarkjs expects in
 * `input.json`.
 *
 * The signal names below are the LOCKED interface with the ZK circuit. They match the
 * `MeteredVerifier` template in the circuit repo (jny0444/metered-stellar,
 * `setttlement.circom`) exactly — snake_case, with `consumer_pubkey_x/y` and `sig_*`.
 * This is the single place to keep in lockstep with the circuit; if a signal is renamed
 * there, change it here only.
 *
 * Public signals:  channel_id, rate_commitment, escrow_amount, settlement_amount,
 *                  nullifier, consumer_pubkey_x, consumer_pubkey_y
 * Private signals: rate, rate_blind, total_units, channel_secret, sig_R8x, sig_R8y, sig_S
 *
 * The circuit recomputes the voucher message as Poseidon(channel_id, total_units) and
 * verifies the EdDSA signature (sig_R8x, sig_R8y, sig_S) against it.
 */
export function toCircuitInput(w: SettlementWitness): Record<string, string> {
  return {
    // public signals
    channel_id: w.channelId,
    rate_commitment: w.rateCommitment,
    escrow_amount: w.escrow,
    settlement_amount: w.settlementAmount,
    nullifier: w.nullifier,
    consumer_pubkey_x: w.consumerPubKey.Ax,
    consumer_pubkey_y: w.consumerPubKey.Ay,
    // private signals
    rate: w.rate,
    rate_blind: w.rateBlind,
    total_units: w.totalUnits,
    channel_secret: w.channelSecret,
    sig_R8x: w.signature.R8x,
    sig_R8y: w.signature.R8y,
    sig_S: w.signature.S,
  };
}

/**
 * Write the circuit input map to a JSON file for the prover. The output is a drop-in
 * replacement for the circuit repo's hardcoded `generate_input.js` — same shape, but
 * populated from a real metering session.
 */
export function writeCircuitInput(path: string, w: SettlementWitness): void {
  writeFileSync(path, JSON.stringify(toCircuitInput(w), null, 2) + "\n");
}
