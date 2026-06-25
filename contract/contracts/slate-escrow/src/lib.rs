#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, token, Address, Env, Vec, U256};

#[contracttype]
enum SlateEscrowType {
    WhitelistToken,
    DepositorBalance(DepositorKey),
    Nullifier(U256),
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct DepositorKey {
    pub user: Address,
    pub token: Address,
}

mod metered_verifier {
    soroban_sdk::contractimport!(
        file = "../../../slate-circom/verifier-soroban/target/wasm32v1-none/release/meteredverifier.wasm"
    );
}

#[contract]
pub struct SlateEscrow;

#[contractimpl]
impl SlateEscrow {
    pub fn init(env: Env) {
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
        verifier: Address,
        proof: metered_verifier::Proof,
        public_signals: Vec<U256>,
        depositor: Address,
        provider: Address,
        token: Address,
    ) {
        let metered_client = metered_verifier::Client::new(&env, &verifier);
        let is_verified = metered_client.verify(&proof, &public_signals);

        if !is_verified {
            panic!("Inavlid zk proof");
        }

        let escrow_amount_u256 = public_signals.get(2).expect("Missing escrow amount");
        let settlement_amount_u256 = public_signals.get(3).expect("Missing settlement amount");
        let nullifier = public_signals.get(4).expect("Missing nullifier hash");

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
}

#[cfg(test)]
mod fixture;
#[cfg(test)]
mod test;
