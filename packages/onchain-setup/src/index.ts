export {
  SOROBAN_TESTNET,
  assertSorobanConfig,
  sorobanConfigFromEnv,
  type SorobanConfig,
} from "./config.js";

export {
  escrowGetBalance,
  escrowGetVerifier,
  registryGetChannel,
  registryHasChannel,
  verifierVerify,
  type ChannelEntry,
  type VerifierProof,
  type VerifierPublicSignals,
} from "./contracts.js";

export { SorobanSimulationError } from "./internal.js";

export { Client as MeteredVerifierClient } from "./bindings/meteredverifier/src/index.js";
export { Client as SlateEscrowClient } from "./bindings/slate-escrow/src/index.js";
export { Client as SlateAgentRegistryClient } from "./bindings/slate-agent-registry/src/index.js";
