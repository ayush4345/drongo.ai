import { createHash } from "node:crypto";
import {
  baseConfigFromEnv,
  assertBaseConfig,
  BASE_SEPOLIA_USDC_ADDRESS,
} from "@drongo/onchain-setup";
import { evmAddressToPayload } from "@drongo/proving-setup";
import { accountFromPrivateKey, BaseChainClient } from "./base.js";
import type { ChainClient } from "./chain.js";

/** A real, configured chain client plus the 32-byte address payloads it binds. */
export interface RealChainSetup {
  chain: ChainClient;
  /** 32-byte payloads — fed into BOTH the settlement proof and the chain calls. */
  depositorPayload: Uint8Array;
  providerPayload: Uint8Array;
  tokenPayload: Uint8Array;
  /** The settlement token contract address (0x…). */
  tokenId: string;
  /** Human-readable summary of the bound addresses, for logging. */
  label: string;
}

/**
 * Convert a provider-advertised address into the 32-byte payload the settlement
 * proof binds. Accepts:
 *  - EVM `0x` address (20 bytes) → left-padded 32-byte payload (Option A)
 *  - anything else → deterministic SHA-256 (offline demo placeholders)
 */
export function addressToPayload(address: string): Uint8Array {
  if (/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return evmAddressToPayload(address);
  }
  return Uint8Array.from(createHash("sha256").update(address).digest());
}

/** Which settlement backend `realChainFromEnv` selected, if any. */
export type SettlementBackend = "base";

export function settlementBackendFromEnv(env: NodeJS.ProcessEnv = process.env): SettlementBackend | null {
  return env.EVM_PRIVATE_KEY ? "base" : null;
}

/**
 * Build a {@link BaseChainClient} when `EVM_PRIVATE_KEY` is set.
 * Returns `null` for offline mock mode.
 */
export function realChainFromEnv(env: NodeJS.ProcessEnv = process.env): RealChainSetup | null {
  return realBaseChainFromEnv(env);
}

/**
 * Build a {@link BaseChainClient} from env, or `null` when `EVM_PRIVATE_KEY` is unset.
 *
 * Env:
 *  - `EVM_PRIVATE_KEY`           depositor EOA (0x…)
 *  - `BASE_RPC_URL`, `BASE_CHAIN_ID`
 *  - `BASE_SLATE_ESCROW_ADDRESS`, `BASE_SLATE_AGENT_REGISTRY_ADDRESS`,
 *    `BASE_SETTLEMENT_VERIFIER_ADDRESS` (or `BASE_METERED_VERIFIER_ADDRESS`)
 *  - `PROVIDER_ADDRESS`          provider EOA (0x…); defaults to depositor
 *  - `SETTLEMENT_TOKEN_ID` / `BASE_USDC_ADDRESS`  ERC-20; defaults to Base Sepolia USDC
 */
export function realBaseChainFromEnv(env: NodeJS.ProcessEnv = process.env): RealChainSetup | null {
  const privateKey = env.EVM_PRIVATE_KEY;
  if (!privateKey) return null;

  const config = baseConfigFromEnv({}, env);
  assertBaseConfig(config);

  const account = accountFromPrivateKey(privateKey);
  const depositor = account.address;
  const provider = (env.PROVIDER_ADDRESS ?? env.PROVIDER_PUBLIC ?? depositor) as `0x${string}`;
  if (!/^0x[0-9a-fA-F]{40}$/.test(provider)) {
    throw new Error(`PROVIDER_ADDRESS must be a 0x EVM address, received "${provider}"`);
  }

  const tokenId = (env.SETTLEMENT_TOKEN_ID ??
    env.BASE_USDC_ADDRESS ??
    env.USDC_TOKEN_ID ??
    BASE_SEPOLIA_USDC_ADDRESS) as `0x${string}`;
  if (!/^0x[0-9a-fA-F]{40}$/.test(tokenId)) {
    throw new Error(`SETTLEMENT_TOKEN_ID must be a 0x ERC-20 address, received "${tokenId}"`);
  }

  const chain = new BaseChainClient({ config, account });

  return {
    chain,
    depositorPayload: evmAddressToPayload(depositor),
    providerPayload: evmAddressToPayload(provider),
    tokenPayload: evmAddressToPayload(tokenId),
    tokenId,
    label: `base depositor=${depositor.slice(0, 8)}… provider=${provider.slice(0, 8)}… token=${tokenId.slice(0, 8)}…`,
  };
}
