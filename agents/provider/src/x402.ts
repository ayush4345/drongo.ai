import type { ProviderServerConfig } from "./config.js";

/** Read the client's x402 payment proof from request headers. */
export function readPaymentHeader(headers: Record<string, unknown>): string | null {
  const get = (name: string): string | null => {
    const key = Object.keys(headers).find((h) => h.toLowerCase() === name);
    const value = key === undefined ? undefined : headers[key];
    return typeof value === "string" ? value : null;
  };
  return get("payment-signature") ?? get("x-payment");
}

/** Absolute URL for the open endpoint (used in x402 resource metadata). */
export function openResourceUrl(config: ProviderServerConfig, reqHost?: string): string {
  const host = reqHost ?? `localhost:${config.port}`;
  return `http://${host}/agent/open`;
}
