import {
  NATIVE_XLM_TESTNET_CONTRACT_ID,
  SLATE_TESTNET_PROVIDER_PUBLIC,
  X402_TESTNET_FACILITATOR_URL,
} from "@drongo/agent-core";
import { STELLAR_TESTNET_CAIP2 } from "@x402/stellar";

/** Runtime config for the provider's x402 HTTP server (read from env). */
export interface ProviderServerConfig {
  port: number;
  /** Allowed browser origin for CORS (Next.js dev server by default). */
  corsOrigin: string;
  network: string;
  /** SEP-41 token contract accepted for payment (default: native XLM SAC on testnet). */
  asset: string;
  /** Stellar account that receives the x402 channel-open payment. */
  payTo: string;
  /** Human-readable open price passed to the x402 server scheme (e.g. "0.01"). */
  openPrice: string;
  /** x402 facilitator base URL (verify / settle / supported). */
  facilitatorUrl: string;
  /** Optional Bearer token for the facilitator (OpenZeppelin Channels API key). */
  facilitatorApiKey?: string;
}

export function readProviderServerConfig(env: NodeJS.ProcessEnv = process.env): ProviderServerConfig {
  return {
    port: Number(env.PORT ?? "4021"),
    corsOrigin: env.CORS_ORIGIN ?? "http://localhost:3000",
    network: env.X402_NETWORK ?? STELLAR_TESTNET_CAIP2,
    asset: env.X402_ASSET ?? NATIVE_XLM_TESTNET_CONTRACT_ID,
    payTo: env.X402_PAY_TO ?? env.PROVIDER_PUBLIC ?? SLATE_TESTNET_PROVIDER_PUBLIC,
    openPrice: env.X402_OPEN_PRICE ?? env.ESCROW ?? "0.01",
    facilitatorUrl: env.X402_FACILITATOR_URL ?? X402_TESTNET_FACILITATOR_URL,
    facilitatorApiKey: env.X402_FACILITATOR_API_KEY,
  };
}
