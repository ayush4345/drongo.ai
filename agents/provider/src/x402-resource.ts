import type { Network, Price } from "@x402/core/types";
import { encodePaymentRequiredHeader, decodePaymentSignatureHeader } from "@x402/core/http";
import { HTTPFacilitatorClient, x402ResourceServer } from "@x402/core/server";
import type { PaymentPayload, PaymentRequired, PaymentRequirements } from "@x402/core/types";
import { parseUnits } from "@drongo/agent-core";
import { STELLAR_TESTNET_CAIP2 } from "@x402/stellar";
import { ExactStellarScheme } from "@x402/stellar/exact/server";
import type { ProviderServerConfig } from "./config.js";

export interface OpenChannelPaymentContext {
  resourceUrl: string;
}

export interface SettledOpenPayment {
  settlementTx: string;
  paymentPayload: PaymentPayload;
  requirements: PaymentRequirements;
}

function facilitatorClient(config: ProviderServerConfig): HTTPFacilitatorClient {
  const apiKey = config.facilitatorApiKey;
  return new HTTPFacilitatorClient({
    url: config.facilitatorUrl,
    ...(apiKey
      ? {
          createAuthHeaders: async () => ({
            verify: { Authorization: `Bearer ${apiKey}` },
            settle: { Authorization: `Bearer ${apiKey}` },
            supported: { Authorization: `Bearer ${apiKey}` },
          }),
        }
      : {}),
  });
}

/** Shared x402 resource server for the provider's channel-open endpoint. */
export function createProviderX402Server(config: ProviderServerConfig): x402ResourceServer {
  return new x402ResourceServer(facilitatorClient(config)).register(
    config.network as Network,
    new ExactStellarScheme(),
  );
}

/** Convert a human-readable open price into stroops for the configured SEP-41 asset. */
function openPriceAsAssetAmount(config: ProviderServerConfig): Price {
  return {
    amount: parseUnits(config.openPrice).toString(),
    asset: config.asset,
  };
}

/** Build the HTTP 402 body + `PAYMENT-REQUIRED` header for channel open. */
export async function buildOpenChannelPaymentRequired(
  server: x402ResourceServer,
  config: ProviderServerConfig,
  context: OpenChannelPaymentContext,
): Promise<{ status: 402; body: PaymentRequired; headers: Record<string, string> }> {
  await server.initialize();

  const requirements = await server.buildPaymentRequirementsFromOptions(
    [
      {
        scheme: "exact",
        network: config.network as Network,
        payTo: config.payTo,
        price: openPriceAsAssetAmount(config),
        maxTimeoutSeconds: 120,
      },
    ],
    context,
  );

  const paymentRequired = await server.createPaymentRequiredResponse(
    requirements,
    {
      url: context.resourceUrl,
      description: "Open a metered Drongo channel; escrow funds pay-per-call usage.",
      mimeType: "application/json",
    },
    "x402 payment is required to open a metered channel.",
  );

  return {
    status: 402,
    body: paymentRequired,
    headers: {
      "PAYMENT-REQUIRED": encodePaymentRequiredHeader(paymentRequired),
      "Content-Type": "application/json",
    },
  };
}

/** Verify + settle an x402 payment header against the open-channel requirements. */
export async function settleOpenChannelPayment(
  server: x402ResourceServer,
  paymentHeader: string,
  requirements: PaymentRequirements,
): Promise<SettledOpenPayment> {
  const paymentPayload = decodePaymentSignatureHeader(paymentHeader);
  const verified = await server.verifyPayment(paymentPayload, requirements);
  if (!verified.isValid) {
    throw new Error(verified.invalidReason ?? "x402 payment verification failed");
  }

  const settled = await server.settlePayment(paymentPayload, requirements);
  if (!settled.success) {
    throw new Error(settled.errorReason ?? settled.errorMessage ?? "x402 settlement failed");
  }

  return {
    settlementTx: settled.transaction ?? "settled",
    paymentPayload,
    requirements,
  };
}

export { STELLAR_TESTNET_CAIP2, decodePaymentSignatureHeader };
