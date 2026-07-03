# slate

**Confidential, metered pay-per-use commerce between autonomous agents**, settled
on Stellar/Soroban with a zero-knowledge proof.

A **consumer agent** — driven by an LLM — is given a goal, picks tools, and
**buys each call, per call**, from a **provider agent** over the network. It
signs a running EdDSA-Poseidon voucher for every purchase against a rate it never
reveals, and at the end **settles the whole session with a single Groth16 proof**.
On-chain the provider is paid exactly the metered amount and the depositor is
refunded the remainder — **without the rate or the usage ever appearing on the
ledger**. Only a Poseidon commitment to the rate is public.

The result: agents can transact metered services (weather, prices, translation,
inference, …) with the auditability of a public chain and the privacy of an
off-chain meter.

---

## How the pieces fit

```
                 web (:3000)                     ← chat UI / marketing site
                     │  POST /api/chat
                     ▼
        agent-consumer (:4022)                   ← LLM brain, buys tools, settles once
                     │  x402  402 → X-PAYMENT → open
                     │  cumulative voucher per call
                     ▼
        agent-provider (:4021)                   ← keyless metered services, meters only
                     ▲
                     │ both agents compose ↓
        ┌────────────┴─────────────┐
        │      agent-core          │             ← Service / channel / ChainClient seams
        └──────┬────────────┬──────┘
               │            │
       proving-setup   onchain-setup             ← ZK toolkit + Soroban contracts
       (Circom+Groth16) (verifier/escrow/registry)
```

Every arrow is a **seam with a mock and a real implementation** — the payment
verifier, the on-chain `ChainClient`, the LLM brain, and the service transport
all run offline for demos/tests and swap to real APIs, real chain, real LLM, and
a real x402 facilitator by configuration alone.

---

## Repository layout

```
packages/
├── proving-setup/     @drongo/proving-setup   ZK toolkit: circuit, proofs, serialization
├── onchain-setup/     @drongo/onchain-setup   Soroban contracts + TS client bindings
└── agent-core/        @drongo/agent-core      shared runtime: services, channel, chain seam, MeterDb

agents/
├── provider/          @drongo/agent-provider  keyless metered services + x402 server (:4021)
└── consumer/          @drongo/agent-consumer  LLM buyer + chat server (:4022)

web/                   @drongo/web             Next.js front end (:3000)
```

A pnpm workspace wired with TypeScript project references. `agent-core` is the
hinge: it is the **only** place that touches `proving-setup` and `onchain-setup`,
so both agents share one metering / proving / settlement implementation.

---

## The layers

### `@drongo/proving-setup` — the cryptographic core

The zero-knowledge toolkit and the source of truth for *what an honest
settlement is*. A Circom circuit (`circuits/settlement.circom`) compiled to a
wasm witness calculator plus Groth16 keys, wrapped in a TypeScript API that:

- builds usage **vouchers** — EdDSA-Poseidon signatures over Baby Jubjub
  (`createVoucher`), the consumer's private key never leaving its side;
- assembles the **13 public-signal** circuit inputs (`buildSettlementInputs`),
  verifying the voucher and computing `settlement = total_units · rate`, the
  Poseidon `rate_commitment`, and the `nullifier`;
- generates the proof (`generateSettlementProof`, via `snarkjs`); and
- serializes it into the exact byte layout the on-chain verifier expects
  (`serializeSettlement`).

The circuit enforces the honesty constraints: rate commitment, a valid consumer
signature, `settlement = total_units · rate`, `settlement ≤ escrow`, and a
nullifier for replay protection. See **[Settlement protocol reference](#settlement-protocol-reference)**
below for the signal layout and end-to-end proving/settle flow.

### `@drongo/onchain-setup` — the Soroban contracts

Three Rust contracts and their generated TypeScript client bindings.

| Contract | Role |
|---|---|
| `meteredverifier` | Stateless Groth16/BN254 pairing check against an embedded verifying key. No state, no funds. |
| `slate-escrow` | Custodies deposits, cross-calls the verifier, enforces `settlement ≤ escrow` + nullifier replay protection, pays out. |
| `slate-agent-registry` | Stores the fixed per-channel parameters (identities, rate commitment, pubkey) and open/closed lifecycle. |

The proving key and the verifier's embedded `vk.rs` come from the same ceremony,
so a proof made locally verifies on-chain. `src/index.ts` re-exports the contract
clients (`SlateEscrowClient`, `SlateAgentRegistryClient`, `MeteredVerifierClient`)
that the runtime consumes. **See [`packages/onchain-setup/soroban/README.md`](packages/onchain-setup/soroban/README.md)**
for the contracts, build, and deployment.

### `@drongo/agent-core` — the shared runtime

The seam layer that lets agents *compose* the crypto instead of re-implementing
it. Key modules:

- **`service.ts`** — the priced `Service<Req,Res>` interface (`name` / `price` /
  `handle`). The **provider prices independently** and never trusts a
  consumer-claimed cost.
- **`channel.ts`** — `ConsumerMeter` / `ProviderMeter` / `ServiceChannel`:
  cumulative-voucher metering with typed reject reasons (`bad-signature`,
  `non-monotonic`, `ceiling-exceeded`, …).
- **`chain.ts`** — the `ChainClient` seam. Open = `registry.register_channel` +
  `escrow.add_to_depositors`; close = `escrow.settle`. Agents depend on this
  interface, so the whole loop is **testable without a deployed contract**.
- **`x402-client.ts` / `x402-channel.ts`** — the same metering loop carried over
  HTTP with the x402 `402 → X-PAYMENT → open` handshake, so a channel behaves
  identically in-process or remote-over-network.
- **`db.ts` (`MeterDb`, `node:sqlite`) + `settle.ts`** — **durable settlement**.
  The channel terms and every accepted voucher persist to `artifacts/metering.db`;
  `settlementFromSnapshot` rebuilds the proof from DB state, so settlement
  survives restarts and is auditable. Exported via the separate
  `@drongo/agent-core/db` entry (Node 22+) so Node-20 servers don't load sqlite
  unless they need it.

### `@drongo/agent-provider` — the service side

Keyless metered services sold per call — `WeatherService` (Open-Meteo),
`CryptoPriceService` (CoinGecko), `TranslationService` (MyMemory) — bundled by
`buildToolbox` into one `ToolboxService` so any mix of tools settles with a
single proof. It hosts the **x402 resource server** (`:4021`), **advertises its
own terms** (per-unit rate, `payTo` address, asset) in the `402`, and **only
meters**: it verifies each cumulative voucher before running a tool but never
builds the settlement proof. **See [`agents/provider/README.md`](agents/provider/README.md).**

### `@drongo/agent-consumer` — the buyer

The LLM-driven consumer. A `ServiceAgent` drives an `AgentBrain` —
`StubAgentBrain` (deterministic, offline) or `OpenAiAgentBrain` (real
function-calling when `OPENAI_API_KEY` is set) — that picks tools, buys each call,
feeds results back to the LLM, and at close **settles once** with a Groth16 proof.
It **discovers** the provider's advertised terms from the `402`, holds
`DEPOSITOR_SECRET` (so the consumer funds escrow and pays for everything), and
runs a chat server (`:4022`). **See [`agents/consumer/README.md`](agents/consumer/README.md).**

### `@drongo/web` — the front end

A Next.js (App Router) app: a marketing site plus a `/dashboard` chat UI that
proxies `POST /api/chat → http://localhost:4022/chat` to the consumer server.
**See [`web/README.md`](web/README.md).**

---

## Quickstart — the full demo

```bash
pnpm install
pnpm -r build

# terminal 1 — provider x402 server (:4021)
pnpm --filter @drongo/agent-provider serve

# terminal 2 — consumer chat server (:4022, Node 22+)
pnpm --filter @drongo/agent-consumer serve

# terminal 3 — Next.js chat UI (:3000)
pnpm --filter @drongo/web dev
```

Open <http://localhost:3000/dashboard> and chat. Set `OPENAI_API_KEY` for real
LLM tool selection; otherwise the deterministic stub brain runs offline. Copy
[`.env.example`](.env.example) → `.env`: **without `DEPOSITOR_SECRET` the demo
runs in offline mock mode** (no chain calls); set it (plus the deployed contract
IDs) to settle for real on Stellar testnet. On shutdown the consumer reads the
channel from `MeterDb` and settles it with one ZK proof, paying the
provider-advertised address.

To run the agent loop without the web UI (in-process or over x402), see the
provider and consumer READMEs.

---

## Settlement protocol reference

The cross-cutting contract shared by the circuit, the contracts, and the
serializer. This is the canonical spec for `proving-setup` + `onchain-setup`.

### Public signal layout

The circuit exposes **13 public signals**, in this order. The same indices are
used by every contract and by the serializer.

| Idx | Signal | Bound | Used by |
|----|--------|-------|---------|
| 0 | `channel_id` | field | registry |
| 1 | `rate_commitment` | field | registry |
| 2 | `escrow_amount` | < 2⁶⁴ | escrow |
| 3 | `settlement_amount` | < 2⁶⁴ | escrow |
| 4 | `nullifier` | field | escrow |
| 5–6 | `consumer_pubkey_x/y` | field | registry |
| 7–8 | `depositor_hi/lo` | < 2¹²⁸ | escrow + registry |
| 9–10 | `provider_hi/lo` | < 2¹²⁸ | escrow + registry |
| 11–12 | `token_hi/lo` | < 2¹²⁸ | escrow + registry |

Soroban addresses are 32-byte payloads split into two 128-bit limbs
(`hi = bytes[0..16]`, `lo = bytes[16..32]`, big-endian) so they fit the BN254
scalar field.

### Phase 0 — Build & deploy (one-time)

```
# build-time (proving-setup)
circom settlement.circom   → settlement.r1cs, settlement_js/settlement.wasm
groth16 setup + ceremony   → settlement_final.zkey, settlement_verification_key.json
gen_verifier_data.js       → meteredverifier/src/vk.rs (+ test fixtures)

# deploy (onchain-setup)
deploy meteredverifier                 → verifierAddr
deploy slate-escrow ; escrow.init(verifierAddr)
escrow.whitelist_token(tokenAddr)
deploy slate-agent-registry            → registryAddr
```

The proving key and the verifier's embedded `vk.rs` come from the same ceremony,
so a proof made from `settlement_final.zkey` verifies under `meteredverifier`.

### Phase 1 — Open & fund a channel (depositor)

```
registry.register_channel(channel_id, rate_commitment,
                          consumer_pubkey_x, consumer_pubkey_y,
                          depositor, provider, token)   // depositor.require_auth()
escrow.add_to_depositors(depositor, amount, token)      // pulls tokens into escrow
```

`rate_commitment` must equal `Poseidon(rate, rate_blind)` — computable client-side
with `computeRateCommitment(rate, rateBlind)`.

### Phase 2 — Metering voucher (consumer, off-chain)

The consumer signs a usage voucher; their private key never leaves their side.

```ts
const voucher = await createVoucher(consumerPrivateKey, channelId, totalUnits);
// → { message = Poseidon(channelId, totalUnits),
//     consumerPublicKey: { x, y },
//     signature: { R8x, R8y, S } }              // EdDSA-Poseidon (Baby Jubjub)
```

The consumer hands `{ consumerPublicKey, signature, totalUnits }` to the prover.

### Phase 3 — Assemble circuit inputs (prover)

```ts
const inputs = await buildSettlementInputs({
  channelId, channelSecret, rate, rateBlind, totalUnits, escrowAmount,
  depositorPayload, providerPayload, tokenPayload,        // 32-byte payloads
  voucher: { consumerPublicKey, signature },              // or consumerPrivateKey
});
```

`buildSettlementInputs` computes `settlement_amount = totalUnits · rate`, the
Poseidon `rate_commitment` and `nullifier`, splits the three addresses into
limbs (`addressPayloadToLimbs`), **verifies the supplied voucher**
(`verifyVoucher`, throws `InputBuildError` on mismatch), and returns the full
20-field input object (13 public + 7 private witnesses).

### Phase 4 — Validate & prove

```ts
const { proof, publicSignals } = await generateSettlementProof(inputs);
```

- `validateSettlementInputs` (called internally) checks structure, types, ranges,
  and the arithmetic relations, aggregating every problem into one
  `CircuitInputValidationError`.
- `snarkjs.groth16.fullProve(witness, settlement.wasm, settlement_final.zkey)`
  generates the witness — which enforces the cryptographic constraints (rate
  commitment, EdDSA voucher, nullifier) — and the proof. Failures surface as a
  descriptive `ProofGenerationError`.

### Phase 5 — Serialize for the chain

```ts
const { proof: pBytes, publicSignals: sigs } = serializeSettlement({ proof, publicSignals });
// pBytes = { a: Uint8Array(64), b: Uint8Array(128), c: Uint8Array(64) }   // G2 c1||c0 swapped
// sigs   = bigint[13]                                                       // → Vec<U256>
```

G1 points encode as `be(X) || be(Y)`; the G2 point as `be(X) || be(Y)` with each
Fp2 element as `be(c1) || be(c0)` (snarkjs stores `[c0, c1]`, so the components
are swapped). This matches `gen_verifier_data.js`, the encoder the deployed
verifying key was produced with.

### Phase 6 — Submit settlement

```
escrow.settle(Proof{a,b,c}, public_signals[13], depositor, provider, token)
```

Inside `slate-escrow.settle`, in order:

1. `public_signals.len() == 13`.
2. Assert call-arg `depositor` / `provider` / `token` equal signals 7–12.
3. Cross-call `meteredverifier.verify(proof, public_signals)`
   — reconstruct `vk_x = IC[0] + Σ signals[i]·IC[i+1]`, then
   `pairing_check(e(−A,B)·e(α,β)·e(vk_x,γ)·e(C,δ)) == 1`.
4. Extract `escrow_amount` (2), `settlement_amount` (3), `nullifier` (4);
   require `settlement ≤ escrow`.
5. Reject a spent `nullifier`, else mark it spent (replay protection).
6. Debit the depositor's balance by `escrow_amount`.
7. Transfer `settlement_amount → provider` and `escrow_amount − settlement_amount → depositor`.

### Phase 7 — Wind down

```
escrow.refund(depositor, token)             // withdraw remaining balance
registry.close_channel(channel_id, caller)  // depositor or provider
```

### Call graph

```
consumer:  createVoucher ─────────────► { pubkey, signature }
                                              │
prover:    buildSettlementInputs ◄────────────┘
                │  (compute* + addressPayloadToLimbs + verifyVoucher)
                ▼
           generateSettlementProof ──► { proof, publicSignals[13] }
                │  (validateSettlementInputs + snarkjs.fullProve)
                ▼
           serializeSettlement ──────► { a/b/c bytes, bigint[13] }
                │
submitter:      ▼
           escrow.settle ──► assert addresses ──► meteredverifier.verify ──► pay out
```

---

## Development

The workspace builds with TypeScript project references:

```bash
pnpm install
pnpm -r build                                   # or: pnpm --filter <pkg> build

# Soroban contracts
cd packages/onchain-setup/soroban && cargo test
```

Per-layer usage, env vars, and demos live in each package's README:
[proving-setup](#drongoproving-setup--the-cryptographic-core) ·
[onchain-setup](packages/onchain-setup/soroban/README.md) ·
[agent-provider](agents/provider/README.md) ·
[agent-consumer](agents/consumer/README.md) ·
[web](web/README.md).
