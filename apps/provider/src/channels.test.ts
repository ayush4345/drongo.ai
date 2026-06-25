import { describe, expect, it } from "vitest";
import { DeterministicDevVoucherSigner } from "@slate/protocol";

import { ChannelStore } from "./channels.js";

describe("channel store gatekeeping", () => {
  it("opens a mock channel and calculates max units", async () => {
    const store = new ChannelStore();
    const channel = await store.openChannel({
      consumer: "consumer_demo",
      provider: "mock_provider",
      escrowAmount: "20",
      unitPrice: "0.002",
      chain: "mock",
      openTx: "mock_tx",
    });

    expect(channel.maxUnits).toBe("10000");
    expect(channel.rateCommitment).toBe(
      "rate:v1:escrow=20;unit=0.002;max=10000",
    );
  });

  it("accepts fresh vouchers and rejects stale vouchers", async () => {
    const signer = new DeterministicDevVoucherSigner("consumer-secret");
    const store = new ChannelStore();
    const channel = await store.openChannel({
      consumer: "consumer_demo",
      provider: "mock_provider",
      escrowAmount: "20",
      unitPrice: "0.002",
      chain: "mock",
      openTx: "mock_tx",
    });

    const seven = await signer.signVoucher({
      channelId: channel.channelId,
      cumulativeUnits: "7",
      nonce: "n_7",
    });
    const repeatedSeven = await signer.signVoucher({
      channelId: channel.channelId,
      cumulativeUnits: "7",
      nonce: "n_7b",
    });

    expect(await store.acceptVoucher(channel.channelId, seven)).toMatchObject({
      ok: true,
      acceptedUnits: "7",
      remainingUnits: "9993",
    });
    expect(await store.acceptVoucher(channel.channelId, repeatedSeven)).toEqual({
      ok: false,
      reason: "stale-voucher",
    });
  });

  it("rejects vouchers above the escrow ceiling", async () => {
    const signer = new DeterministicDevVoucherSigner("consumer-secret");
    const store = new ChannelStore();
    const channel = await store.openChannel({
      consumer: "consumer_demo",
      provider: "mock_provider",
      escrowAmount: "20",
      unitPrice: "0.002",
      chain: "mock",
      openTx: "mock_tx",
    });
    const overCeiling = await signer.signVoucher({
      channelId: channel.channelId,
      cumulativeUnits: "10001",
      nonce: "n_10001",
    });

    expect(await store.acceptVoucher(channel.channelId, overCeiling)).toEqual({
      ok: false,
      reason: "over-escrow-ceiling",
    });
  });

  it("rejects bad signatures", async () => {
    const signer = new DeterministicDevVoucherSigner("consumer-secret");
    const store = new ChannelStore();
    const channel = await store.openChannel({
      consumer: "consumer_demo",
      provider: "mock_provider",
      escrowAmount: "20",
      unitPrice: "0.002",
      chain: "mock",
      openTx: "mock_tx",
    });
    const voucher = await signer.signVoucher({
      channelId: channel.channelId,
      cumulativeUnits: "7",
      nonce: "n_7",
    });

    expect(
      await store.acceptVoucher(channel.channelId, {
        ...voucher,
        signature: "bad_signature",
      }),
    ).toEqual({ ok: false, reason: "bad-signature" });
  });
});
