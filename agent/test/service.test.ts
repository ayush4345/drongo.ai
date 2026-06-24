import { test } from "node:test";
import assert from "node:assert/strict";
import { DrongoCrypto } from "../src/crypto.js";
import { createIdentity } from "../src/keys.js";
import { ServiceChannel } from "../src/service-channel.js";
import { MockInferenceService, type InferenceRequest, type InferenceResult } from "../src/service.js";
import { signVoucher } from "../src/voucher.js";

const USDC = 1_000_000n;

function open(crypto: DrongoCrypto, unitsPerCall = 1n, rate = 2_000n, escrow = 20n * USDC) {
  const identity = createIdentity(crypto, Buffer.alloc(32, 7));
  const service = new MockInferenceService(unitsPerCall);
  const channel = new ServiceChannel<InferenceRequest, InferenceResult>(
    crypto,
    { channelId: 1234n, rate, escrow, rateBlind: 999n, channelSecret: 555n, identity },
    service,
  );
  return { channel, identity, service };
}

test("a paid call is served, returns a result, and advances the bill", async () => {
  const crypto = await DrongoCrypto.build();
  const { channel } = open(crypto);
  const out = await channel.call({ prompt: "hello" });
  assert.equal(out.served, true);
  assert.equal(out.cost, 1n);
  assert.equal(out.billable, 2_000n); // 1 unit * 0.002 USDC
  assert.ok(out.result);
  assert.match(out.result!.completion, /^echo\(5\): olleh$/);
});

test("settlement equals total served units * rate", async () => {
  const crypto = await DrongoCrypto.build();
  const { channel } = open(crypto);
  for (let i = 0; i < 10; i++) assert.equal((await channel.call({ prompt: `r${i}` })).served, true);
  const w = channel.close();
  assert.equal(w.totalUnits, "10");
  assert.equal(w.settlementAmount, (10n * 2_000n).toString());
});

test("provider prices independently and refuses an underpaid voucher", async () => {
  const crypto = await DrongoCrypto.build();
  const { channel, identity } = open(crypto, 5n); // provider prices every call at 5 units
  // Consumer tries to pay only 1 unit for it.
  const voucher = signVoucher(crypto, identity.privateKey, channel.terms.channelId, 1n);
  const resp = await channel.provider.serve({ request: { prompt: "x" }, cost: 1n, voucher });
  assert.equal(resp.served, false);
  assert.equal(resp.reason, "underpaid");
  assert.equal(resp.result, undefined);
});

test("provider halts at the escrow ceiling and serves nothing further", async () => {
  const crypto = await DrongoCrypto.build();
  const { channel } = open(crypto, 1n, 1n, 3n); // rate 1, escrow 3 → exactly 3 calls fit
  assert.equal((await channel.call({ prompt: "a" })).served, true);
  assert.equal((await channel.call({ prompt: "b" })).served, true);
  assert.equal((await channel.call({ prompt: "c" })).served, true);

  const over = await channel.call({ prompt: "d" });
  assert.equal(over.served, false);
  assert.equal(over.reason, "ceiling-exceeded");
  assert.equal(over.result, undefined);

  // Settlement falls back to the last paid-and-served voucher (3 units).
  const w = channel.close();
  assert.equal(w.totalUnits, "3");
});

test("the service only runs when paid (no result on refusal)", async () => {
  const crypto = await DrongoCrypto.build();
  const { channel, identity } = open(crypto);
  // A voucher signed by the wrong key must not get served.
  const mallory = createIdentity(crypto, Buffer.alloc(32, 99));
  const forged = signVoucher(crypto, mallory.privateKey, channel.terms.channelId, 1n);
  const resp = await channel.provider.serve({ request: { prompt: "x" }, cost: 1n, voucher: forged });
  assert.equal(resp.served, false);
  assert.equal(resp.reason, "bad-signature");
  assert.equal(resp.result, undefined);
});
