import { test } from "node:test";
import assert from "node:assert/strict";
import { ShadowCrypto } from "../src/crypto.js";
import { createIdentity } from "../src/keys.js";
import { MeteredChannel, type OpenChannelOpts } from "../src/channel.js";
import { signVoucher } from "../src/voucher.js";
import { toCircuitInput } from "../src/circuit.js";

const USDC = 1_000_000n;

function openChannel(crypto: ShadowCrypto, overrides: Partial<OpenChannelOpts> = {}) {
  const identity = createIdentity(crypto, Buffer.alloc(32, 7));
  return new MeteredChannel(crypto, {
    channelId: 1234n,
    rate: 2_000n, // 0.002 USDC / call
    escrow: 20n * USDC, // 20 USDC
    rateBlind: 999n,
    channelSecret: 555n,
    identity,
    ...overrides,
  });
}

test("worked example: 7431 calls settle to 14.862 USDC with 5.138 refunded", async () => {
  const crypto = await ShadowCrypto.build();
  const channel = openChannel(crypto);

  let prev = 0n;
  for (const target of [1_000n, 2_500n, 5_000n, 7_431n]) {
    const { result } = channel.meter(target - prev);
    prev = target;
    assert.equal(result.accepted, true);
  }

  const w = channel.close();
  assert.equal(w.totalUnits, "7431");
  assert.equal(w.settlementAmount, (14_862_000n).toString());
  assert.equal(BigInt(channel.terms.escrow) - BigInt(w.settlementAmount), 5_138_000n);
  // The hard invariant the circuit also enforces.
  assert.ok(BigInt(w.settlementAmount) <= BigInt(w.escrow));
});

test("provider halts when a voucher would exceed the escrow ceiling", async () => {
  const crypto = await ShadowCrypto.build();
  const channel = openChannel(crypto); // ceiling = 20 USDC / 0.002 = 10_000 calls

  const atCeiling = channel.meter(10_000n);
  assert.equal(atCeiling.result.accepted, true);
  assert.equal(atCeiling.result.billable, 20n * USDC);

  const overCeiling = channel.meter(1n);
  assert.equal(overCeiling.result.accepted, false);
  assert.equal(overCeiling.result.reason, "ceiling-exceeded");
  assert.equal(channel.provider.isHalted, true);

  // Settlement falls back to the last accepted voucher (10_000 calls).
  const w = channel.close();
  assert.equal(w.totalUnits, "10000");
  assert.equal(w.settlementAmount, (20n * USDC).toString());
});

test("provider rejects a non-monotonic (rolled-back) voucher", async () => {
  const crypto = await ShadowCrypto.build();
  const channel = openChannel(crypto);
  const identity = createIdentity(crypto, Buffer.alloc(32, 7)); // same seed as openChannel

  assert.equal(channel.meter(100n).result.accepted, true);

  // A validly signed but lower-cumulative voucher must not roll the meter back.
  const stale = signVoucher(crypto, identity.privateKey, channel.terms.channelId, 50n);
  const res = channel.provider.receive(stale);
  assert.equal(res.accepted, false);
  assert.equal(res.reason, "non-monotonic");
});

test("provider rejects a voucher signed by the wrong key", async () => {
  const crypto = await ShadowCrypto.build();
  const channel = openChannel(crypto);
  const mallory = createIdentity(crypto, Buffer.alloc(32, 99));

  const forged = signVoucher(crypto, mallory.privateKey, channel.terms.channelId, 100n);
  const res = channel.provider.receive(forged);
  assert.equal(res.accepted, false);
  assert.equal(res.reason, "bad-signature");
});

test("rate commitment hides the rate and is deterministic; blinding changes it", async () => {
  const crypto = await ShadowCrypto.build();
  const a = openChannel(crypto, { rate: 2_000n, rateBlind: 999n });
  const b = openChannel(crypto, { rate: 2_000n, rateBlind: 999n });
  const c = openChannel(crypto, { rate: 2_000n, rateBlind: 1_000n });
  assert.equal(a.rateCommitment(), b.rateCommitment());
  assert.notEqual(a.rateCommitment(), c.rateCommitment());
});

test("closing a channel with no accepted vouchers throws", async () => {
  const crypto = await ShadowCrypto.build();
  const channel = openChannel(crypto);
  assert.throws(() => channel.close(), /nothing to settle/);
});

test("circuit input exposes all 14 expected signals as decimal strings", async () => {
  const crypto = await ShadowCrypto.build();
  const channel = openChannel(crypto);
  channel.meter(7_431n);
  const input = toCircuitInput(channel.close());

  const expected = [
    "channel_id", "rate_commitment", "escrow_amount", "settlement_amount", "nullifier",
    "consumer_pubkey_x", "consumer_pubkey_y", "rate", "rate_blind", "total_units",
    "channel_secret", "sig_R8x", "sig_R8y", "sig_S",
  ];
  assert.deepEqual(Object.keys(input).sort(), [...expected].sort());
  for (const v of Object.values(input)) {
    assert.match(v, /^\d+$/, "every signal must be a decimal string");
  }
});
