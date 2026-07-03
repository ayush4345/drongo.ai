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

/** Default deployed Slate contract IDs on Stellar testnet. */
export const SLATE_TESTNET_CONTRACTS = {
  escrow: "CBQI5U6HJASS7IZFNY2PLZABP2CN5FC6MNJSI2T5DJG6CRZQUYKS3ENM",
  registry: "CD6RIA3ZWJOI5RRJBCCPNGELMU3ZIS5XHRZDRMRWOP7EYUEIWI7JV5RR",
  verifier: "CDBBAWXK53KQO3BHCZLMFWMEEVPKG4I4NLCNYG7GGWUDD6QSECUPRTJR",
} as const;

/** Merge testnet defaults with deployed contract IDs from the environment. */
export function sorobanConfigFromEnv(
  overrides: Partial<SorobanConfig> = {},
): SorobanConfig {
  return {
    ...SOROBAN_TESTNET,
    meteredVerifierId: process.env.STELLAR_METERED_VERIFIER_ID ?? SLATE_TESTNET_CONTRACTS.verifier,
    slateEscrowId: process.env.STELLAR_SLATE_ESCROW_ID ?? SLATE_TESTNET_CONTRACTS.escrow,
    slateAgentRegistryId:
      process.env.STELLAR_SLATE_AGENT_REGISTRY_ID ?? SLATE_TESTNET_CONTRACTS.registry,
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
