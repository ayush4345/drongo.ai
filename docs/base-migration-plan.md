# Migration plan: Stellar/Soroban → Base (Ethereum L2)

Status: executed. Stellar / Soroban has since been removed; Base is the only chain.

## Why this port is tractable

The repo is already seam-isolated — every chain touchpoint routes through
`ChainClient` (`packages/agent-core/src/chain.ts`). Nothing in `proving-setup`
or the agents talks to Stellar directly. And the ZK circuit already uses
Groth16 over **BN254**, which is Ethereum's native pairing-precompile curve
(EIP-196/197) — better native fit on Base than it was on Soroban.

Proof submission model carries over unchanged: the proof is submitted as
calldata to one contract call (`SlateEscrow.settle`), which cross-calls the
verifier synchronously in the same transaction. No relayer, oracle, or
separate proving/verification service is needed — see "Rejected: zkVerify"
below.

## Layer-by-layer

| Layer | Stellar today | Base tomorrow | Effort |
|---|---|---|---|
| ZK circuit (`proving-setup/circuits`) | Groth16/BN254 via snarkjs | unchanged | none |
| Voucher signing (EdDSA-Poseidon/Baby Jubjub) | chain-agnostic already | unchanged | none |
| Verifier contract | hand-rolled Soroban `meteredverifier`, custom G1/G2 byte packing (`proving-setup/src/serialize.ts`) | `snarkjs zkey export solidityverifier` generates it straight from the existing `.zkey` | less work than Stellar took |
| Escrow + Registry contracts (Rust, ~680 LOC) | Soroban/Rust, SEP-41 token, `Address`/32-byte payloads | Solidity, ERC-20 (USDC on Base), 20-byte `address` | rewrite; logic ports 1:1 (whitelist token → deposit → verify proof → check nullifier → payout) |
| `ChainClient` seam (`agent-core/src/chain.ts`) | `SorobanChainClient` | new `BaseChainClient`, same interface, `viem` | isolated, ~1 file |
| Signing/keys | Stellar `Keypair` (Ed25519), `basicNodeSigner` | EVM EOA (secp256k1), `viem` `privateKeyToAccount` / `WalletClient` | isolated |
| Addressing | strkey G…/C…, 32-byte payloads, hi/lo field-pair encoding in circuit public signals | 20-byte `0x…` addresses | design decision — see below |
| Token/units (`agent-core/src/money.ts`, `proving-setup/src/serialize.ts`) | XLM stroops (7dp) / SEP-41 | USDC on Base (6dp) | trivial — `parseUsdToMicros` already assumes 6dp micro-USDC as the primary unit |
| x402 layer (`agent-core/src/x402-channel.ts`, `x402-client.ts`) | stubbed, `network: "stellar:testnet"` placeholder | x402 is Coinbase's own spec, native to Base + USDC | easier — this was backwards before |
| Deploy tooling | `soroban`/`stellar` CLI, Cargo workspace | Foundry (`forge`) | new tooling, standard |
| `packages/onchain-setup/midnight/`, `proving-setup/src/midnight.ts` (untracked, in progress) | Midnight Network experiment | orthogonal to this port | **open question — see below** |

## Open decisions

### 1. Address encoding in the circuit's public signals

Public signals currently encode each of depositor/provider/token as a
**hi/lo pair** (two field elements) because Stellar addresses are 32 bytes.
An EVM address is 20 bytes — fits in a single BN254 field element.

- **Option A — keep hi/lo, left-pad EVM addresses to 32 bytes.**
  Circuit and `proving-setup/src/inputs.ts` untouched. Only need a new
  EVM-flavored serializer alongside (not replacing) `serialize.ts`.
  Smaller diff, no circuit/vkey re-audit.
- **Option B — collapse to one signal per address (13 → 10 public
  signals).** Cleaner and marginally cheaper to verify on-chain, but touches
  the circuit, `buildSettlementInputs`, and both contracts' verifier ABI —
  effectively a circuit re-audit.

**Recommendation: Option A** for the initial port. Revisit B only if gas
from the extra signals is measured to matter (unlikely on an L2).

### 2. Midnight Network work

`packages/onchain-setup/midnight/` and `packages/proving-setup/src/midnight.ts`
are untracked, in-progress. Decide before starting the Base port:
finish and land separately, keep as a parallel third `ChainClient` target, or
drop. Not addressed further in this plan.

### 3. Keep Stellar or replace it

The `ChainClient` seam makes both cheap to keep side by side
(`SorobanChainClient` + `BaseChainClient`). Default: **keep both**, Base
becomes the new default in agent configs. Only delete Stellar code if a
clean break is wanted.

## Rejected: zkVerify

Considered and rejected for this port. zkVerify is a separate verification
chain that verifies a proof and relays a lightweight attestation back to the
destination chain, instead of verifying the full proof there. It earns its
place when the destination chain can't verify a proof system natively, or
verification cost/frequency is high.

Neither applies here: Groth16/BN254 is the one proof system Base verifies
natively via precompiles (cheap, one transaction), and settlement already
happens once per session, not per call. Adding zkVerify would mean an extra
chain hop and cross-chain finality wait, for a verification that's already
native and cheap. Revisit only if the proof system ever moves off
Groth16/BN254.

## Phased plan

1. **Contracts** — new `packages/onchain-setup/evm/` (Foundry project):
   - `Verifier.sol` — generated via `snarkjs zkey export solidityverifier`
     from the existing settlement `.zkey`.
   - `SlateEscrow.sol`, `SlateAgentRegistry.sol` — ported from the Rust
     contracts 1:1 (`soroban/contracts/slate-escrow/src/lib.rs`,
     `slate-agent-registry/src/lib.rs`), using their existing Rust test
     suites (`src/test.rs`) as the behavioral spec.
   - Foundry test suite mirroring the Rust ones.

2. **Chain client** — `packages/agent-core/src/base.ts`:
   - `BaseChainClient implements ChainClient` (same interface as
     `chain.ts:37`), using `viem`.
   - `openChannel` → `SlateAgentRegistry.registerChannel` +
     `SlateEscrow.addToDepositors`.
   - `settle` → `SlateEscrow.settle(proof, publicSignals, …)`.

3. **Serialization** — `packages/proving-setup/src/serialize-evm.ts`:
   - Proof → `{a: uint256[2], b: uint256[2][2], c: uint256[2]}` calldata
     shape (simpler than the current Soroban byte-packing in
     `serialize.ts` — no G2 c0/c1 swap needed, standard snarkjs output
     format).
   - Address payload → left-padded 32-byte encoding per decision #1 above.

4. **Bindings** — replace `packages/onchain-setup/src/bindings/*` (Soroban
   codegen) with `viem`/`abitype`-typed bindings generated from the Foundry
   ABI output.

5. **Env/config** — `packages/agent-core/src/env.ts`:
   - `realBaseChainFromEnv` alongside/replacing `realChainFromEnv`.
   - `EVM_PRIVATE_KEY` (depositor signer) replaces `DEPOSITOR_SECRET`.
   - `BASE_RPC_URL`, `BASE_SLATE_ESCROW_ADDRESS`,
     `BASE_SLATE_AGENT_REGISTRY_ADDRESS`, `BASE_METERED_VERIFIER_ADDRESS`
     replace the `STELLAR_*`/`SOROBAN_*` env vars in
     `onchain-setup/src/config.ts`.
   - Default settlement token: USDC on Base (native Circle USDC, 6dp)
     instead of XLM's SAC.

6. **Agents** — `agents/provider`, `agents/consumer` configs swap Stellar
   keys/addresses for an EVM private key + Base RPC URL.

7. **x402** — replace the `network: "stellar:testnet"` placeholder in
   `x402-client.ts` with real Base/USDC x402 payment flow (x402 already
   targets this natively).

8. **Dependencies** — drop `@stellar/stellar-sdk` from `agent-core`,
   `onchain-setup`, and the three binding packages; add `viem`.

## Not in scope here

- Circuit changes (Option B above).
- Midnight Network integration.
- Mainnet deployment/ops (RPC provider choice, contract verification on
  Basescan, key management) — separate doc once contracts are written.
