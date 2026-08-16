/** Runtime config for the provider's x402 HTTP server (read from env). */
export interface ProviderServerConfig {
  port: number;
  network: string;
  /** ERC-20 token accepted for payment (default: Base Sepolia USDC). */
  asset: string;
  /** Payout address advertised in the 402 (`0x…`). */
  payTo: string;
  /**
   * The provider's per-unit rate in the settlement token's DECIMAL units
   * (e.g. "0.0001"). This is the source of truth: it is advertised in the 402
   * terms and used to meter every call. The consumer accepts it — it no longer
   * sends its own rate.
   */
  rate: string;
  /** Max amount (atomic units) advertised in the 402 terms. */
  maxAmount: string;
  /** When true, use the MockPaymentVerifier (no real facilitator). */
  mockX402: boolean;
  facilitatorUrl: string;
}

export function readProviderServerConfig(env: NodeJS.ProcessEnv = process.env): ProviderServerConfig {
  return {
    // NOTE: PORT is a SHARED key — the consumer server reads it too (as a
    // fallback after CONSUMER_PORT). In the shared root .env, leave PORT unset
    // and rely on this 4021 default; set CONSUMER_PORT for the consumer.
    // A bare PORT= in the shared file would make both servers bind the same port.
    port: Number(env.PORT ?? "4021"),
    network: env.X402_NETWORK ?? "base-sepolia",
    asset: env.X402_ASSET ?? "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    payTo: env.X402_PAY_TO ?? "0x0000000000000000000000000000000000000001",
    rate: env.RATE ?? "0.0001",
    maxAmount: env.X402_MAX_AMOUNT ?? "100000000",
    mockX402: (env.MOCK_X402 ?? "true") !== "false",
    facilitatorUrl: env.X402_FACILITATOR_URL ?? "https://x402.org/facilitator",
  };
}
