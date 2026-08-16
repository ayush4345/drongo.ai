import { randomBytes } from "node:crypto";
import { privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";

export type FetchLike = typeof fetch;

export interface PaidFetchInput {
  url: string;
  init?: RequestInit;
  fetchImpl?: FetchLike;
  /** Payment authorization / signature to present on the retry. */
  paymentSignature?: string;
}

/** x402 `exact` EIP-3009 authorization (Base / USDC). */
export interface ExactPaymentAuthorization {
  from: string;
  to: string;
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: string;
}

/** Wire shape of an x402 v1 `exact` payment (base64-encoded as `X-PAYMENT`). */
export interface ExactX402Payment {
  x402Version: 1;
  scheme: "exact";
  network: string;
  payload: {
    signature: string;
    authorization: ExactPaymentAuthorization;
  };
}

export interface BuildExactX402PaymentInput {
  network?: string;
  from?: string;
  to?: string;
  value?: string;
  signature?: string;
}

/** Build an x402 v1 `exact` payment object (unsigned / mock signature by default). */
export function buildExactX402Payment(input: BuildExactX402PaymentInput = {}): ExactX402Payment {
  const now = Math.floor(Date.now() / 1000);
  return {
    x402Version: 1,
    scheme: "exact",
    network: input.network ?? process.env.X402_NETWORK ?? "base-sepolia",
    payload: {
      signature: input.signature ?? "0x",
      authorization: {
        from: input.from ?? "0x0000000000000000000000000000000000000000",
        to: input.to ?? process.env.X402_PAY_TO ?? "0x0000000000000000000000000000000000000001",
        value: input.value ?? process.env.X402_MAX_AMOUNT ?? "100000000",
        validAfter: "0",
        validBefore: String(now + 600),
        nonce: `0x${randomBytes(32).toString("hex")}`,
      },
    },
  };
}

export function encodeX402PaymentHeader(payment: ExactX402Payment): string {
  return Buffer.from(JSON.stringify(payment)).toString("base64");
}

export interface SignExactX402PaymentInput {
  privateKey: Hex | string;
  network?: string;
  chainId: number;
  asset: `0x${string}`;
  to: `0x${string}`;
  value: bigint;
  from?: `0x${string}`;
}

/**
 * Sign an EIP-3009 `TransferWithAuthorization` for Circle USDC and wrap it as
 * an x402 `exact` payment. Used when `MOCK_X402=false` against a facilitator.
 */
export async function signExactX402Payment(input: SignExactX402PaymentInput): Promise<ExactX402Payment> {
  const key = (input.privateKey.startsWith("0x") ? input.privateKey : `0x${input.privateKey}`) as Hex;
  const account = privateKeyToAccount(key);
  const from = input.from ?? account.address;
  const nonce = `0x${randomBytes(32).toString("hex")}` as Hex;
  const validAfter = 0n;
  const validBefore = BigInt(Math.floor(Date.now() / 1000) + 600);

  const signature = await account.signTypedData({
    domain: {
      name: "USD Coin",
      version: "2",
      chainId: input.chainId,
      verifyingContract: input.asset,
    },
    types: {
      TransferWithAuthorization: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" },
        { name: "nonce", type: "bytes32" },
      ],
    },
    primaryType: "TransferWithAuthorization",
    message: {
      from,
      to: input.to,
      value: input.value,
      validAfter,
      validBefore,
      nonce,
    },
  });

  return {
    x402Version: 1,
    scheme: "exact",
    network: input.network ?? process.env.X402_NETWORK ?? "base-sepolia",
    payload: {
      signature,
      authorization: {
        from,
        to: input.to,
        value: input.value.toString(),
        validAfter: validAfter.toString(),
        validBefore: validBefore.toString(),
        nonce,
      },
    },
  };
}

/**
 * Minimal x402 client: make the request, and if it comes back `402`, retry once
 * with a base64 `X-PAYMENT` header per the x402 `exact` scheme (Base / USDC).
 * Local/demo runs send an unsigned exact payload; `signExactX402Payment` produces
 * a facilitator-ready EIP-3009 authorization when `EVM_PRIVATE_KEY` is set.
 */
export async function fetchWithManualX402({
  url,
  init,
  fetchImpl = fetch,
  paymentSignature = "0x",
  network = process.env.X402_NETWORK ?? "base-sepolia",
}: PaidFetchInput & { network?: string }): Promise<Response> {
  const first = await fetchImpl(url, init);
  if (first.status !== 402) return first;

  await first.json().catch(() => undefined);

  const xPayment = encodeX402PaymentHeader(
    buildExactX402Payment({ network, signature: paymentSignature }),
  );

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

/**
 * The x402 payment requirements a provider advertises in its `402` response
 * (`accepts[0]`). `rate` is a Drongo extension: the provider's per-unit price in
 * the settlement token's decimal units, which the consumer accepts as the
 * channel rate.
 */
export interface X402Requirements {
  scheme?: string;
  network?: string;
  maxAmountRequired?: string;
  resource?: string;
  description?: string;
  mimeType?: string;
  payTo?: string;
  asset?: string;
  rate?: string;
  maxTimeoutSeconds?: number;
}

/**
 * Discover a provider's x402 payment requirements by making an UNPAID request
 * and reading `accepts[0]` from the `402` response. Returns undefined when the
 * endpoint does not answer with 402 (e.g. it isn't x402-gated). This is how the
 * consumer learns the provider's rate, settlement address and asset before
 * agreeing to open a channel.
 */
export async function discoverX402Requirements(
  url: string,
  fetchImpl: FetchLike = fetch,
): Promise<X402Requirements | undefined> {
  const res = await fetchImpl(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ probe: true }),
  });
  if (res.status !== 402) {
    await res.json().catch(() => undefined);
    return undefined;
  }
  const body = (await res.json().catch(() => ({}))) as { accepts?: X402Requirements[] };
  return body.accepts?.[0];
}
