#![cfg(test)]

use super::*;
use crate::fixture;
use soroban_sdk::{address_payload::AddressPayload, Address, BytesN, Env, Vec, U256};

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
    client: SlateAgentRegistryClient<'a>,
    channel_id: U256,
    rate_commitment: U256,
    consumer_pubkey_x: U256,
    consumer_pubkey_y: U256,
    depositor: Address,
    provider: Address,
    token: Address,
    public_signals: Vec<U256>,
}

fn address_from_fixture(env: &Env, bytes: [u8; 32]) -> Address {
    AddressPayload::ContractIdHash(BytesN::from_array(env, &bytes)).to_address(env)
}

fn setup() -> TestContext<'static> {
    let env = Env::default();
    env.mock_all_auths();

    let registry_id = env.register(SlateAgentRegistry, ());
    let client = SlateAgentRegistryClient::new(&env, &registry_id);

    let public_signals = fixture::public_signals(&env);
    let channel_id = public_signals.get(0).unwrap();
    let rate_commitment = public_signals.get(1).unwrap();
    let consumer_pubkey_x = public_signals.get(5).unwrap();
    let consumer_pubkey_y = public_signals.get(6).unwrap();

    let depositor = address_from_fixture(&env, FIXTURE_DEPOSITOR);
    let provider = address_from_fixture(&env, FIXTURE_PROVIDER);
    let token = address_from_fixture(&env, FIXTURE_TOKEN);

    TestContext {
        env,
        client,
        channel_id,
        rate_commitment,
        consumer_pubkey_x,
        consumer_pubkey_y,
        depositor,
        provider,
        token,
        public_signals,
    }
}

fn register_fixture_channel(ctx: &TestContext) {
    ctx.client.register_channel(
        &ctx.channel_id,
        &ctx.rate_commitment,
        &ctx.consumer_pubkey_x,
        &ctx.consumer_pubkey_y,
        &ctx.depositor,
        &ctx.provider,
        &ctx.token,
    );
}

#[test]
fn register_channel_stores_record() {
    let ctx = setup();
    register_fixture_channel(&ctx);

    assert!(ctx.client.has_channel(&ctx.channel_id));

    let entry = ctx.client.get_channel(&ctx.channel_id);
    assert_eq!(entry.status, ChannelStatus::Open);
    assert_eq!(entry.record.rate_commitment, ctx.rate_commitment);
    assert_eq!(entry.record.consumer_pubkey_x, ctx.consumer_pubkey_x);
    assert_eq!(entry.record.consumer_pubkey_y, ctx.consumer_pubkey_y);
    assert_eq!(entry.record.depositor, ctx.depositor);
    assert_eq!(entry.record.provider, ctx.provider);
    assert_eq!(entry.record.token, ctx.token);
}

#[test]
fn register_channel_rejects_duplicate() {
    let ctx = setup();
    register_fixture_channel(&ctx);

    assert!(ctx
        .client
        .try_register_channel(
            &ctx.channel_id,
            &ctx.rate_commitment,
            &ctx.consumer_pubkey_x,
            &ctx.consumer_pubkey_y,
            &ctx.depositor,
            &ctx.provider,
            &ctx.token,
        )
        .is_err());
}

#[test]
fn register_channel_requires_depositor_auth() {
    let ctx = setup();
    ctx.env.set_auths(&[]);

    assert!(ctx
        .client
        .try_register_channel(
            &ctx.channel_id,
            &ctx.rate_commitment,
            &ctx.consumer_pubkey_x,
            &ctx.consumer_pubkey_y,
            &ctx.depositor,
            &ctx.provider,
            &ctx.token,
        )
        .is_err());
}

#[test]
fn get_channel_rejects_unknown_id() {
    let ctx = setup();
    let unknown = U256::from_u32(&ctx.env, 42);

    assert!(ctx.client.try_get_channel(&unknown).is_err());
}

#[test]
fn validate_for_settlement_accepts_matching_fixture() {
    let ctx = setup();
    register_fixture_channel(&ctx);

    ctx.client
        .validate_for_settlement(&ctx.channel_id, &ctx.public_signals);
}

#[test]
fn validate_for_settlement_rejects_wrong_channel_id() {
    let ctx = setup();
    register_fixture_channel(&ctx);

    let wrong_id = U256::from_u32(&ctx.env, 1);
    assert!(ctx
        .client
        .try_validate_for_settlement(&wrong_id, &ctx.public_signals)
        .is_err());
}

#[test]
fn validate_for_settlement_rejects_mismatched_rate_commitment() {
    let ctx = setup();
    register_fixture_channel(&ctx);

    let mut signals = ctx.public_signals.clone();
    signals.set(1, U256::from_u32(&ctx.env, 999));

    assert!(ctx
        .client
        .try_validate_for_settlement(&ctx.channel_id, &signals)
        .is_err());
}

#[test]
fn validate_for_settlement_rejects_mismatched_depositor() {
    let ctx = setup();
    register_fixture_channel(&ctx);

    let mut signals = ctx.public_signals.clone();
    signals.set(7, U256::from_u32(&ctx.env, 1));

    assert!(ctx
        .client
        .try_validate_for_settlement(&ctx.channel_id, &signals)
        .is_err());
}

#[test]
fn validate_for_settlement_rejects_closed_channel() {
    let ctx = setup();
    register_fixture_channel(&ctx);
    ctx.client.close_channel(&ctx.channel_id, &ctx.depositor);

    assert!(ctx
        .client
        .try_validate_for_settlement(&ctx.channel_id, &ctx.public_signals)
        .is_err());
}

#[test]
fn validate_for_settlement_rejects_wrong_public_input_length() {
    let ctx = setup();
    register_fixture_channel(&ctx);

    let short = Vec::new(&ctx.env);
    assert!(ctx
        .client
        .try_validate_for_settlement(&ctx.channel_id, &short)
        .is_err());
}

#[test]
fn close_channel_by_depositor_succeeds() {
    let ctx = setup();
    register_fixture_channel(&ctx);

    ctx.client.close_channel(&ctx.channel_id, &ctx.depositor);

    let entry = ctx.client.get_channel(&ctx.channel_id);
    assert_eq!(entry.status, ChannelStatus::Closed);
}

#[test]
fn close_channel_by_provider_succeeds() {
    let ctx = setup();
    register_fixture_channel(&ctx);

    ctx.client.close_channel(&ctx.channel_id, &ctx.provider);

    let entry = ctx.client.get_channel(&ctx.channel_id);
    assert_eq!(entry.status, ChannelStatus::Closed);
}

#[test]
fn close_channel_rejects_unauthorized_caller() {
    let ctx = setup();
    register_fixture_channel(&ctx);

    let stranger = address_from_fixture(&ctx.env, FIXTURE_TOKEN);
    assert!(ctx
        .client
        .try_close_channel(&ctx.channel_id, &stranger)
        .is_err());
}

#[test]
fn close_channel_rejects_already_closed() {
    let ctx = setup();
    register_fixture_channel(&ctx);
    ctx.client.close_channel(&ctx.channel_id, &ctx.depositor);

    assert!(ctx
        .client
        .try_close_channel(&ctx.channel_id, &ctx.provider)
        .is_err());
}
