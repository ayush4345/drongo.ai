import assert from "node:assert/strict";
import { test } from "node:test";
import { accountFromPrivateKey, packedProofToEvm } from "./base.js";

test("packedProofToEvm splits G1/G2 byte layout into uint256 limbs", () => {
  const a = new Uint8Array(64);
  a[31] = 1;
  a[63] = 2;
  const b = new Uint8Array(128);
  b[31] = 3;
  b[63] = 4;
  b[95] = 5;
  b[127] = 6;
  const c = new Uint8Array(64);
  c[31] = 7;
  c[63] = 8;

  const evm = packedProofToEvm({ a, b, c });
  assert.deepEqual(evm.a, [1n, 2n]);
  assert.deepEqual(evm.b, [
    [3n, 4n],
    [5n, 6n],
  ]);
  assert.deepEqual(evm.c, [7n, 8n]);
});

test("accountFromPrivateKey accepts hex with or without 0x", () => {
  const key = "ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
  const withPrefix = accountFromPrivateKey(`0x${key}`);
  const without = accountFromPrivateKey(key);
  assert.equal(withPrefix.address, without.address);
  assert.equal(withPrefix.address.toLowerCase(), "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266");
});
