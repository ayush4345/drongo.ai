export type FetchLike = typeof fetch;

export type PaidFetchInput = {
  url: string;
  init?: RequestInit;
  fetchImpl?: FetchLike;
  paymentSignature?: string;
};

/**
 * Minimal x402 client: make the request, and if it returns 402, retry once with
 * a base64 `X-PAYMENT` header per the x402 spec. For local/demo runs the payload
 * carries a mock authorization; a real Stellar signature/authorization goes in
 * `payload` once a facilitator is wired in.
 */
export async function fetchWithManualX402({
  url,
  init,
  fetchImpl = fetch,
  paymentSignature = "mock_payment_signature",
}: PaidFetchInput): Promise<Response> {
  const firstResponse = await fetchImpl(url, init);

  if (firstResponse.status !== 402) {
    return firstResponse;
  }

  await firstResponse.json().catch(() => undefined);

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
    headers: {
      ...headersToRecord(init?.headers),
      "X-PAYMENT": xPayment,
    },
  });
}

function headersToRecord(headers: HeadersInit | undefined): Record<string, string> {
  if (headers === undefined) {
    return {};
  }

  return Object.fromEntries(new Headers(headers).entries());
}
