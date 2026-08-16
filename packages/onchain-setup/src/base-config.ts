/** Base / EVM config for Slate contracts. */

export interface BaseConfig {
  rpcUrl: string;
  chainId: number;
  settlementVerifierAddress: `0x${string}`;
  slateEscrowAddress: `0x${string}`;
  slateAgentRegistryAddress: `0x${string}`;
}

/** Base Sepolia defaults — override via env after deploy. */
export const BASE_SEPOLIA = {
  rpcUrl: "https://sepolia.base.org",
  chainId: 84532,
} as const;

/** Native Circle USDC on Base mainnet. */
export const BASE_USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;

/** Circle USDC on Base Sepolia. */
export const BASE_SEPOLIA_USDC_ADDRESS = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const;

export function assertBaseConfig(config: BaseConfig): void {
  const required: Array<keyof BaseConfig> = [
    "rpcUrl",
    "settlementVerifierAddress",
    "slateEscrowAddress",
    "slateAgentRegistryAddress",
  ];
  for (const key of required) {
    const value = config[key];
    if (!value || (typeof value === "string" && !/^0x[0-9a-fA-F]{40}$/.test(value) && key !== "rpcUrl")) {
      throw new Error(`Base config missing or invalid ${key}`);
    }
  }
  if (!Number.isFinite(config.chainId) || config.chainId <= 0) {
    throw new Error(`Base config has invalid chainId: ${config.chainId}`);
  }
}

/**
 * Load Base contract addresses from env.
 *
 * Env:
 *  - `BASE_RPC_URL` (default Base Sepolia public RPC)
 *  - `BASE_CHAIN_ID` (default 84532)
 *  - `BASE_SETTLEMENT_VERIFIER_ADDRESS` / `BASE_METERED_VERIFIER_ADDRESS`
 *  - `BASE_SLATE_ESCROW_ADDRESS`
 *  - `BASE_SLATE_AGENT_REGISTRY_ADDRESS`
 */
export function baseConfigFromEnv(
  overrides: Partial<BaseConfig> = {},
  env: NodeJS.ProcessEnv = process.env,
): BaseConfig {
  const verifier =
    overrides.settlementVerifierAddress ??
    (env.BASE_SETTLEMENT_VERIFIER_ADDRESS as `0x${string}` | undefined) ??
    (env.BASE_METERED_VERIFIER_ADDRESS as `0x${string}` | undefined) ??
    ("0x" as `0x${string}`);

  return {
    rpcUrl: overrides.rpcUrl ?? env.BASE_RPC_URL ?? BASE_SEPOLIA.rpcUrl,
    chainId: overrides.chainId ?? Number(env.BASE_CHAIN_ID ?? BASE_SEPOLIA.chainId),
    settlementVerifierAddress: verifier,
    slateEscrowAddress:
      overrides.slateEscrowAddress ??
      ((env.BASE_SLATE_ESCROW_ADDRESS as `0x${string}` | undefined) ?? ("0x" as `0x${string}`)),
    slateAgentRegistryAddress:
      overrides.slateAgentRegistryAddress ??
      ((env.BASE_SLATE_AGENT_REGISTRY_ADDRESS as `0x${string}` | undefined) ?? ("0x" as `0x${string}`)),
  };
}
