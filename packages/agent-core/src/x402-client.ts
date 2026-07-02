export type FetchLike = typeof fetch;

export interface PaidFetchInput {
  url: string;
  init?: RequestInit;
  fetchImpl?: FetchLike;
  /** Payment authorization to present on the retry. Mock value by default. */
  paymentSignature?: string;
}

/**
 * Minimal x402 client: make the request, and if it comes back `402`, retry once
 * with a base64 `X-PAYMENT` header per the x402 spec. For local/demo runs the
 * payload carries a mock authorization; a real Stellar Soroban-auth entry would
 * go in `payload` once a facilitator is wired in.
 */
export async function fetchWithManualX402({
  url,
  init,
  fetchImpl = fetch,
  paymentSignature = "mock_payment_signature",
}: PaidFetchInput): Promise<Response> {
  const first = await fetchImpl(url, init);
  if (first.status !== 402) return first;

  await first.json().catch(() => undefined);

  const xPayment = Buffer.from(
    JSON.stringify({
      x402Version: 1,
      scheme: "exact",
      network: "stellar:testnet",
      payload: { authorization: paymentSignature },
    }),
  ).toString("base64");

  return fetchImpl(url, {
    ...init,
    headers: { ...headersToRecord(init?.headers as HeaderInput), "X-PAYMENT": xPayment },
  });
}

type HeaderInput = Record<string, string> | Array<[string, string]> | undefined;

function headersToRecord(headers: HeaderInput): Record<string, string> {
  if (headers === undefined) return {};
  if (Array.isArray(headers)) return Object.fromEntries(headers);
  return headers;
}
