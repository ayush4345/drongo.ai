/** Runtime config for the provider's x402 HTTP server (read from env). */
export interface ProviderServerConfig {
  port: number;
  network: string;
  /** SEP-41 token contract accepted for payment (default: testnet USDC). */
  asset: string;
  /** Stellar account that receives settlement. */
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
    network: env.X402_NETWORK ?? "stellar:testnet",
    asset: env.X402_ASSET ?? "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
    payTo: env.X402_PAY_TO ?? "GDRONGO_PROVIDER_DEMO",
    rate: env.RATE ?? "0.0001",
    maxAmount: env.X402_MAX_AMOUNT ?? "100000000",
    mockX402: (env.MOCK_X402 ?? "true") !== "false",
    facilitatorUrl: env.X402_FACILITATOR_URL ?? "http://localhost:4023",
  };
}
