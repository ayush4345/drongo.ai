# ShadowMeter

**Confidential pay-per-use settlement between autonomous agents — metered off-chain, settled once on Stellar with a zero-knowledge proof.**

Thousands of agent-to-agent transactions collapse into **one** on-chain settlement that is provably correct, while the usage volume, the per-call rate, and the timing stay private.

> Built for **Stellar Hacks: Real-World ZK**. ZK is load-bearing: the proof *is* the settlement mechanism, not decoration.

---

## The idea

As agents start buying services from each other (inference, data, compute, tool calls), the natural pricing model is **metered, pay-per-use**. Done naively on-chain that leaks badly — every micropayment exposes who pays whom, how much, and how often (a competitive-intelligence firehose), and posting thousands of tiny payments is wasteful.

ShadowMeter runs the meter **off-chain** (instant, free, private) and settles **once** on Stellar with a ZK proof asserting:

> *"The amount I'm collecting is correctly derived from a meter both parties signed off on, at the rate we agreed"* — without revealing the individual calls, the total count, or the rate.

```
open ──▶ meter (off-chain, instant, private) ──▶ settle (on-chain, one ZK proof)
```

1. **Open** — consumer & provider agree a private rate `r`; consumer escrows a public deposit; both commit to the rate as `Poseidon(rate, blind)`.
2. **Meter** — as the consumer consumes calls it signs **cumulative** vouchers (the running total). Each supersedes the last, so settlement needs just **one** signature. The provider serves the next increment only against a fresh signed voucher whose `units × rate` stays within escrow, and halts otherwise.
3. **Settle** — a Groth16 proof verified inside a Soroban contract pays the provider, refunds the remainder, and spends a nullifier so the channel can't settle twice.

### What's public vs. private

| Public on-chain | Private (never revealed) |
| --- | --- |
| Channel open / close | Number of calls / units |
| Escrow amount | The per-unit rate |
| Settlement amount *(MVP)* | Per-call timing & frequency |
| Nullifier, rate commitment | Individual vouchers |

---

## Repository layout

This is a monorepo with one directory per track:

| Path | Track | Status |
| --- | --- | --- |
| [`agent/`](./agent) | **Off-chain agent harness** — consumer/provider agents, EdDSA-BabyJubjub voucher metering, settlement-witness export | ✅ implemented |
| `circuits/` | **ZK** — Circom settlement circuit + snarkjs proving | 🚧 in progress |
| `contracts/` | **Soroban** — `open_channel` / `close_channel`, Groth16 verifier, USDC payout | 🚧 in progress |

The three tracks meet at one interface: the **circuit `input.json`** the agent emits (see [`agent/src/circuit.ts`](./agent/src/circuit.ts)) and the on-chain ABI.

---

## Quickstart — run & test the agent

Requires **Node.js ≥ 20**.

```bash
cd agent
npm install          # installs circomlibjs (crypto) + tsx + typescript

npm run demo         # worked example: bursts 7,431 metered calls,
                     # closes with ONE 14.862 USDC settlement, prints the
                     # public-vs-private split and the circuit input.json

npm test             # unit tests: signature round-trip, tamper + wrong-key
                     # rejection, escrow halting, monotonicity, settlement math

npm run typecheck    # tsc --noEmit
```

Expected `npm run demo` (abridged):

```
═══ OPEN CHANNEL ═══
  rate (PRIVATE):            0.002000 USDC / call
  escrow (public):           20.000000 USDC
═══ CLOSE CHANNEL — one on-chain settlement ═══
  total calls (PRIVATE):     7431
  settled to provider:       14.862000 USDC
  refunded to consumer:      5.138000 USDC
```

### Crypto choice (why circomlibjs)

Vouchers are signed with **EdDSA over BabyJubjub using Poseidon** via
[`circomlibjs`](https://www.npmjs.com/package/circomlibjs) — the off-chain twin of
circomlib's `EdDSAPoseidonVerifier` circuit. Same curve, same hash constants, so the
signature verifies cheaply *inside* the SNARK. A standard Ed25519 signature would be
ruinously expensive to prove. (The BabyJubjub voucher key is app-level, separate from the
Stellar account key that pays gas.)

> **Note:** the agents are framework-free — `ConsumerAgent` and `ProviderAgent` are plain
> TypeScript classes modeling the two parties to a payment channel. The only runtime
> dependency is `circomlibjs`.

---

## Status & scope

**MVP:** unidirectional channel, cooperative close, single final voucher, committed rate,
settlement amount revealed at close, per-channel nullifier.

**Stretch (not built):** shielded settlement amount, bidirectional channels,
dispute/timeout fraud proofs, agent registry.

## License

MIT
