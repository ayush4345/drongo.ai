import { describe, expect, it } from "vitest";

import { DeterministicDevVoucherSigner } from "./vouchers.js";
import { buildWitnessBundle } from "./witness.js";

describe("witness bundle", () => {
  it("builds the fixed ShadowMeter demo scenario for T1", async () => {
    const signer = new DeterministicDevVoucherSigner("consumer-secret");
    const finalVoucher = await signer.signVoucher({
      channelId: "ch_demo",
      cumulativeUnits: "7431",
      nonce: "n_7431",
    });
    const bundle = buildWitnessBundle({
      channel: {
        channelId: "ch_demo",
        consumer: finalVoucher.consumerPubKey,
        provider: "mock_provider",
        escrowAmount: "20",
        unitPrice: "0.002",
        rateCommitment: "rate:v1:escrow=20;unit=0.002;max=10000",
        maxUnits: "10000",
        openedAt: new Date(0).toISOString(),
        chain: "mock",
        openTx: "mock_open_tx_ch_demo",
      },
      finalVoucher,
      consumerSecret: "consumer-secret",
    });

    expect(bundle.scenario).toMatchObject({
      channelId: "ch_demo",
      escrowAmount: "20",
      unitPrice: "0.002",
      finalUnits: "7431",
      settlementAmount: "14.862",
      refundAmount: "5.138",
    });
    expect(bundle.publicInputs).toMatchObject({
      channel_id: "ch_demo",
      rate_commitment: "rate:v1:escrow=20;unit=0.002;max=10000",
      escrow_amount: "20",
      settlement_amount: "14.862",
    });
    expect(bundle.privateInputs).toMatchObject({
      unit_price: "0.002",
      cumulative_units: "7431",
      voucher_signature: finalVoucher.signature,
      consumer_secret: "consumer-secret",
    });
  });
});
