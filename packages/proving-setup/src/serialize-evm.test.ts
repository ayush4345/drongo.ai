import assert from "node:assert/strict";
import {
  addressPayloadToLimbs,
  evmAddressToPayload,
  payloadToEvmAddress,
  serializeProofEvm,
  type Groth16Proof,
} from "./index.js";

const addr = "0x1234567890123456789012345678901234567890";
const payload = evmAddressToPayload(addr);
assert.equal(payload.length, 32);
for (let i = 0; i < 12; i++) assert.equal(payload[i], 0);
assert.equal(payloadToEvmAddress(payload).toLowerCase(), addr.toLowerCase());

const { hi, lo } = addressPayloadToLimbs(payload);
assert.equal(hi, 0x00000000000000000000000012345678n);
assert.equal(lo, 0x90123456789012345678901234567890n);

const proof: Groth16Proof = {
  pi_a: ["1", "2", "1"],
  pi_b: [
    ["3", "4"],
    ["5", "6"],
    ["1", "0"],
  ],
  pi_c: ["7", "8", "1"],
  protocol: "groth16",
  curve: "bn128",
};
const evm = serializeProofEvm(proof);
assert.deepEqual(evm.a, [1n, 2n]);
assert.deepEqual(evm.b, [
  [4n, 3n],
  [6n, 5n],
]);
assert.deepEqual(evm.c, [7n, 8n]);

console.log("serialize-evm tests passed");
