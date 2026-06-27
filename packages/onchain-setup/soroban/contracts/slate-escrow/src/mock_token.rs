#![cfg(test)]

use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, MuxedAddress};

#[contracttype]
enum DataKey {
    Balance(Address),
}

#[contract]
pub struct MockToken;

#[contractimpl]
impl MockToken {
    pub fn mint(env: Env, to: Address, amount: i128) {
        let key = DataKey::Balance(to.clone());
        let balance: i128 = env.storage().persistent().get(&key).unwrap_or(0);
        env.storage()
            .persistent()
            .set(&key, &(balance + amount));
    }

    pub fn transfer(env: Env, from: Address, to: MuxedAddress, amount: i128) {
        from.require_auth();
        if amount <= 0 {
            panic!("amount must be positive");
        }

        let to_address = to.address();
        let from_key = DataKey::Balance(from.clone());
        let to_key = DataKey::Balance(to_address.clone());
        let from_balance: i128 = env.storage().persistent().get(&from_key).unwrap_or(0);
        if from_balance < amount {
            panic!("insufficient balance");
        }
        let to_balance: i128 = env.storage().persistent().get(&to_key).unwrap_or(0);

        env.storage()
            .persistent()
            .set(&from_key, &(from_balance - amount));
        env.storage()
            .persistent()
            .set(&to_key, &(to_balance + amount));
    }

    pub fn balance(env: Env, id: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::Balance(id))
            .unwrap_or(0)
    }
}

impl MockToken {
    pub fn register(env: &Env, token_id: &Address) -> Address {
        env.register_at(token_id, MockToken, ());
        token_id.clone()
    }
}
