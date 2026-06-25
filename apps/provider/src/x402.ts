import {
  rateCommitment,
  type X402PaymentTerms,
  X402PaymentTermsSchema,
} from "@slate/protocol";

import type { ProviderConfig } from "./config.js";

export type PaymentRequiredTask = {
  taskId: string;
  state: "input-required";
  message: string;
  payment: X402PaymentTerms;
};

export function buildOpenChannelPaymentTerms(
  config: ProviderConfig,
): X402PaymentTerms {
  return X402PaymentTermsSchema.parse({
    scheme: "exact",
    network: config.X402_NETWORK,
    payTo: config.X402_PAY_TO,
    resource: "/agent/open",
    escrowAmount: config.SLATE_ESCROW_AMOUNT,
    unitPrice: config.SLATE_UNIT_PRICE,
    rateCommitment: rateCommitment(
      config.SLATE_ESCROW_AMOUNT,
      config.SLATE_UNIT_PRICE,
    ),
  });
}

export function buildPaymentRequiredTask(config: ProviderConfig): PaymentRequiredTask {
  return {
    taskId: "open_channel_payment",
    state: "input-required",
    message: "x402 payment is required to open a metered channel.",
    payment: buildOpenChannelPaymentTerms(config),
  };
}

export function hasPaymentSignature(headers: Headers | Record<string, unknown>): boolean {
  if (headers instanceof Headers) {
    return headers.has("payment-signature");
  }

  return Object.keys(headers).some(
    (name) => name.toLowerCase() === "payment-signature",
  );
}
