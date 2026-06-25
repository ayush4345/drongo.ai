#![cfg(test)]

use super::fixture;
use super::*;
use meteredverifier::{MeteredVerifier, MeteredVerifierClient};
use soroban_sdk::testutils::Address as _;
use soroban_sdk::token::{StellarAssetClient, TokenClient};
use soroban_sdk::{Address, Env, U256};

const ESCROW_AMOUNT: i128 = 20_000_000;
const SETTLEMENT_AMOUNT: i128 = 14_862_000;
const REFUND_AMOUNT: i128 = 5_138_000;
const DEPOSITOR_MINT: i128 = 50_000_000;

struct TestContext<'a> {
    env: Env,
    escrow_id: Address,
    client: SlateEscrowClient<'a>,
    token: Address,
    depositor: Address,
    provider: Address,
    verifier_id: Address,
}

fn proof(env: &Env) -> metered_verifier::Proof {
    metered_verifier::Proof {
        a: fixture::proof_a(env),
        b: fixture::proof_b(env),
        c: fixture::proof_c(env),
    }
}

fn setup() -> TestContext<'static> {
    let env = Env::default();
    env.mock_all_auths();

    let escrow_id = env.register(SlateEscrow, ());
    let client = SlateEscrowClient::new(&env, &escrow_id);
    client.init();

    let admin = Address::generate(&env);
    let token_contract = env.register_stellar_asset_contract_v2(admin);
    let token = token_contract.address();

    client.whitelist_token(&token);

    let depositor = Address::generate(&env);
    let provider = Address::generate(&env);

    let stellar = StellarAssetClient::new(&env, &token);
    stellar.mint(&depositor, &DEPOSITOR_MINT);

    let verifier_id = env.register(MeteredVerifier, ());
    let _verifier = MeteredVerifierClient::new(&env, &verifier_id);

    TestContext {
        env,
        escrow_id,
        client,
        token,
        depositor,
        provider,
        verifier_id,
    }
}

fn deposit(ctx: &TestContext, amount: i128) {
    ctx.client
        .add_to_depositors(&ctx.depositor, &amount, &ctx.token);
}

#[test]
fn init_succeeds() {
    let env = Env::default();
    let escrow_id = env.register(SlateEscrow, ());
    let client = SlateEscrowClient::new(&env, &escrow_id);

    client.init();
}

#[test]
fn init_twice_panics() {
    let env = Env::default();
    let escrow_id = env.register(SlateEscrow, ());
    let client = SlateEscrowClient::new(&env, &escrow_id);

    client.init();
    assert!(client.try_init().is_err());
}

#[test]
fn whitelist_before_init_panics() {
    let env = Env::default();
    let escrow_id = env.register(SlateEscrow, ());
    let client = SlateEscrowClient::new(&env, &escrow_id);
    let token = Address::generate(&env);

    assert!(client.try_whitelist_token(&token).is_err());
}

#[test]
fn whitelist_token_adds_token() {
    let ctx = setup();
    let other_token = ctx
        .env
        .register_stellar_asset_contract_v2(Address::generate(&ctx.env))
        .address();

    ctx.client.whitelist_token(&other_token);
    ctx.client.whitelist_token(&other_token);

    ctx.env.mock_all_auths();
    let stellar = StellarAssetClient::new(&ctx.env, &other_token);
    stellar.mint(&ctx.depositor, &1_000);
    ctx.client
        .add_to_depositors(&ctx.depositor, &1_000, &other_token);
    assert_eq!(ctx.client.get_balance(&ctx.depositor, &other_token), 1_000);
}

#[test]
fn get_balance_returns_zero_for_new_depositor() {
    let ctx = setup();
    let stranger = Address::generate(&ctx.env);

    assert_eq!(ctx.client.get_balance(&stranger, &ctx.token), 0);
}

#[test]
fn add_to_depositors_updates_balance_and_transfers_tokens() {
    let ctx = setup();
    let amount = 10_000_i128;

    deposit(&ctx, amount);

    assert_eq!(ctx.client.get_balance(&ctx.depositor, &ctx.token), amount);

    let token_client = TokenClient::new(&ctx.env, &ctx.token);
    assert_eq!(token_client.balance(&ctx.escrow_id), amount);
    assert_eq!(
        token_client.balance(&ctx.depositor),
        DEPOSITOR_MINT - amount
    );
}

#[test]
fn add_to_depositors_accumulates_balance() {
    let ctx = setup();

    deposit(&ctx, 5_000);
    deposit(&ctx, 7_000);

    assert_eq!(ctx.client.get_balance(&ctx.depositor, &ctx.token), 12_000);
}

#[test]
fn add_to_depositors_rejects_non_whitelisted_token() {
    let ctx = setup();
    let other_token = ctx
        .env
        .register_stellar_asset_contract_v2(Address::generate(&ctx.env))
        .address();

    let result = ctx
        .client
        .try_add_to_depositors(&ctx.depositor, &1_000, &other_token);
    assert!(result.is_err());
}

#[test]
fn add_to_depositors_rejects_zero_amount() {
    let ctx = setup();

    let result = ctx
        .client
        .try_add_to_depositors(&ctx.depositor, &0, &ctx.token);
    assert!(result.is_err());
}

#[test]
fn add_to_depositors_rejects_negative_amount() {
    let ctx = setup();

    let result = ctx
        .client
        .try_add_to_depositors(&ctx.depositor, &-100, &ctx.token);
    assert!(result.is_err());
}

#[test]
fn add_to_depositors_requires_auth() {
    let env = Env::default();
    let escrow_id = env.register(SlateEscrow, ());
    let client = SlateEscrowClient::new(&env, &escrow_id);
    client.init();

    let admin = Address::generate(&env);
    let token = env
        .register_stellar_asset_contract_v2(admin)
        .address();
    client.whitelist_token(&token);

    let depositor = Address::generate(&env);
    let result = client.try_add_to_depositors(&depositor, &1_000, &token);
    assert!(result.is_err());
}

#[test]
fn settle_distributes_tokens_and_clears_balance() {
    let ctx = setup();
    deposit(&ctx, ESCROW_AMOUNT);

    let token_client = TokenClient::new(&ctx.env, &ctx.token);
    let depositor_before = token_client.balance(&ctx.depositor);

    ctx.client.settle(
        &ctx.verifier_id,
        &proof(&ctx.env),
        &fixture::public_signals(&ctx.env),
        &ctx.depositor,
        &ctx.provider,
        &ctx.token,
    );

    assert_eq!(ctx.client.get_balance(&ctx.depositor, &ctx.token), 0);
    assert_eq!(token_client.balance(&ctx.provider), SETTLEMENT_AMOUNT);
    assert_eq!(
        token_client.balance(&ctx.depositor),
        depositor_before + REFUND_AMOUNT
    );
    assert_eq!(token_client.balance(&ctx.escrow_id), 0);
}

#[test]
fn settle_rejects_invalid_proof() {
    let ctx = setup();
    deposit(&ctx, ESCROW_AMOUNT);

    let mut signals = fixture::public_signals(&ctx.env);
    signals.set(3, U256::from_u32(&ctx.env, 1));

    let result = ctx.client.try_settle(
        &ctx.verifier_id,
        &proof(&ctx.env),
        &signals,
        &ctx.depositor,
        &ctx.provider,
        &ctx.token,
    );
    assert!(result.is_err());
}

#[test]
fn settle_rejects_double_nullifier() {
    let ctx = setup();
    deposit(&ctx, ESCROW_AMOUNT);

    let proof = proof(&ctx.env);
    let signals = fixture::public_signals(&ctx.env);

    ctx.client.settle(
        &ctx.verifier_id,
        &proof,
        &signals,
        &ctx.depositor,
        &ctx.provider,
        &ctx.token,
    );

    let result = ctx.client.try_settle(
        &ctx.verifier_id,
        &proof,
        &signals,
        &ctx.depositor,
        &ctx.provider,
        &ctx.token,
    );
    assert!(result.is_err());
}

#[test]
fn settle_pays_arbitrary_provider_not_bound_by_proof() {
    let ctx = setup();
    deposit(&ctx, ESCROW_AMOUNT);

    let attacker_provider = Address::generate(&ctx.env);
    let token_client = TokenClient::new(&ctx.env, &ctx.token);

    ctx.client.settle(
        &ctx.verifier_id,
        &proof(&ctx.env),
        &fixture::public_signals(&ctx.env),
        &ctx.depositor,
        &attacker_provider,
        &ctx.token,
    );

    assert_eq!(token_client.balance(&attacker_provider), SETTLEMENT_AMOUNT);
}

#[test]
fn settle_rejects_insufficient_internal_balance() {
    let ctx = setup();
    deposit(&ctx, ESCROW_AMOUNT - 1);

    let result = ctx.client.try_settle(
        &ctx.verifier_id,
        &proof(&ctx.env),
        &fixture::public_signals(&ctx.env),
        &ctx.depositor,
        &ctx.provider,
        &ctx.token,
    );
    assert!(result.is_err());
}
