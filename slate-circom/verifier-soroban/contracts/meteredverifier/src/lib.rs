#![no_std]
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype,
    crypto::bn254::{Bn254Fr, Bn254G1Affine, Bn254G2Affine},
    vec, BytesN, Env, Vec, U256,
};

mod vk;

#[cfg(test)]
mod fixture;
#[cfg(test)]
mod test;

/// A Groth16 proof on the BN254 curve, in the uncompressed Ethereum-compatible
/// serialization that the Soroban BN254 host functions expect.
///
/// - `a` and `c` are G1 points: 64 bytes = be(X) || be(Y)
/// - `b` is a G2 point: 128 bytes = be(X) || be(Y), each Fp2 = be(c1) || be(c0)
#[contracttype]
#[derive(Clone)]
pub struct Proof {
    pub a: BytesN<64>,
    pub b: BytesN<128>,
    pub c: BytesN<64>,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    /// The number of supplied public signals does not match the verifying key.
    WrongPublicInputLength = 1,
}

#[contract]
pub struct MeteredVerifier;

#[contractimpl]
impl MeteredVerifier {
    /// Verify a Groth16 proof for the metered-settlement circuit.
    ///
    /// `public_signals` are the circuit's public inputs (BN254 scalar field
    /// elements) in the same order snarkjs emits them in `public.json`:
    /// `[channel_id, rate_commitment, escrow_amount, settlement_amount,
    ///   nullifier, consumer_pubkey_x, consumer_pubkey_y]`.
    ///
    /// Returns `true` iff the proof is valid for the embedded verifying key.
    pub fn verify(
        env: Env,
        proof: Proof,
        public_signals: Vec<U256>,
    ) -> Result<bool, Error> {
        if public_signals.len() != vk::N_PUBLIC {
            return Err(Error::WrongPublicInputLength);
        }

        let bn = env.crypto().bn254();
        let ic = vk::ic(&env);

        // Linear combination of the verifying key's IC points with the public
        // inputs:  vk_x = IC[0] + Σ_i  public_signals[i] * IC[i + 1]
        let mut points: Vec<Bn254G1Affine> = vec![&env];
        let mut scalars: Vec<Bn254Fr> = vec![&env];
        for i in 0..public_signals.len() {
            points.push_back(ic.get_unchecked(i + 1));
            scalars.push_back(Bn254Fr::from(public_signals.get_unchecked(i)));
        }
        let vk_x = bn.g1_add(&ic.get_unchecked(0), &bn.g1_msm(points, scalars));

        // Groth16 check, expressed as a single multi-pairing equal to 1:
        //   e(-A, B) · e(alpha, beta) · e(vk_x, gamma) · e(C, delta) == 1
        let neg_a = -Bn254G1Affine::from_bytes(proof.a);

        let g1 = vec![
            &env,
            neg_a,
            vk::alpha_g1(&env),
            vk_x,
            Bn254G1Affine::from_bytes(proof.c),
        ];
        let g2 = vec![
            &env,
            Bn254G2Affine::from_bytes(proof.b),
            vk::beta_g2(&env),
            vk::gamma_g2(&env),
            vk::delta_g2(&env),
        ];

        Ok(bn.pairing_check(g1, g2))
    }
}
