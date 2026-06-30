#![no_std]
use soroban_sdk::{
    address_payload::AddressPayload, contract, contracterror, contractimpl, contracttype, token,
    Address, BytesN, Env, TryFromVal, Val, Vec, U256,
};

const N_PUBLIC: u32 = 13;
const IDX_CHANNEL_ID: u32 = 0;
const IDX_ESCROW_AMOUNT: u32 = 2;
const IDX_SETTLEMENT_AMOUNT: u32 = 3;
const IDX_NULLIFIER: u32 = 4;
const IDX_DEPOSITOR_HI: u32 = 7;
const IDX_DEPOSITOR_LO: u32 = 8;
const IDX_PROVIDER_HI: u32 = 9;
const IDX_PROVIDER_LO: u32 = 10;
const IDX_TOKEN_HI: u32 = 11;
const IDX_TOKEN_LO: u32 = 12;

#[contracttype]
enum SlateEscrowType {
    WhitelistToken,
    Verifier,
    Registry,
    DepositorBalance(DepositorKey),
    Nullifier(U256),
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct DepositorKey {
    pub user: Address,
    pub token: Address,
}

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
    AlreadyInitialized = 1,
    NotInitialized = 2,
    InvalidAmount = 3,
    TokenNotWhitelisted = 4,
    WrongPublicInputLength = 5,
    MissingChannelId = 6,
    DepositorMismatch = 7,
    ProviderMismatch = 8,
    TokenMismatch = 9,
    InvalidProof = 10,
    MissingEscrowAmount = 11,
    MissingSettlementAmount = 12,
    MissingNullifier = 13,
    EscrowAmountOverflow = 14,
    SettlementAmountOverflow = 15,
    SettlementExceedsEscrow = 16,
    NullifierSpent = 17,
    InsufficientBalance = 18,
    NoBalanceToRefund = 19,
    UnsupportedAddress = 20,
    MissingPublicSignal = 21,
}

enum AddressRole {
    Depositor,
    Provider,
    Token,
}

mod metered_verifier {
    soroban_sdk::contractimport!(
        file = "../../target/wasm32v1-none/release/meteredverifier.wasm"
    );
}

mod agent_registry {
    soroban_sdk::contractimport!(
        file = "../../target/wasm32v1-none/release/slate_agent_registry.wasm"
    );
}

fn address_payload_bytes(address: &Address) -> Result<BytesN<32>, Error> {
    match address.to_payload() {
        Some(AddressPayload::AccountIdPublicKeyEd25519(bytes)) => Ok(bytes),
        Some(AddressPayload::ContractIdHash(bytes)) => Ok(bytes),
        _ => Err(Error::UnsupportedAddress),
    }
}

fn address_to_field_pair(env: &Env, bytes: &BytesN<32>) -> (U256, U256) {
    let raw = bytes.to_array();
    let hi = u128::from_be_bytes(raw[0..16].try_into().unwrap());
    let lo = u128::from_be_bytes(raw[16..32].try_into().unwrap());
    (U256::from_u128(env, hi), U256::from_u128(env, lo))
}

fn check_address_matches_signals(
    env: &Env,
    address: &Address,
    public_signals: &Vec<U256>,
    hi_idx: u32,
    lo_idx: u32,
    role: AddressRole,
) -> Result<(), Error> {
    let (hi, lo) = address_to_field_pair(env, &address_payload_bytes(address)?);
    let signal_hi = public_signals
        .get(hi_idx)
        .ok_or(Error::MissingPublicSignal)?;
    let signal_lo = public_signals
        .get(lo_idx)
        .ok_or(Error::MissingPublicSignal)?;

    if signal_hi != hi || signal_lo != lo {
        return Err(match role {
            AddressRole::Depositor => Error::DepositorMismatch,
            AddressRole::Provider => Error::ProviderMismatch,
            AddressRole::Token => Error::TokenMismatch,
        });
    }

    Ok(())
}

fn require_initialized<T: TryFromVal<Env, Val>>(env: &Env, key: SlateEscrowType) -> Result<T, Error> {
    env.storage()
        .instance()
        .get(&key)
        .ok_or(Error::NotInitialized)
}

#[contract]
pub struct SlateEscrow;

#[contractimpl]
impl SlateEscrow {
    pub fn init(env: Env, verifier: Address, registry: Address) -> Result<(), Error> {
        if env
            .storage()
            .instance()
            .has(&SlateEscrowType::WhitelistToken)
        {
            return Err(Error::AlreadyInitialized);
        }

        let initial_whitelist: Vec<Address> = Vec::new(&env);

        env.storage()
            .instance()
            .set(&SlateEscrowType::WhitelistToken, &initial_whitelist);
        env.storage()
            .instance()
            .set(&SlateEscrowType::Verifier, &verifier);
        env.storage()
            .instance()
            .set(&SlateEscrowType::Registry, &registry);
        Ok(())
    }

    pub fn get_verifier(env: Env) -> Result<Address, Error> {
        require_initialized(&env, SlateEscrowType::Verifier)
    }

    pub fn get_registry(env: Env) -> Result<Address, Error> {
        require_initialized(&env, SlateEscrowType::Registry)
    }

    pub fn whitelist_token(env: Env, token_address: Address) -> Result<(), Error> {
        let mut whitelist: Vec<Address> =
            require_initialized(&env, SlateEscrowType::WhitelistToken)?;

        if !whitelist.contains(&token_address) {
            whitelist.push_back(token_address);

            env.storage()
                .instance()
                .set(&SlateEscrowType::WhitelistToken, &whitelist);
        }

        Ok(())
    }

    pub fn add_to_depositors(
        env: Env,
        address: Address,
        amount: i128,
        token_address: Address,
    ) -> Result<(), Error> {
        address.require_auth();

        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }

        let whitelist: Vec<Address> =
            require_initialized(&env, SlateEscrowType::WhitelistToken)?;

        if !whitelist.contains(&token_address) {
            return Err(Error::TokenNotWhitelisted);
        }

        let token_client = token::Client::new(&env, &token_address);
        token_client.transfer(&address, env.current_contract_address(), &amount);

        let balance_key = SlateEscrowType::DepositorBalance(DepositorKey {
            user: address.clone(),
            token: token_address.clone(),
        });

        let current_balance = env.storage().persistent().get(&balance_key).unwrap_or(0);

        let new_balance = current_balance + amount;

        env.storage().persistent().set(&balance_key, &new_balance);
        Ok(())
    }

    pub fn get_balance(env: Env, address: Address, token_address: Address) -> i128 {
        let balance_key = SlateEscrowType::DepositorBalance(DepositorKey {
            user: address,
            token: token_address,
        });

        env.storage().persistent().get(&balance_key).unwrap_or(0)
    }

    pub fn settle(
        env: Env,
        proof: Proof,
        public_signals: Vec<U256>,
        depositor: Address,
        provider: Address,
        token: Address,
    ) -> Result<(), Error> {
        if public_signals.len() != N_PUBLIC {
            return Err(Error::WrongPublicInputLength);
        }

        let channel_id = public_signals
            .get(IDX_CHANNEL_ID)
            .ok_or(Error::MissingChannelId)?;

        let registry: Address = require_initialized(&env, SlateEscrowType::Registry)?;

        let registry_client = agent_registry::Client::new(&env, &registry);
        registry_client.validate_for_settlement(&channel_id, &public_signals);

        check_address_matches_signals(
            &env,
            &depositor,
            &public_signals,
            IDX_DEPOSITOR_HI,
            IDX_DEPOSITOR_LO,
            AddressRole::Depositor,
        )?;
        check_address_matches_signals(
            &env,
            &provider,
            &public_signals,
            IDX_PROVIDER_HI,
            IDX_PROVIDER_LO,
            AddressRole::Provider,
        )?;
        check_address_matches_signals(
            &env,
            &token,
            &public_signals,
            IDX_TOKEN_HI,
            IDX_TOKEN_LO,
            AddressRole::Token,
        )?;

        let verifier: Address = require_initialized(&env, SlateEscrowType::Verifier)?;

        let metered_client = metered_verifier::Client::new(&env, &verifier);
        let verifier_proof = metered_verifier::Proof {
            a: proof.a,
            b: proof.b,
            c: proof.c,
        };
        let is_verified = metered_client.verify(&verifier_proof, &public_signals);

        if !is_verified {
            return Err(Error::InvalidProof);
        }

        let escrow_amount_u256 = public_signals
            .get(IDX_ESCROW_AMOUNT)
            .ok_or(Error::MissingEscrowAmount)?;
        let settlement_amount_u256 = public_signals
            .get(IDX_SETTLEMENT_AMOUNT)
            .ok_or(Error::MissingSettlementAmount)?;
        let nullifier = public_signals
            .get(IDX_NULLIFIER)
            .ok_or(Error::MissingNullifier)?;

        let escrow_amount: i128 = escrow_amount_u256
            .to_u128()
            .ok_or(Error::EscrowAmountOverflow)?
            .try_into()
            .map_err(|_| Error::EscrowAmountOverflow)?;

        let settlement_amount: i128 = settlement_amount_u256
            .to_u128()
            .ok_or(Error::SettlementAmountOverflow)?
            .try_into()
            .map_err(|_| Error::SettlementAmountOverflow)?;

        if settlement_amount > escrow_amount {
            return Err(Error::SettlementExceedsEscrow);
        }

        let nullifier_key = SlateEscrowType::Nullifier(nullifier.clone());
        if env.storage().persistent().has(&nullifier_key) {
            return Err(Error::NullifierSpent);
        }

        env.storage().persistent().set(&nullifier_key, &true);

        let balance_key = SlateEscrowType::DepositorBalance(DepositorKey {
            user: depositor.clone(),
            token: token.clone(),
        });

        let current_balance = env.storage().persistent().get(&balance_key).unwrap_or(0);
        if current_balance < escrow_amount {
            return Err(Error::InsufficientBalance);
        }

        let new_balance = current_balance - escrow_amount;
        env.storage().persistent().set(&balance_key, &new_balance);

        let token_client = token::Client::new(&env, &token);

        if settlement_amount > 0 {
            token_client.transfer(
                &env.current_contract_address(),
                &provider,
                &settlement_amount,
            );
        }

        let refund_amount = escrow_amount - settlement_amount;
        if refund_amount > 0 {
            token_client.transfer(&env.current_contract_address(), &depositor, &refund_amount);
        }

        Ok(())
    }

    pub fn refund(env: Env, depositor: Address, token_address: Address) -> Result<(), Error> {
        depositor.require_auth();

        let whitelist: Vec<Address> =
            require_initialized(&env, SlateEscrowType::WhitelistToken)?;

        if !whitelist.contains(&token_address) {
            return Err(Error::TokenNotWhitelisted);
        }

        let balance_key = SlateEscrowType::DepositorBalance(DepositorKey {
            user: depositor.clone(),
            token: token_address.clone(),
        });

        let balance = env.storage().persistent().get(&balance_key).unwrap_or(0);

        if balance <= 0 {
            return Err(Error::NoBalanceToRefund);
        }

        token::Client::new(&env, &token_address).transfer(
            &env.current_contract_address(),
            &depositor,
            &balance,
        );

        env.storage().persistent().set(&balance_key, &0i128);
        Ok(())
    }
}

#[cfg(test)]
mod fixture;
#[cfg(test)]
mod mock_token;
#[cfg(test)]
mod test;
