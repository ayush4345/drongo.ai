#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, token, Address, Env, Map, Vec};

#[contracttype]
enum SlateEscrowType {
    Depositors,
    WhitelistToken,
}

#[contract]
pub struct SlateEscrow;

#[contractimpl]
impl SlateEscrow {
    pub fn init(env: Env) {
        if env.storage().instance().has(&SlateEscrowType::Depositors) {
            panic!("Contract already initialized");
        }

        let initial_depositors: Map<Address, i128> = Map::new(&env);
        let initial_whitelist: Vec<Address> = Vec::new(&env);

        env.storage()
            .instance()
            .set(&SlateEscrowType::Depositors, &initial_depositors);
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

        let mut depositors: Map<Address, i128> = env
            .storage()
            .instance()
            .get(&SlateEscrowType::Depositors)
            .expect("Contract not initialized");

        let current_balance = depositors.get(address.clone()).unwrap_or(0);

        let new_balance = current_balance + amount;
        depositors.set(address.clone(), new_balance);

        env.storage()
            .instance()
            .set(&SlateEscrowType::Depositors, &depositors);
    }
}
