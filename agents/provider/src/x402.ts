import type { ProviderServerConfig } from "./config.js";

/** x402 `exact`-scheme payment requirements for opening a metered channel. */
export interface PaymentRequirements {
  scheme: "exact";
  network: string;
  maxAmountRequired: string;
  resource: string;
  description: string;
  mimeType: string;
  payTo: string;
  asset: string;
  maxTimeoutSeconds: number;
}

/** The HTTP 402 body: x402 version + the accepted payment requirements. */
export interface PaymentRequiredResponse {
  x402Version: 1;
  accepts: PaymentRequirements[];
  error: string;
}

export function buildPaymentRequirements(config: ProviderServerConfig): PaymentRequirements {
  return {
    scheme: "exact",
    network: config.network,
    maxAmountRequired: config.maxAmount,
    resource: "/agent/open",
    description: "Open a metered Drongo channel; escrow funds pay-per-call usage.",
    mimeType: "application/json",
    payTo: config.payTo,
    asset: config.asset,
    maxTimeoutSeconds: 120,
  };
}

export function build402Response(config: ProviderServerConfig): PaymentRequiredResponse {
  return {
    x402Version: 1,
    accepts: [buildPaymentRequirements(config)],
    error: "x402 payment is required to open a metered channel.",
  };
}

/**
 * Read the client's payment proof from request headers. Prefers the spec
 * `X-PAYMENT` header; falls back to the legacy `PAYMENT-SIGNATURE`. Returns null
 * when no proof is present.
 */
export function readPaymentHeader(headers: Record<string, unknown>): string | null {
  const get = (name: string): string | null => {
    const key = Object.keys(headers).find((h) => h.toLowerCase() === name);
    const value = key === undefined ? undefined : headers[key];
    return typeof value === "string" ? value : null;
  };
  return get("x-payment") ?? get("payment-signature");
}
