import type { PaymentRequirements } from "@slate/protocol";

import type { ProviderConfig } from "./config.js";

export type VerifyResult =
  | { ok: true; settlementTx: string }
  | { ok: false; reason: string };

/**
 * Verifies (and settles) an x402 payment before a channel is opened. This is
 * the seam the route depends on instead of trusting a header's mere presence.
 */
export interface PaymentVerifier {
  verifyAndSettle(
    payment: string,
    requirements: PaymentRequirements,
  ): Promise<VerifyResult>;
}

/**
 * Local/demo verifier (MOCK_X402=true). It does NOT verify a real on-chain
 * payment — it only confirms a non-empty proof was supplied — so it is honest
 * about being a stand-in. Use FacilitatorPaymentVerifier for real settlement.
 */
export class MockPaymentVerifier implements PaymentVerifier {
  async verifyAndSettle(payment: string): Promise<VerifyResult> {
    if (typeof payment !== "string" || payment.trim().length === 0) {
      return { ok: false, reason: "missing-payment" };
    }
    const tag = Buffer.from(payment).toString("hex").slice(0, 12);
    return { ok: true, settlementTx: `mock_settle_${tag}` };
  }
}

/**
 * Real x402 verification + settlement via an external facilitator (Coinbase /
 * OpenZeppelin style): POST the payment payload + requirements to `/verify`,
 * then `/settle` to broadcast the USDC SEP-41 transfer on Stellar. Requires a
 * running facilitator at X402_FACILITATOR_URL; selected when MOCK_X402=false.
 */
export class FacilitatorPaymentVerifier implements PaymentVerifier {
  constructor(private readonly facilitatorUrl: string) {}

  async verifyAndSettle(
    payment: string,
    requirements: PaymentRequirements,
  ): Promise<VerifyResult> {
    const base = this.facilitatorUrl.replace(/\/$/, "");
    const body = JSON.stringify({
      x402Version: 1,
      paymentPayload: payment,
      paymentRequirements: requirements,
    });

    try {
      const verifyRes = await fetch(`${base}/verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      });
      const verify = (await verifyRes.json().catch(() => ({}))) as {
        isValid?: boolean;
        invalidReason?: string;
      };
      if (!verifyRes.ok || verify.isValid !== true) {
        return { ok: false, reason: verify.invalidReason ?? `verify-failed-${verifyRes.status}` };
      }

      const settleRes = await fetch(`${base}/settle`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      });
      const settle = (await settleRes.json().catch(() => ({}))) as {
        success?: boolean;
        txHash?: string;
        errorReason?: string;
      };
      if (!settleRes.ok || settle.success !== true) {
        return { ok: false, reason: settle.errorReason ?? `settle-failed-${settleRes.status}` };
      }

      return { ok: true, settlementTx: settle.txHash ?? "settled" };
    } catch (error) {
      return { ok: false, reason: `facilitator-unreachable: ${(error as Error).message}` };
    }
  }
}

/** Pick the verifier based on config: mock for demos, facilitator for real. */
export function createPaymentVerifier(config: ProviderConfig): PaymentVerifier {
  return config.MOCK_X402
    ? new MockPaymentVerifier()
    : new FacilitatorPaymentVerifier(config.X402_FACILITATOR_URL);
}
