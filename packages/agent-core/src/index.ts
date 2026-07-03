// @drongo/agent-core — shared agent runtime: the priced Service interface, the
// metering channel (ConsumerMeter / ProviderMeter / ServiceChannel) built on
// @drongo/proving-setup, the on-chain ChainClient seam, and money helpers.
// Agents under agents/* compose these instead of re-implementing crypto.

export * from "./service.js";
export * from "./money.js";
export * from "./chain.js";
export * from "./channel.js";
export * from "./toolbox.js";
export * from "./voucher-wire.js";
export * from "./x402-client.js";
export * from "./x402-channel.js";
export * from "./x402-stellar.js";
export {
  SLATE_TESTNET_PROVIDER_PUBLIC,
  X402_TESTNET_FACILITATOR_URL,
  SLATE_TESTNET_CONTRACTS,
  NATIVE_XLM_TESTNET_CONTRACT_ID,
  USDC_TESTNET_CONTRACT_ID,
} from "./stellar-config.js";
// MeterDb uses node:sqlite (Node 22+). Import via "@drongo/agent-core/db" so
// provider/consumer servers on Node 20 don't load it unless needed.
export * from "./env.js";
export * from "./soroban.js";
export type { ConsumerPublicKey, Voucher } from "@drongo/proving-setup";
