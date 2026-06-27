pragma circom 2.1.5;

include "./node_modules/circomlib/circuits/poseidon.circom";
include "./node_modules/circomlib/circuits/comparators.circom";
include "./node_modules/circomlib/circuits/eddsaposeidon.circom";

template MeteredVerifier() {
    signal input channel_id;
    signal input rate_commitment;
    signal input escrow_amount;
    signal input settlement_amount;
    signal input nullifier;

    signal input consumer_pubkey_x;
    signal input consumer_pubkey_y;

    // On-chain binding: each Soroban Address is encoded as two 128-bit limbs
    // (high || low) of its 32-byte payload (contract ID or account Ed25519 key).
    signal input depositor_hi;
    signal input depositor_lo;
    signal input provider_hi;
    signal input provider_lo;
    signal input token_hi;
    signal input token_lo;

    signal input rate;
    signal input rate_blind;
    signal input total_units;
    signal input channel_secret;

    signal input sig_R8x;
    signal input sig_R8y;
    signal input sig_S;

    component rateHasher = Poseidon(2);
    rateHasher.inputs[0] <== rate;
    rateHasher.inputs[1] <== rate_blind;
    rate_commitment === rateHasher.out;

    component voucherHasher = Poseidon(2);
    voucherHasher.inputs[0] <== channel_id;
    voucherHasher.inputs[1] <== total_units;

    component sigVerifier = EdDSAPoseidonVerifier();
    sigVerifier.enabled <== 1;
    sigVerifier.Ax <== consumer_pubkey_x;
    sigVerifier.Ay <== consumer_pubkey_y;
    sigVerifier.R8x <== sig_R8x;
    sigVerifier.R8y <== sig_R8y;
    sigVerifier.S <== sig_S;
    sigVerifier.M <== voucherHasher.out;

    settlement_amount === total_units * rate;

    component lessEq = LessEqThan(64);
    lessEq.in[0] <== settlement_amount;
    lessEq.in[1] <== escrow_amount;
    lessEq.out === 1;

    component nullifierHasher = Poseidon(2);
    nullifierHasher.inputs[0] <== channel_id;
    nullifierHasher.inputs[1] <== channel_secret;
    nullifier === nullifierHasher.out;
}

component main {public [
    channel_id,
    rate_commitment,
    escrow_amount,
    settlement_amount,
    nullifier,
    consumer_pubkey_x,
    consumer_pubkey_y,
    depositor_hi,
    depositor_lo,
    provider_hi,
    provider_lo,
    token_hi,
    token_lo
]} = MeteredVerifier();
