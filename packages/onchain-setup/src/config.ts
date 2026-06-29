/** Deployed Soroban contract IDs and RPC settings for TypeScript clients. */
export interface SorobanConfig {
  rpcUrl: string;
  networkPassphrase: string;
  meteredVerifierId: string;
  slateEscrowId: string;
  slateAgentRegistryId: string;
}

export const SOROBAN_TESTNET: Pick<SorobanConfig, "rpcUrl" | "networkPassphrase"> = {
  rpcUrl: "https://soroban-testnet.stellar.org",
  networkPassphrase: "Test SDF Network ; September 2015",
};

/** Merge testnet defaults with deployed contract IDs from the environment. */
export function sorobanConfigFromEnv(
  overrides: Partial<SorobanConfig> = {},
): SorobanConfig {
  return {
    ...SOROBAN_TESTNET,
    meteredVerifierId: process.env.STELLAR_METERED_VERIFIER_ID ?? "",
    slateEscrowId: process.env.STELLAR_SLATE_ESCROW_ID ?? "",
    slateAgentRegistryId: process.env.STELLAR_SLATE_AGENT_REGISTRY_ID ?? "",
    ...overrides,
  };
}

export function assertSorobanConfig(config: SorobanConfig): void {
  if (!config.meteredVerifierId) {
    throw new Error("SorobanConfig.meteredVerifierId is required");
  }
  if (!config.slateEscrowId) {
    throw new Error("SorobanConfig.slateEscrowId is required");
  }
  if (!config.slateAgentRegistryId) {
    throw new Error("SorobanConfig.slateAgentRegistryId is required");
  }
}
