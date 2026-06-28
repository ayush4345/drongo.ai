// @drongo/agent-core — shared agent runtime: the priced Service interface, the
// metering channel (ConsumerMeter / ProviderMeter / ServiceChannel) built on
// @drongo/proving-setup, the on-chain ChainClient seam, and money helpers.
// Agents under agents/* compose these instead of re-implementing crypto.

export * from "./service.js";
export * from "./money.js";
export * from "./chain.js";
export * from "./channel.js";
