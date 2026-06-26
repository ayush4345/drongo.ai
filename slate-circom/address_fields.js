// Shared Soroban Address <-> circuit field-limb encoding.
//
// A Soroban Address payload is 32 bytes (contract ID hash or account Ed25519
// public key). Split into two big-endian u128 limbs for BN254 public inputs:
//   hi = bytes[0..16], lo = bytes[16..32]

const FIXTURE_DEPOSITOR =
  "0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f01";
const FIXTURE_PROVIDER =
  "0202030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f02";
const FIXTURE_TOKEN =
  "0302030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f03";

function addressFields(hex32) {
  const buf = Buffer.from(hex32, "hex");
  if (buf.length !== 32) {
    throw new Error(`expected 32-byte address payload, got ${buf.length}`);
  }
  const hi = BigInt("0x" + buf.subarray(0, 16).toString("hex"));
  const lo = BigInt("0x" + buf.subarray(16, 32).toString("hex"));
  return { hi: hi.toString(), lo: lo.toString() };
}

module.exports = {
  FIXTURE_DEPOSITOR,
  FIXTURE_PROVIDER,
  FIXTURE_TOKEN,
  addressFields,
};
