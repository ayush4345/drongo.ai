const fs = require("fs");
const { buildPoseidon, buildEddsa } = require("circomlibjs");
const {
  FIXTURE_DEPOSITOR,
  FIXTURE_PROVIDER,
  FIXTURE_TOKEN,
  addressFields,
} = require("./address_fields");

async function main() {
  const poseidon = await buildPoseidon();
  const eddsa = await buildEddsa();
  const F = poseidon.F;

  const rate = 2000n;
  const rate_blind = 42424242n;
  const total_units = 7431n;
  const channel_id = 99912345n;
  const channel_secret = 1111111n;
  const escrow_amount = 20000000n;
  const settlement_amount = total_units * rate; // 14_862_000

  const depositor = addressFields(FIXTURE_DEPOSITOR);
  const provider = addressFields(FIXTURE_PROVIDER);
  const token = addressFields(FIXTURE_TOKEN);

  const prvKey = Buffer.from(
    "0001020304050607080900010203040506070809000102030405060708090001",
    "hex"
  );
  const pubKey = eddsa.prv2pub(prvKey);

  const rate_commitment = poseidon([rate, rate_blind]);
  const nullifier = poseidon([channel_id, channel_secret]);
  const voucherMsg = poseidon([channel_id, total_units]);
  const signature = eddsa.signPoseidon(prvKey, voucherMsg);

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

    depositor_hi: depositor.hi,
    depositor_lo: depositor.lo,
    provider_hi: provider.hi,
    provider_lo: provider.lo,
    token_hi: token.hi,
    token_lo: token.lo,

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
