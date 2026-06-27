#![no_std]
use soroban_sdk::{
    address_payload::AddressPayload, contract, contractimpl, contracttype, token, Address, BytesN,
    Env, Vec, U256,
};

const N_PUBLIC: u32 = 13;
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

mod metered_verifier {
    soroban_sdk::contractimport!(
        file = "../../../target/wasm32v1-none/release/meteredverifier.wasm"
    );
}

fn address_payload_bytes(address: &Address) -> BytesN<32> {
    match address
        .to_payload()
        .expect("address type is not supported for settlement binding")
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

#[contract]
pub struct SlateEscrow;

#[contractimpl]
impl SlateEscrow {
    pub fn init(env: Env, verifier: Address) {
        if env
            .storage()
            .instance()
            .has(&SlateEscrowType::WhitelistToken)
        {
            panic!("Contract already initialized");
        }

        let initial_whitelist: Vec<Address> = Vec::new(&env);

        env.storage()
            .instance()
            .set(&SlateEscrowType::WhitelistToken, &initial_whitelist);
        env.storage()
            .instance()
            .set(&SlateEscrowType::Verifier, &verifier);
    }

    pub fn get_verifier(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&SlateEscrowType::Verifier)
            .expect("Contract not initialized")
    }

    pub fn whitelist_token(env: Env, token_address: Address) {
        let mut whitelist: Vec<Address> = env
            .storage()
            .instance()
            .get(&SlateEscrowType::WhitelistToken)
            .expect("Contract not initialized");

        if !whitelist.contains(&token_address) {
            whitelist.push_back(token_address);

            env.storage()
                .instance()
                .set(&SlateEscrowType::WhitelistToken, &whitelist);
        }
    }

    pub fn add_to_depositors(env: Env, address: Address, amount: i128, token_address: Address) {
        address.require_auth();

        if amount <= 0 {
            panic!("Amount must be greater than zero");
        }

        let whitelist: Vec<Address> = env
            .storage()
            .instance()
            .get(&SlateEscrowType::WhitelistToken)
            .expect("Contract not initialized");

        if !whitelist.contains(&token_address) {
            panic!("Token is not whitelisted");
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
    ) {
        if public_signals.len() != N_PUBLIC {
            panic!("Wrong public input length");
        }

        assert_address_matches_signals(
            &env,
            &depositor,
            &public_signals,
            IDX_DEPOSITOR_HI,
            IDX_DEPOSITOR_LO,
            "Depositor",
        );
        assert_address_matches_signals(
            &env,
            &provider,
            &public_signals,
            IDX_PROVIDER_HI,
            IDX_PROVIDER_LO,
            "Provider",
        );
        assert_address_matches_signals(
            &env,
            &token,
            &public_signals,
            IDX_TOKEN_HI,
            IDX_TOKEN_LO,
            "Token",
        );

        let verifier: Address = env
            .storage()
            .instance()
            .get(&SlateEscrowType::Verifier)
            .expect("Contract not initialized");

        let metered_client = metered_verifier::Client::new(&env, &verifier);
        let verifier_proof = metered_verifier::Proof {
            a: proof.a,
            b: proof.b,
            c: proof.c,
        };
        let is_verified = metered_client.verify(&verifier_proof, &public_signals);

        if !is_verified {
            panic!("Invalid zk proof");
        }

        let escrow_amount_u256 = public_signals
            .get(IDX_ESCROW_AMOUNT)
            .expect("Missing escrow amount");
        let settlement_amount_u256 = public_signals
            .get(IDX_SETTLEMENT_AMOUNT)
            .expect("Missing settlement amount");
        let nullifier = public_signals
            .get(IDX_NULLIFIER)
            .expect("Missing nullifier hash");

        let escrow_amount: i128 = escrow_amount_u256
            .to_u128()
            .expect("Escrow amount exceeds u128")
            .try_into()
            .expect("Escrow amount exceeds i128");

        let settlement_amount: i128 = settlement_amount_u256
            .to_u128()
            .expect("Settlement amount exceeds u128")
            .try_into()
            .expect("Settlement amount exceeds i128");

        if settlement_amount > escrow_amount {
            panic!("Settlement amount cannot exceed escrow amount");
        }

        let nullifier_key = SlateEscrowType::Nullifier(nullifier.clone());
        if env.storage().persistent().has(&nullifier_key) {
            panic!("Proof has already been settled (nullifier spent)");
        }

        env.storage().persistent().set(&nullifier_key, &true);

        let balance_key = SlateEscrowType::DepositorBalance(DepositorKey {
            user: depositor.clone(),
            token: token.clone(),
        });

        let current_balance = env.storage().persistent().get(&balance_key).unwrap_or(0);
        if current_balance < escrow_amount {
            panic!("Insufficient contract balance allocated for this escrow");
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
    }

    pub fn refund(env: Env, depositor: Address, token_address: Address) {
        depositor.require_auth();

        let whitelist: Vec<Address> = env
            .storage()
            .instance()
            .get(&SlateEscrowType::WhitelistToken)
            .expect("Contract not initialized");

        if !whitelist.contains(&token_address) {
            panic!("Token is not whitelisted");
        }

        let balance_key = SlateEscrowType::DepositorBalance(DepositorKey {
            user: depositor.clone(),
            token: token_address.clone(),
        });

        let balance = env.storage().persistent().get(&balance_key).unwrap_or(0);

        if balance <= 0 {
            panic!("No balance to refund");
        }

        token::Client::new(&env, &token_address).transfer(
            &env.current_contract_address(),
            &depositor,
            &balance,
        );

        env.storage().persistent().set(&balance_key, &0i128);
    }
}

#[cfg(test)]
mod fixture;
#[cfg(test)]
mod mock_token;
#[cfg(test)]
mod test;
