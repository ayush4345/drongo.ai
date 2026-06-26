#![no_std]
use soroban_sdk::{
    address_payload::AddressPayload, contract, contractimpl, contracttype, Address, BytesN, Env,
    Vec, U256,
};

/// Number of public inputs in the metered settlement circuit.
const N_PUBLIC: u32 = 13;

const IDX_CHANNEL_ID: u32 = 0;
const IDX_RATE_COMMITMENT: u32 = 1;
const IDX_CONSUMER_PUBKEY_X: u32 = 5;
const IDX_CONSUMER_PUBKEY_Y: u32 = 6;
const IDX_DEPOSITOR_HI: u32 = 7;
const IDX_DEPOSITOR_LO: u32 = 8;
const IDX_PROVIDER_HI: u32 = 9;
const IDX_PROVIDER_LO: u32 = 10;
const IDX_TOKEN_HI: u32 = 11;
const IDX_TOKEN_LO: u32 = 12;

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum ChannelStatus {
    Open,
    Closed,
}

/// Fixed settlement arguments for a payment channel, keyed by `channel_id`.
///
/// These fields correspond to the non-varying public inputs in
/// `setttlement.circom` (indices 1, 5–12). Per-settlement values
/// (`escrow_amount`, `settlement_amount`, `nullifier`) are supplied in the
/// proof and are not stored here.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct ChannelRecord {
    pub rate_commitment: U256,
    pub consumer_pubkey_x: U256,
    pub consumer_pubkey_y: U256,
    pub depositor: Address,
    pub provider: Address,
    pub token: Address,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct ChannelEntry {
    pub record: ChannelRecord,
    pub status: ChannelStatus,
}

#[contracttype]
enum DataKey {
    Channel(U256),
}

fn address_payload_bytes(address: &Address) -> BytesN<32> {
    match address
        .to_payload()
        .expect("address type is not supported for channel binding")
    {
        AddressPayload::AccountIdPublicKeyEd25519(bytes) => bytes,
        AddressPayload::ContractIdHash(bytes) => bytes,
    }
}

fn address_to_field_pair(env: &Env, bytes: &BytesN<32>) -> (U256, U256) {
    let raw = bytes.to_array();
    let hi = u128::from_be_bytes(raw[0..16].try_into().unwrap());
    let lo = u128::from_be_bytes(raw[16..32].try_into().unwrap());
    (U256::from_u128(env, hi), U256::from_u128(env, lo))
}

fn assert_address_matches_signals(
    env: &Env,
    address: &Address,
    public_signals: &Vec<U256>,
    hi_idx: u32,
    lo_idx: u32,
    label: &str,
) {
    let (hi, lo) = address_to_field_pair(env, &address_payload_bytes(address));
    let signal_hi = public_signals
        .get(hi_idx)
        .unwrap_or_else(|| panic!("Missing {label} high limb in public signals"));
    let signal_lo = public_signals
        .get(lo_idx)
        .unwrap_or_else(|| panic!("Missing {label} low limb in public signals"));

    if signal_hi != hi || signal_lo != lo {
        panic!("{label} does not match proof public inputs");
    }
}

fn load_channel(env: &Env, channel_id: &U256) -> ChannelEntry {
    let key = DataKey::Channel(channel_id.clone());
    env.storage()
        .persistent()
        .get(&key)
        .unwrap_or_else(|| panic!("Channel not found"))
}

#[contract]
pub struct SlateAgentRegistry;

#[contractimpl]
impl SlateAgentRegistry {
    /// Register a new payment channel. The depositor must authorize the call.
    ///
    /// `channel_id` is the opaque identifier used in the ZK circuit and must be
    /// unique. The stored fields are the fixed public inputs that every
    /// settlement proof for this channel must include.
    pub fn register_channel(
        env: Env,
        channel_id: U256,
        rate_commitment: U256,
        consumer_pubkey_x: U256,
        consumer_pubkey_y: U256,
        depositor: Address,
        provider: Address,
        token: Address,
    ) {
        depositor.require_auth();

        let key = DataKey::Channel(channel_id.clone());
        if env.storage().persistent().has(&key) {
            panic!("Channel already registered");
        }

        let entry = ChannelEntry {
            record: ChannelRecord {
                rate_commitment,
                consumer_pubkey_x,
                consumer_pubkey_y,
                depositor,
                provider,
                token,
            },
            status: ChannelStatus::Open,
        };

        env.storage().persistent().set(&key, &entry);
    }

    /// Return the channel record and lifecycle status for `channel_id`.
    pub fn get_channel(env: Env, channel_id: U256) -> ChannelEntry {
        load_channel(&env, &channel_id)
    }

    /// Whether a channel record exists for `channel_id`.
    pub fn has_channel(env: Env, channel_id: U256) -> bool {
        let key = DataKey::Channel(channel_id);
        env.storage().persistent().has(&key)
    }

    /// Assert that `public_signals` are consistent with the registered channel.
    ///
    /// Intended for cross-contract use by `slate-escrow` before settlement:
    /// checks channel is open, `public_signals[0]` matches `channel_id`, and
    /// indices 1 and 5–12 match the stored record.
    pub fn validate_for_settlement(env: Env, channel_id: U256, public_signals: Vec<U256>) {
        if public_signals.len() != N_PUBLIC {
            panic!("Wrong public input length");
        }

        let signal_channel_id = public_signals
            .get(IDX_CHANNEL_ID)
            .expect("Missing channel_id in public signals");
        if signal_channel_id != channel_id {
            panic!("channel_id does not match proof public inputs");
        }

        let entry = load_channel(&env, &channel_id);
        if entry.status != ChannelStatus::Open {
            panic!("Channel is not open");
        }

        let record = &entry.record;

        let signal_rate_commitment = public_signals
            .get(IDX_RATE_COMMITMENT)
            .expect("Missing rate_commitment in public signals");
        if signal_rate_commitment != record.rate_commitment {
            panic!("rate_commitment does not match registered channel");
        }

        let signal_pubkey_x = public_signals
            .get(IDX_CONSUMER_PUBKEY_X)
            .expect("Missing consumer_pubkey_x in public signals");
        let signal_pubkey_y = public_signals
            .get(IDX_CONSUMER_PUBKEY_Y)
            .expect("Missing consumer_pubkey_y in public signals");
        if signal_pubkey_x != record.consumer_pubkey_x
            || signal_pubkey_y != record.consumer_pubkey_y
        {
            panic!("consumer pubkey does not match registered channel");
        }

        assert_address_matches_signals(
            &env,
            &record.depositor,
            &public_signals,
            IDX_DEPOSITOR_HI,
            IDX_DEPOSITOR_LO,
            "Depositor",
        );
        assert_address_matches_signals(
            &env,
            &record.provider,
            &public_signals,
            IDX_PROVIDER_HI,
            IDX_PROVIDER_LO,
            "Provider",
        );
        assert_address_matches_signals(
            &env,
            &record.token,
            &public_signals,
            IDX_TOKEN_HI,
            IDX_TOKEN_LO,
            "Token",
        );
    }

    /// Mark a channel closed. Only the registered depositor or provider may call.
    pub fn close_channel(env: Env, channel_id: U256, caller: Address) {
        caller.require_auth();

        let key = DataKey::Channel(channel_id.clone());
        let mut entry: ChannelEntry = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic!("Channel not found"));

        if entry.status == ChannelStatus::Closed {
            panic!("Channel is already closed");
        }

        if caller != entry.record.depositor && caller != entry.record.provider {
            panic!("Only depositor or provider may close channel");
        }

        entry.status = ChannelStatus::Closed;
        env.storage().persistent().set(&key, &entry);
    }
}

#[cfg(test)]
mod fixture;
#[cfg(test)]
mod test;
