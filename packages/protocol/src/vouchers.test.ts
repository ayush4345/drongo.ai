import { describe, expect, it } from "vitest";

import {
  DeterministicDevVoucherSigner,
  VoucherReplayGuard,
} from "./vouchers.js";

describe("voucher signing", () => {
  it("verifies vouchers signed by the consumer", async () => {
    const signer = new DeterministicDevVoucherSigner("consumer-secret");

    const voucher = await signer.signVoucher({
      channelId: "ch_demo",
      cumulativeUnits: "7",
      nonce: "n_7",
    });

    expect(voucher.consumerPubKey).toBe(await signer.publicKey());
    expect(await signer.verifyVoucher(voucher)).toBe(true);
  });

  it("invalidates the signature when cumulative units change", async () => {
    const signer = new DeterministicDevVoucherSigner("consumer-secret");
    const voucher = await signer.signVoucher({
      channelId: "ch_demo",
      cumulativeUnits: "7",
      nonce: "n_7",
    });

    expect(
      await signer.verifyVoucher({ ...voucher, cumulativeUnits: "8" }),
    ).toBe(false);
  });

  it("tracks monotonic voucher acceptance", async () => {
    const signer = new DeterministicDevVoucherSigner("consumer-secret");
    const guard = new VoucherReplayGuard();
    const seven = await signer.signVoucher({
      channelId: "ch_demo",
      cumulativeUnits: "7",
      nonce: "n_7",
    });
    const repeatedSeven = await signer.signVoucher({
      channelId: "ch_demo",
      cumulativeUnits: "7",
      nonce: "n_7b",
    });
    const eight = await signer.signVoucher({
      channelId: "ch_demo",
      cumulativeUnits: "8",
      nonce: "n_8",
    });

    expect(guard.accept(seven)).toEqual({ ok: true, acceptedUnits: "7" });
    expect(guard.accept(repeatedSeven)).toEqual({
      ok: false,
      reason: "stale-voucher",
    });
    expect(guard.accept(eight)).toEqual({ ok: true, acceptedUnits: "8" });
  });
});
