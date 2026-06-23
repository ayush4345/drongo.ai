# Metered Settlement — Soroban Groth16 Verifier

On-chain verifier for the `setttlement.circom` Groth16 proof, written for Soroban.

The circuit is compiled with circom/snarkjs on the **BN254** curve (snarkjs calls
it `bn128` / `alt_bn128`). Soroban has had **native BN254 host functions** since
Protocol 25 (`soroban-sdk` 26) — `bn254_multi_pairing_check`, `g1_msm`, `g1_add`,
G1 negation — so the proof is verified directly on-chain without re-doing the
trusted setup on a different curve.

## Layout

```
contracts/meteredverifier/src/
  lib.rs       # the contract: MeteredVerifier::verify(proof, public_signals)
  vk.rs        # AUTO-GENERATED verifying key constants (from the .zkey vkey)
  fixture.rs   # AUTO-GENERATED real proof, used by tests
  test.rs      # tests (valid proof, tampered input, wrong arity)
gen_verifier_data.js  # converts snarkjs JSON -> vk.rs + fixture.rs
```

## How verification works

Groth16 verification reduces to one multi-pairing being equal to 1:

```
e(-A, B) · e(alpha, beta) · e(vk_x, gamma) · e(C, delta) == 1
```

where `vk_x = IC[0] + Σ_i public_signals[i] · IC[i+1]` is computed with a single
`g1_msm`, and the final check is a single `bn254_multi_pairing_check`.

### Serialization (the easy thing to get wrong)

Soroban uses the uncompressed Ethereum-compatible encoding:

- **G1** (`BytesN<64>`): `be(X) || be(Y)`
- **G2** (`BytesN<128>`): `be(X) || be(Y)`, where each `Fp2` element is
  `be(c1) || be(c0)` — **imaginary component first**.

snarkjs stores `Fp2` coordinates as `[c0, c1]`, so `gen_verifier_data.js` swaps
them to `[c1, c0]` when emitting G2 points (`vk_beta_2`, `vk_gamma_2`,
`vk_delta_2`, and the proof's `pi_b`).

## Regenerating the verifying key / fixture

After re-running the circuit pipeline (`../run.sh setttlement`), regenerate the
embedded constants and test fixture from the snarkjs artifacts:

```bash
node gen_verifier_data.js
```

This reads `../setttlement_verification_key.json`, `../proof.json`, and
`../public.json` and rewrites `vk.rs` and `fixture.rs`.

## Build & test

> Requires Rust 1.84+ and the `wasm32v1-none` target
> (`rustup target add wasm32v1-none`). soroban-sdk 26 no longer supports
> `wasm32-unknown-unknown`.

```bash
# run the tests (verifies a real proof inside a Soroban test env)
cargo test -p meteredverifier

# build the deployable contract
cargo build --target wasm32v1-none --release
# or, with the stellar CLI:
stellar contract build
```

## Contract interface

```rust
pub fn verify(env: Env, proof: Proof, public_signals: Vec<U256>) -> Result<bool, Error>;
```

`public_signals` must be the 7 public inputs in snarkjs order:
`[channel_id, rate_commitment, escrow_amount, settlement_amount, nullifier,
consumer_pubkey_x, consumer_pubkey_y]`.

It returns `true` for a valid proof, `false` for an invalid one, and
`Err(WrongPublicInputLength)` if the number of public signals is not 7.
