export type FetchLike = typeof fetch;

export type PaidFetchInput = {
  url: string;
  init?: RequestInit;
  fetchImpl?: FetchLike;
  paymentSignature?: string;
};

/** Retry a request after attaching a mock x402 PAYMENT-SIGNATURE header on HTTP 402. */
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

  return fetchImpl(url, {
    ...init,
    headers: {
      ...headersToRecord(init?.headers),
      "PAYMENT-SIGNATURE": paymentSignature,
    },
  });
}

function headersToRecord(headers: HeadersInit | undefined): Record<string, string> {
  if (headers === undefined) {
    return {};
  }

  return Object.fromEntries(new Headers(headers).entries());
}
