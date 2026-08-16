import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildExactX402Payment,
  encodeX402PaymentHeader,
  signExactX402Payment,
} from "./x402-client.js";

test("buildExactX402Payment uses Base exact-scheme defaults", () => {
  const payment = buildExactX402Payment({
    network: "base-sepolia",
    from: "0x1111111111111111111111111111111111111111",
    to: "0x2222222222222222222222222222222222222222",
    value: "1000",
    signature: "0xabc",
  });
  assert.equal(payment.x402Version, 1);
  assert.equal(payment.scheme, "exact");
  assert.equal(payment.network, "base-sepolia");
  assert.equal(payment.payload.signature, "0xabc");
  assert.equal(payment.payload.authorization.from, "0x1111111111111111111111111111111111111111");
  assert.equal(payment.payload.authorization.to, "0x2222222222222222222222222222222222222222");
  assert.equal(payment.payload.authorization.value, "1000");
  assert.match(payment.payload.authorization.nonce, /^0x[0-9a-f]{64}$/);

  const header = encodeX402PaymentHeader(payment);
  const decoded = JSON.parse(Buffer.from(header, "base64").toString("utf8"));
  assert.deepEqual(decoded, payment);
});

test("signExactX402Payment produces an EIP-3009 signature", async () => {
  const payment = await signExactX402Payment({
    privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    chainId: 84532,
    asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    to: "0x0000000000000000000000000000000000000001",
    value: 1000n,
    network: "base-sepolia",
  });
  assert.equal(payment.scheme, "exact");
  assert.equal(payment.payload.authorization.from.toLowerCase(), "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266");
  assert.match(payment.payload.signature, /^0x[0-9a-fA-F]{130}$/);
});
