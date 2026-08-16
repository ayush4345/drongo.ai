# Slate EVM / Base contracts

Foundry contracts for Base (Ethereum L2): Groth16 verifier, escrow, and
agent registry.

## Layout

| Contract | Role |
|---|---|
| `SettlementVerifier.sol` | Groth16/BN254 verifier (VK from `meteredverifier/src/vk.rs`) |
| `SlateAgentRegistry.sol` | Channel identity + open/closed lifecycle |
| `SlateEscrow.sol` | ERC-20 custody, proof verify, nullifier, payout |

Address encoding keeps the circuit's **hi/lo** public signals (Option A): EVM
addresses are left-padded to 32 bytes before limb splitting.

## Commands

```bash
export PATH="$HOME/.foundry/bin:$PATH"
cd packages/onchain-setup/evm

forge test
forge script script/Deploy.s.sol:DeployScript \
  --rpc-url "$BASE_RPC_URL" \
  --broadcast \
  --private-key "$EVM_PRIVATE_KEY"
```

After deploy, set in the repo `.env`:

```
BASE_SETTLEMENT_VERIFIER_ADDRESS=0x…
BASE_SLATE_AGENT_REGISTRY_ADDRESS=0x…
BASE_SLATE_ESCROW_ADDRESS=0x…
EVM_PRIVATE_KEY=0x…
```

When `settlement_final.zkey` is available, regenerate the verifier with:

```bash
snarkjs zkey export solidityverifier settlement_final.zkey src/SettlementVerifier.sol
```
