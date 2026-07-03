"use client";

import { x402Client } from "@x402/core/client";
import { decodePaymentRequiredHeader } from "@x402/core/http";
import type { ClientStellarSigner } from "@x402/stellar";
import { STELLAR_TESTNET_CAIP2 } from "@x402/stellar";
import { ExactStellarScheme } from "@x402/stellar/exact/client";

export interface OpenChannelPayload {
  channelId: string;
  consumerPublicKey: { x: string; y: string };
  rate: string;
  escrow: string;
}

/**
 * Request a 402 from the provider, sign the x402 payment with the connected wallet,
 * and return the base64 payment header for POST /session/open.
 */
export async function buildWalletOpenPaymentHeader(
  providerUrl: string,
  signer: ClientStellarSigner,
  openPayload: OpenChannelPayload,
): Promise<string> {
  const base = providerUrl.replace(/\/$/, "");
  const first = await fetch(`${base}/agent/open`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(openPayload),
  });

  if (first.status !== 402) {
    throw new Error(`expected HTTP 402 from provider, got ${first.status}`);
  }

  const paymentRequiredHeader = first.headers.get("payment-required");
  if (!paymentRequiredHeader) {
    const body = (await first.json()) as { x402Version?: number };
    if (body.x402Version !== 2) {
      throw new Error("provider did not return x402 v2 payment requirements");
    }
    throw new Error("missing PAYMENT-REQUIRED header from provider");
  }

  const paymentRequired = decodePaymentRequiredHeader(paymentRequiredHeader);
  const requirements = paymentRequired.accepts[0];
  if (requirements === undefined) {
    throw new Error("provider returned no acceptable payment requirements");
  }

  const scheme = new ExactStellarScheme(signer);
  let paymentPayload;
  try {
    paymentPayload = await scheme.createPaymentPayload(paymentRequired.x402Version, requirements);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("trustline")) {
      throw new Error(
        "Wallet is missing a trustline for the payment token. " +
          "Fund testnet XLM via friendbot, or add a USDC trustline if the provider charges USDC.",
      );
    }
    if (message.includes("simulation failed")) {
      throw new Error(
        `${message} — ensure Freighter is on testnet with enough balance for the channel-open fee.`,
      );
    }
    throw error;
  }
  const httpClient = new (await import("@x402/core/client")).x402HTTPClient(
    new x402Client().register(requirements.network ?? STELLAR_TESTNET_CAIP2, scheme),
  );
  const headers = httpClient.encodePaymentSignatureHeader({
    x402Version: paymentRequired.x402Version,
    payload: paymentPayload.payload,
    accepted: requirements,
  });
  const header = headers["PAYMENT-SIGNATURE"] ?? headers["X-PAYMENT"];
  if (!header) {
    throw new Error("failed to encode x402 payment header");
  }
  return header;
}
