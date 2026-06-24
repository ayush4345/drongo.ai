const fs = require("fs");
const { buildPoseidon, buildEddsa } = require("circomlibjs");

async function main() {
  const poseidon = await buildPoseidon();
  const eddsa = await buildEddsa();
  const F = poseidon.F;

  // ---- Secret / chosen values ----
  const rate = 2000n;
  const rate_blind = 42424242n;
  const total_units = 7431n;
  const channel_id = 99912345n;
  const channel_secret = 1111111n;
  const escrow_amount = 20000000n;

  // settlement_amount must be <= escrow_amount (LessEqThan(64) constraint).
  // The amount-from-units check is commented out in the circuit, but we keep it
  // consistent: settlement_amount = total_units * rate.
  const settlement_amount = total_units * rate; // 14_862_000

  // Consumer EdDSA key (private scalar as a 32-byte buffer).
  const prvKey = Buffer.from(
    "0001020304050607080900010203040506070809000102030405060708090001",
    "hex"
  );
  const pubKey = eddsa.prv2pub(prvKey); // [Ax, Ay] field elements

  // rate_commitment = Poseidon(rate, rate_blind)
  const rate_commitment = poseidon([rate, rate_blind]);

  // nullifier = Poseidon(channel_id, channel_secret)
  const nullifier = poseidon([channel_id, channel_secret]);

  // Voucher message signed by the consumer: M = Poseidon(channel_id, total_units)
  const voucherMsg = poseidon([channel_id, total_units]);
  const signature = eddsa.signPoseidon(prvKey, voucherMsg);

  // EdDSA self-check (sanity).
  const ok = eddsa.verifyPoseidon(voucherMsg, signature, pubKey);
  if (!ok) throw new Error("EdDSA signature failed self-verification");

  const input = {
    channel_id: channel_id.toString(),
    rate_commitment: F.toObject(rate_commitment).toString(),
    escrow_amount: escrow_amount.toString(),
    settlement_amount: settlement_amount.toString(),
    nullifier: F.toObject(nullifier).toString(),

    consumer_pubkey_x: F.toObject(pubKey[0]).toString(),
    consumer_pubkey_y: F.toObject(pubKey[1]).toString(),

    rate: rate.toString(),
    rate_blind: rate_blind.toString(),
    total_units: total_units.toString(),
    channel_secret: channel_secret.toString(),

    sig_R8x: F.toObject(signature.R8[0]).toString(),
    sig_R8y: F.toObject(signature.R8[1]).toString(),
    sig_S: signature.S.toString(),
  };

  fs.writeFileSync("input.json", JSON.stringify(input, null, 2) + "\n");
  console.log("Wrote input.json:");
  console.log(input);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
