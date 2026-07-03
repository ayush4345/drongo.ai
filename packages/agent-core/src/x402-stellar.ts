import { wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import type { Network } from "@x402/core/types";
import {
  createEd25519Signer,
  STELLAR_TESTNET_CAIP2,
  type ClientStellarSigner,
  type RpcConfig,
} from "@x402/stellar";
import { ExactStellarScheme } from "@x402/stellar/exact/client";

export type FetchLike = typeof fetch;

export interface StellarX402FetchOptions {
  fetchImpl?: FetchLike;
  network?: Network;
  rpcConfig?: RpcConfig;
}

/** Build an x402-aware fetch that signs Stellar auth entries on HTTP 402. */
export function createStellarX402Fetch(
  signer: ClientStellarSigner,
  options: StellarX402FetchOptions = {},
): FetchLike {
  const network = options.network ?? (STELLAR_TESTNET_CAIP2 as Network);
  const fetchImpl = options.fetchImpl ?? fetch;
  const scheme = new ExactStellarScheme(signer, options.rpcConfig);
  return wrapFetchWithPaymentFromConfig(fetchImpl, {
    schemes: [{ network, client: scheme }],
  });
}

/** Server-side signer from a Stellar secret key (S…). */
export function createKeypairX402Signer(
  secretKey: string,
  network: Network = STELLAR_TESTNET_CAIP2 as Network,
): ClientStellarSigner {
  return createEd25519Signer(secretKey, network);
}

export { STELLAR_TESTNET_CAIP2, USDC_TESTNET_ADDRESS } from "@x402/stellar";
export type { ClientStellarSigner };
