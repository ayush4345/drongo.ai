import {
  parseDecimalToMicros,
  type PaymentRequirements,
  type PaymentRequiredResponse,
} from "@slate/protocol";

import type { ProviderConfig } from "./config.js";

export const X402_VERSION = 1 as const;

/**
 * Build the x402 `exact`-scheme PaymentRequirements that gate opening a metered
 * channel. `maxAmountRequired` is the escrow expressed in the asset's atomic
 * units (micro-USDC); `asset` is the USDC SEP-41 contract; the offered price is
 * a non-binding hint in `extra` (the binding on-chain rate commitment is the
 * consumer's Poseidon(rate, blind), supplied at open — never a plaintext value).
 */
export function buildPaymentRequirements(
  config: ProviderConfig,
): PaymentRequirements {
  return {
    scheme: "exact",
    network: config.X402_NETWORK,
    maxAmountRequired: parseDecimalToMicros(config.SLATE_ESCROW_AMOUNT).toString(),
    resource: "/agent/open",
    description: "Open a metered Drongo channel; escrow funds pay-per-call usage.",
    mimeType: "application/json",
    payTo: config.X402_PAY_TO,
    asset: config.X402_ASSET,
    maxTimeoutSeconds: 120,
    extra: {
      escrowAmount: config.SLATE_ESCROW_AMOUNT,
      unitPrice: config.SLATE_UNIT_PRICE,
    },
  };
}

/** The HTTP 402 body: x402 version + the accepted payment requirements. */
export function build402Response(config: ProviderConfig): PaymentRequiredResponse {
  return {
    x402Version: X402_VERSION,
    accepts: [buildPaymentRequirements(config)],
    error: "x402 payment is required to open a metered channel.",
  };
}

/**
 * Read the client's payment proof from the request headers. Prefers the x402
 * spec `X-PAYMENT` header; falls back to the legacy `PAYMENT-SIGNATURE` header
 * used by the in-repo agent client. Returns null when no proof is present.
 */
export function readPaymentHeader(
  headers: Headers | Record<string, unknown>,
): string | null {
  const get = (name: string): string | null => {
    if (headers instanceof Headers) {
      return headers.get(name);
    }
    const key = Object.keys(headers).find((h) => h.toLowerCase() === name);
    const value = key === undefined ? undefined : headers[key];
    return typeof value === "string" ? value : null;
  };

  return get("x-payment") ?? get("payment-signature");
}
