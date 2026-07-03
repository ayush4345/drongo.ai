import {
  buildSettlementInputs,
  generateSettlementProof,
  serializeSettlement,
} from "@drongo/proving-setup";
import type { MeterChannelSnapshot } from "./db.js";
import type { SettlementResult } from "./channel.js";

/**
 * Build a settlement proof from a persisted MeterDb channel snapshot: it reads
 * the stored channel terms plus the final accepted voucher and produces the
 * on-chain-ready Groth16 proof. This lets a session settle from DURABLE state
 * (fetched from the meter DB at close) rather than only from in-memory channel
 * state — so settlement survives restarts and is auditable. Throws if no voucher
 * was ever accepted (nothing to settle).
 *
 * Type-only import of MeterChannelSnapshot keeps this module free of node:sqlite,
 * so it is safe to re-export from the main barrel.
 */
export async function settlementFromSnapshot(
  snapshot: MeterChannelSnapshot,
): Promise<SettlementResult> {
  const final = snapshot.latestVoucher;
  if (final === undefined) {
    throw new Error("no accepted vouchers — nothing to settle");
  }
  const inputs = await buildSettlementInputs({
    channelId: snapshot.terms.channelId,
    channelSecret: snapshot.terms.channelSecret,
    rate: snapshot.terms.rate,
    rateBlind: snapshot.terms.rateBlind,
    totalUnits: final.totalUnits,
    escrowAmount: snapshot.terms.escrow,
    depositorPayload: snapshot.terms.depositorPayload,
    providerPayload: snapshot.terms.providerPayload,
    tokenPayload: snapshot.terms.tokenPayload,
    voucher: { consumerPublicKey: final.consumerPublicKey, signature: final.signature },
  });
  const proof = await generateSettlementProof(inputs);
  return { inputs, proof, serialized: serializeSettlement(proof) };
}
