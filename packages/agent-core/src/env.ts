import { Keypair, Address, Asset } from "@stellar/stellar-sdk";
import { sorobanConfigFromEnv, assertSorobanConfig } from "@drongo/onchain-setup";
import { SorobanChainClient } from "./chain.js";
import type { ChainClient } from "./chain.js";

/** Stellar testnet USDC SEP-41 contract — an alternative settlement asset. */
export const USDC_TESTNET_CONTRACT_ID =
  "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA";

/** A real, configured chain client plus the 32-byte address payloads it binds. */
export interface RealChainSetup {
  chain: ChainClient;
  /** 32-byte payloads — fed into BOTH the settlement proof and the chain calls. */
  depositorPayload: Uint8Array;
  providerPayload: Uint8Array;
  tokenPayload: Uint8Array;
  /** The settlement token contract id (C…) being used. */
  tokenId: string;
  /** Human-readable summary of the bound addresses, for logging. */
  label: string;
  /** Network passphrase — used to build StellarExpert links. */
  networkPassphrase: string;
  /** Deployed contract IDs from the environment. */
  contracts: {
    escrow: string;
    registry: string;
    verifier: string;
  };
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
 * The settlement token defaults to **native XLM** (its Stellar Asset Contract,
 * derived per-network) — the escrow speaks the SEP-41 token interface, and the
 * native SAC implements it, so no trustline is needed and friendbot-funded
 * accounts work out of the box. Point it at USDC (or any SEP-41 SAC) via
 * `SETTLEMENT_TOKEN_ID`. NOTE: whichever token you use must be whitelisted in
 * the escrow (`whitelist_token`).
 *
 * Env:
 *  - `DEPOSITOR_SECRET`        Stellar secret (S…) that funds escrow + signs txs.
 *  - `STELLAR_SLATE_ESCROW_ID`, `STELLAR_SLATE_AGENT_REGISTRY_ID`,
 *    `STELLAR_METERED_VERIFIER_ID`  deployed contract IDs (read by sorobanConfigFromEnv).
 *  - `PROVIDER_PUBLIC`         provider account (G…); defaults to the depositor.
 *  - `SETTLEMENT_TOKEN_ID`    SEP-41 token contract (C…); defaults to native XLM's SAC.
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

  // Default settlement asset: native XLM, via its Stellar Asset Contract for the
  // configured network. Override with SETTLEMENT_TOKEN_ID (e.g. the USDC SAC).
  const tokenId =
    env.SETTLEMENT_TOKEN_ID ??
    env.USDC_TOKEN_ID ??
    Asset.native().contractId(config.networkPassphrase);

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
    tokenId,
    label: `depositor=${depositorPublic.slice(0, 6)}… provider=${providerPublic.slice(0, 6)}… token=${tokenId.slice(0, 6)}…`,
    networkPassphrase: config.networkPassphrase,
    contracts: {
      escrow: config.slateEscrowId,
      registry: config.slateAgentRegistryId,
      verifier: config.meteredVerifierId,
    },
  };
}
