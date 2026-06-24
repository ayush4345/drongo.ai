/**
 * @drongo/agent — public API.
 *
 * Confidential pay-per-use metering between autonomous agents: cumulative
 * EdDSA-BabyJubjub vouchers signed off-chain, settled once on Stellar with a ZK proof.
 */
export { DrongoCrypto } from "./crypto.js";
export { createIdentity, randomFieldValue, type ConsumerIdentity } from "./keys.js";
export { voucherMessage, signVoucher, verifyVoucher } from "./voucher.js";
export { ConsumerAgent } from "./consumer.js";
export { ProviderAgent, type ServeResult, type RejectReason } from "./provider.js";
export { MeteredChannel, type OpenChannelOpts, type MeterStep } from "./channel.js";
export { toCircuitInput, writeCircuitInput } from "./circuit.js";
export type {
  BabyJubPublicKey,
  EdDSASignature,
  Voucher,
  ChannelTerms,
  SettlementWitness,
} from "./types.js";
