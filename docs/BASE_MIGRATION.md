# Base settlement

Stellar / Soroban has been removed. Settlement is Base (EVM) only.

## Layout

- Foundry contracts: `packages/onchain-setup/evm/`
- Chain client: `packages/agent-core/src/base.ts` (`BaseChainClient`)
- Env: `EVM_PRIVATE_KEY` + `BASE_*_ADDRESS`

## Verify locally

```bash
pnpm install
pnpm --filter @drongo/proving-setup test
pnpm --filter @drongo/agent-core test
cd packages/onchain-setup/evm && forge test
```

## Live Base Sepolia

1. Place `settlement_final.zkey` in `packages/proving-setup/`
2. `forge script script/Deploy.s.sol:DeployScript --rpc-url $BASE_RPC_URL --broadcast --private-key $EVM_PRIVATE_KEY`
3. Set `BASE_*_ADDRESS` + `EVM_PRIVATE_KEY` in `.env`
4. Run consumer/provider demos
