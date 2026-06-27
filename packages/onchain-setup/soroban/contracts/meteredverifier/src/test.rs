#![cfg(test)]

use super::*;
use soroban_sdk::Env;

fn proof(env: &Env) -> Proof {
    Proof {
        a: fixture::proof_a(env),
        b: fixture::proof_b(env),
        c: fixture::proof_c(env),
    }
}

#[test]
fn verifies_valid_proof() {
    let env = Env::default();
    let contract_id = env.register(MeteredVerifier, ());
    let client = MeteredVerifierClient::new(&env, &contract_id);

    let ok = client.verify(&proof(&env), &fixture::public_signals(&env));
    assert!(ok, "valid proof should verify");
}

#[test]
fn rejects_tampered_public_input() {
    let env = Env::default();
    let contract_id = env.register(MeteredVerifier, ());
    let client = MeteredVerifierClient::new(&env, &contract_id);

    // Flip one public signal (settlement_amount) so it no longer matches the proof.
    let mut signals = fixture::public_signals(&env);
    signals.set(3, U256::from_u32(&env, 1));

    let ok = client.verify(&proof(&env), &signals);
    assert!(!ok, "tampered public input must not verify");
}

#[test]
fn rejects_wrong_public_input_count() {
    let env = Env::default();
    let contract_id = env.register(MeteredVerifier, ());
    let client = MeteredVerifierClient::new(&env, &contract_id);

    let mut signals = fixture::public_signals(&env);
    signals.pop_back();

    let res = client.try_verify(&proof(&env), &signals);
    assert_eq!(res, Err(Ok(Error::WrongPublicInputLength)));
}
