#![cfg(test)]

use super::fixture;
use super::mock_token::{MockToken, MockTokenClient};
use super::*;
use meteredverifier::MeteredVerifier;
use soroban_sdk::testutils::Address as _;
use soroban_sdk::token::TokenClient;
use soroban_sdk::{address_payload::AddressPayload, Address, BytesN, Env, U256};

const ESCROW_AMOUNT: i128 = 20_000_000;
const SETTLEMENT_AMOUNT: i128 = 14_862_000;
const REFUND_AMOUNT: i128 = 5_138_000;
const DEPOSITOR_MINT: i128 = 50_000_000;

const FIXTURE_DEPOSITOR: [u8; 32] = [
    0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 0x10,
    0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x1b, 0x1c, 0x1d, 0x1e, 0x1f, 0x01,
];
const FIXTURE_PROVIDER: [u8; 32] = [
    0x02, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 0x10,
    0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x1b, 0x1c, 0x1d, 0x1e, 0x1f, 0x02,
];
const FIXTURE_TOKEN: [u8; 32] = [
    0x03, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 0x10,
    0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x1b, 0x1c, 0x1d, 0x1e, 0x1f, 0x03,
];

struct TestContext<'a> {
    env: Env,
    escrow_id: Address,
    client: SlateEscrowClient<'a>,
    token: Address,
    depositor: Address,
    provider: Address,
}

fn address_from_fixture(env: &Env, bytes: [u8; 32]) -> Address {
    AddressPayload::ContractIdHash(BytesN::from_array(env, &bytes)).to_address(env)
}

fn proof(env: &Env) -> Proof {
    Proof {
        a: fixture::proof_a(env),
        b: fixture::proof_b(env),
        c: fixture::proof_c(env),
    }
}

fn setup() -> TestContext<'static> {
    let env = Env::default();
    env.mock_all_auths();

    let verifier_id = env.register(MeteredVerifier, ());
    let escrow_id = env.register(SlateEscrow, ());
    let client = SlateEscrowClient::new(&env, &escrow_id);
    client.init(&verifier_id);

    let depositor = address_from_fixture(&env, FIXTURE_DEPOSITOR);
    let provider = address_from_fixture(&env, FIXTURE_PROVIDER);
    let token = address_from_fixture(&env, FIXTURE_TOKEN);
    MockToken::register(&env, &token);

    client.whitelist_token(&token);

    let mock = MockTokenClient::new(&env, &token);
    mock.mint(&depositor, &DEPOSITOR_MINT);

    TestContext {
        env,
        escrow_id,
        client,
        token,
        depositor,
        provider,
    }
}

fn deposit(ctx: &TestContext, amount: i128) {
    ctx.client
        .add_to_depositors(&ctx.depositor, &amount, &ctx.token);
}

#[test]
fn init_succeeds() {
    let env = Env::default();
    let verifier_id = env.register(MeteredVerifier, ());
    let escrow_id = env.register(SlateEscrow, ());
    let client = SlateEscrowClient::new(&env, &escrow_id);

    client.init(&verifier_id);
    assert_eq!(client.get_verifier(), verifier_id);
}

#[test]
fn init_twice_panics() {
    let env = Env::default();
    let verifier_id = env.register(MeteredVerifier, ());
    let escrow_id = env.register(SlateEscrow, ());
    let client = SlateEscrowClient::new(&env, &escrow_id);

    client.init(&verifier_id);
    assert!(client.try_init(&verifier_id).is_err());
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
    let other_token = address_from_fixture(&ctx.env, FIXTURE_PROVIDER);

    ctx.client.whitelist_token(&other_token);
    MockToken::register(&ctx.env, &other_token);
    let mock = MockTokenClient::new(&ctx.env, &other_token);
    mock.mint(&ctx.depositor, &1_000);
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
    let other_token = address_from_fixture(&ctx.env, FIXTURE_PROVIDER);
    MockToken::register(&ctx.env, &other_token);

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
    let verifier_id = env.register(MeteredVerifier, ());
    let escrow_id = env.register(SlateEscrow, ());
    let client = SlateEscrowClient::new(&env, &escrow_id);
    client.init(&verifier_id);

    let token = address_from_fixture(&env, FIXTURE_TOKEN);
    MockToken::register(&env, &token);
    client.whitelist_token(&token);

    let depositor = address_from_fixture(&env, FIXTURE_DEPOSITOR);
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
        &proof,
        &signals,
        &ctx.depositor,
        &ctx.provider,
        &ctx.token,
    );

    let result = ctx.client.try_settle(
        &proof,
        &signals,
        &ctx.depositor,
        &ctx.provider,
        &ctx.token,
    );
    assert!(result.is_err());
}

#[test]
fn settle_rejects_wrong_provider() {
    let ctx = setup();
    deposit(&ctx, ESCROW_AMOUNT);

    let wrong_provider = Address::generate(&ctx.env);
    let result = ctx.client.try_settle(
        &proof(&ctx.env),
        &fixture::public_signals(&ctx.env),
        &ctx.depositor,
        &wrong_provider,
        &ctx.token,
    );
    assert!(result.is_err());
}

#[test]
fn settle_rejects_wrong_depositor() {
    let ctx = setup();
    deposit(&ctx, ESCROW_AMOUNT);

    let wrong_depositor = Address::generate(&ctx.env);
    let result = ctx.client.try_settle(
        &proof(&ctx.env),
        &fixture::public_signals(&ctx.env),
        &wrong_depositor,
        &ctx.provider,
        &ctx.token,
    );
    assert!(result.is_err());
}

#[test]
fn settle_rejects_insufficient_internal_balance() {
    let ctx = setup();
    deposit(&ctx, ESCROW_AMOUNT - 1);

    let result = ctx.client.try_settle(
        &proof(&ctx.env),
        &fixture::public_signals(&ctx.env),
        &ctx.depositor,
        &ctx.provider,
        &ctx.token,
    );
    assert!(result.is_err());
}

#[test]
fn refund_returns_full_balance_to_depositor() {
    let ctx = setup();
    let amount = 10_000_i128;
    deposit(&ctx, amount);

    let token_client = TokenClient::new(&ctx.env, &ctx.token);
    let depositor_before = token_client.balance(&ctx.depositor);

    ctx.client.refund(&ctx.depositor, &ctx.token);

    assert_eq!(ctx.client.get_balance(&ctx.depositor, &ctx.token), 0);
    assert_eq!(token_client.balance(&ctx.depositor), depositor_before + amount);
    assert_eq!(token_client.balance(&ctx.escrow_id), 0);
}

#[test]
fn refund_requires_auth() {
    let env = Env::default();
    let verifier_id = env.register(MeteredVerifier, ());
    let escrow_id = env.register(SlateEscrow, ());
    let client = SlateEscrowClient::new(&env, &escrow_id);
    client.init(&verifier_id);

    let token = address_from_fixture(&env, FIXTURE_TOKEN);
    MockToken::register(&env, &token);
    client.whitelist_token(&token);

    let depositor = address_from_fixture(&env, FIXTURE_DEPOSITOR);
    let result = client.try_refund(&depositor, &token);
    assert!(result.is_err());
}

#[test]
fn refund_rejects_zero_balance() {
    let ctx = setup();

    let result = ctx.client.try_refund(&ctx.depositor, &ctx.token);
    assert!(result.is_err());
}

#[test]
fn refund_rejects_non_whitelisted_token() {
    let ctx = setup();
    deposit(&ctx, 5_000);

    let other_token = address_from_fixture(&ctx.env, FIXTURE_PROVIDER);
    MockToken::register(&ctx.env, &other_token);

    let result = ctx.client.try_refund(&ctx.depositor, &other_token);
    assert!(result.is_err());
}
