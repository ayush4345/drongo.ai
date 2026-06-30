import { test } from "node:test";
import assert from "node:assert/strict";
import { DrongoCrypto } from "../src/crypto.js";
import { createIdentity } from "../src/keys.js";
import { signVoucher, verifyVoucher, voucherMessage } from "../src/voucher.js";

const CHANNEL_ID = 42n;

test("a freshly signed voucher verifies against the signer's public key", async () => {
  const crypto = await DrongoCrypto.build();
  const id = createIdentity(crypto, Buffer.alloc(32, 1));
  const voucher = signVoucher(crypto, id.privateKey, CHANNEL_ID, 1_000n);
  assert.equal(verifyVoucher(crypto, voucher, id.publicKey), true);
});

test("tampering with cumulativeUnits invalidates the signature", async () => {
  const crypto = await DrongoCrypto.build();
  const id = createIdentity(crypto, Buffer.alloc(32, 2));
  const voucher = signVoucher(crypto, id.privateKey, CHANNEL_ID, 1_000n);

  // Attacker bumps the meter without a fresh signature.
  const forged = { ...voucher, cumulativeUnits: 9_999n };
  assert.equal(verifyVoucher(crypto, forged, id.publicKey), false);
});

test("a voucher does not verify against a different public key", async () => {
  const crypto = await DrongoCrypto.build();
  const alice = createIdentity(crypto, Buffer.alloc(32, 3));
  const mallory = createIdentity(crypto, Buffer.alloc(32, 4));
  const voucher = signVoucher(crypto, alice.privateKey, CHANNEL_ID, 500n);
  assert.equal(verifyVoucher(crypto, voucher, mallory.publicKey), false);
});

test("the voucher message is a deterministic Poseidon hash of (channelId, units)", async () => {
  const crypto = await DrongoCrypto.build();
  const a = voucherMessage(crypto, CHANNEL_ID, 1_000n);
  const b = voucherMessage(crypto, CHANNEL_ID, 1_000n);
  const c = voucherMessage(crypto, CHANNEL_ID, 1_001n);
  assert.equal(a, b);
  assert.notEqual(a, c);
});
