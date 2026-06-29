import { Keypair, Address } from "@stellar/stellar-sdk";
import { sorobanConfigFromEnv, assertSorobanConfig } from "@drongo/onchain-setup";
import { SorobanChainClient } from "./chain.js";
import type { ChainClient } from "./chain.js";

/** Stellar testnet USDC SEP-41 contract (the default settlement asset). */
export const USDC_TESTNET_CONTRACT_ID =
  "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA";

/** A real, configured chain client plus the 32-byte address payloads it binds. */
export interface RealChainSetup {
  chain: ChainClient;
  /** 32-byte payloads — fed into BOTH the settlement proof and the chain calls. */
  depositorPayload: Uint8Array;
  providerPayload: Uint8Array;
  tokenPayload: Uint8Array;
  /** Human-readable summary of the bound addresses, for logging. */
  label: string;
}

/** Strkey (G…/C…) → its raw 32-byte payload (the form the proof binds). */
function strkeyToPayload(strkey: string): Uint8Array {
  return Uint8Array.from(Address.fromString(strkey).toBuffer());
}

/**
 * Build a real {@link SorobanChainClient} and the address payloads it binds from
 * the environment, or return `null` when no `DEPOSITOR_SECRET` is set so callers
 * fall back to a `MockChainClient`.
 *
 * Setting `DEPOSITOR_SECRET` is the "go real" signal; the deployed contract IDs
 * are then required (an absent one throws a clear error via `assertSorobanConfig`).
 *
 * Env:
 *  - `DEPOSITOR_SECRET`        Stellar secret (S…) that funds escrow + signs txs.
 *  - `STELLAR_SLATE_ESCROW_ID`, `STELLAR_SLATE_AGENT_REGISTRY_ID`,
 *    `STELLAR_METERED_VERIFIER_ID`  deployed contract IDs (read by sorobanConfigFromEnv).
 *  - `PROVIDER_PUBLIC`         provider account (G…); defaults to the depositor.
 *  - `USDC_TOKEN_ID`          SEP-41 token (C…); defaults to testnet USDC.
 *  - `SOROBAN_RPC_URL`, `SOROBAN_NETWORK_PASSPHRASE`  optional RPC overrides.
 */
export function realChainFromEnv(env: NodeJS.ProcessEnv = process.env): RealChainSetup | null {
  const secret = env.DEPOSITOR_SECRET;
  if (!secret) return null;

  const config = sorobanConfigFromEnv({
    ...(env.SOROBAN_RPC_URL ? { rpcUrl: env.SOROBAN_RPC_URL } : {}),
    ...(env.SOROBAN_NETWORK_PASSPHRASE ? { networkPassphrase: env.SOROBAN_NETWORK_PASSPHRASE } : {}),
  });
  assertSorobanConfig(config);

  const depositorKeypair = Keypair.fromSecret(secret);
  const depositorPublic = depositorKeypair.publicKey();
  const providerPublic = env.PROVIDER_PUBLIC ?? depositorPublic;
  const tokenId = env.USDC_TOKEN_ID ?? USDC_TESTNET_CONTRACT_ID;

  const chain = new SorobanChainClient({
    config,
    depositorKeypair,
    addressKinds: { depositor: "account", provider: "account", token: "contract" },
  });

  return {
    chain,
    depositorPayload: strkeyToPayload(depositorPublic),
    providerPayload: strkeyToPayload(providerPublic),
    tokenPayload: strkeyToPayload(tokenId),
    label: `depositor=${depositorPublic.slice(0, 6)}… provider=${providerPublic.slice(0, 6)}… token=${tokenId.slice(0, 6)}…`,
  };
}
