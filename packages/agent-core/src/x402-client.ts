import { decodePaymentSignatureHeader } from "@x402/core/http";
import type { ClientStellarSigner } from "@x402/stellar";
import { createStellarX402Fetch, type FetchLike } from "./x402-stellar.js";

export type { FetchLike };

export interface PaidFetchInput {
  url: string;
  init?: RequestInit;
  fetchImpl?: FetchLike;
  /** Stellar signer used to satisfy x402 `402` responses (auth-entry signing). */
  signer?: ClientStellarSigner;
  /** Pre-built `PAYMENT-SIGNATURE` / `X-PAYMENT` header from a browser wallet. */
  paymentHeader?: string;
}

function headersToRecord(headers: RequestInit["headers"]): Record<string, string> {
  if (headers === undefined) return {};
  if (headers instanceof Headers) return Object.fromEntries(headers.entries());
  if (Array.isArray(headers)) return Object.fromEntries(headers);
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === "string") out[key] = value;
  }
  return out;
}

/**
 * x402 client for Stellar: retries once on `402` with a signed payment header.
 * Uses `@x402/fetch` + `ExactStellarScheme` when a signer is provided, or forwards
 * a wallet-built payment header when supplied from the browser.
 */
export async function fetchWithManualX402({
  url,
  init,
  fetchImpl = fetch,
  signer,
  paymentHeader,
}: PaidFetchInput): Promise<Response> {
  if (paymentHeader !== undefined && paymentHeader.trim().length > 0) {
    const first = await fetchImpl(url, init);
    if (first.status !== 402) return first;
    return fetchImpl(url, {
      ...init,
      headers: {
        ...headersToRecord(init?.headers),
        "PAYMENT-SIGNATURE": paymentHeader,
        "X-PAYMENT": paymentHeader,
      },
    });
  }

  if (signer === undefined) {
    throw new Error("x402 payment requires a Stellar signer or a pre-built payment header");
  }

  const paidFetch = createStellarX402Fetch(signer, { fetchImpl });
  return paidFetch(url, init);
}

/** Decode a base64 x402 payment header into a structured payload (for server-side verify). */
export { decodePaymentSignatureHeader };
