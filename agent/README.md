# @shadowmeter/agent

The **off-chain agent harness** for ShadowMeter — confidential, pay-per-use metering
between autonomous agents. Consumers sign cumulative **EdDSA-BabyJubjub** vouchers as
they consume service; the channel settles **once** on Stellar with a ZK proof that the
payout is correctly derived from the meter — without revealing the call count, the rate,
or the timing.

This package owns the **Agents** track (T2): vouchers, the consumer/provider loop, escrow
gatekeeping, and the witness hand-off to the ZK circuit (T1).

## Why circomlibjs (not a generic Ed25519 lib)

Vouchers are signed with **EdDSA over BabyJubjub using Poseidon**, via
[`circomlibjs`](https://github.com/iden3/circomlibjs). That is the off-chain twin of
circomlib's `EdDSAPoseidonVerifier` / `Poseidon` circuit templates — same curve, same
hash constants, same field. A standard Ed25519 signature would be cheap off-chain but
ruinously expensive to verify inside a SNARK. This choice is what keeps the circuit small.

> Note: the BabyJubjub voucher-signing key is an **application-level key**, separate from
> the Stellar Ed25519 account key that pays gas. They are not the same key.

## Install & run

```bash
npm install
npm run demo       # worked example: 7,431 calls → one 14.862 USDC settlement
npm test           # unit tests (node:test)
npm run typecheck  # tsc --noEmit
```

## The model

```
open ──▶ meter (off-chain, instant, private) ──▶ settle (on-chain, one ZK proof)
```

1. **Open.** Consumer and provider agree a private rate `r`. The consumer escrows a
   public deposit and both commit to the rate as `Poseidon(rate, blind)`.
2. **Meter.** As the consumer consumes calls it signs **cumulative** vouchers
   (`cumulativeUnits` is the running total). Each supersedes the last, so only the latest
   voucher — one signature — is ever needed. The provider serves the next increment only
   against a fresh signed voucher whose `cumulativeUnits * rate` stays within escrow, and
   **halts** otherwise. Worst-case bad debt is a single increment.
3. **Settle.** `channel.close()` emits a `SettlementWitness` — the public inputs and
   private witness for the circuit. The prover turns it into a Groth16 proof; the Soroban
   contract verifies it, pays the provider `settlementAmount`, refunds the remainder, and
   spends the nullifier.

## What's public vs. private

| Public on-chain | Private (never revealed) |
| --- | --- |
| Channel open / close | Number of calls / units |
| Escrow amount | The per-unit rate |
| Settlement amount *(MVP)* | Per-call timing & frequency |
| Nullifier, rate commitment | Individual vouchers |

## Interface with the ZK team (the seam)

`toCircuitInput(witness)` produces the flat `input.json` signal map, matching the
`MeteredVerifier` circuit in `jny0444/metered-stellar` (`setttlement.circom`) exactly. The
signal names live in [`src/circuit.ts`](./src/circuit.ts) — the **single place** to keep in
lockstep with the circuit:

- **Public:** `channel_id, rate_commitment, escrow_amount, settlement_amount, nullifier, consumer_pubkey_x, consumer_pubkey_y`
- **Private:** `rate, rate_blind, total_units, channel_secret, sig_R8x, sig_R8y, sig_S`

The voucher message the circuit recomputes is `Poseidon(channel_id, total_units)`.
`writeCircuitInput()` is a drop-in replacement for the circuit repo's hardcoded
`generate_input.js`, but populated from a real metering session.

## API sketch

```ts
import { ShadowCrypto, createIdentity, MeteredChannel, randomFieldValue } from "@shadowmeter/agent";

const crypto = await ShadowCrypto.build();
const identity = createIdentity(crypto);

const channel = new MeteredChannel(crypto, {
  channelId: randomFieldValue(),
  rate: 2_000n,                 // 0.002 USDC/call (private)
  escrow: 20_000_000n,          // 20 USDC ceiling (public)
  rateBlind: randomFieldValue(),
  channelSecret: randomFieldValue(),
  identity,
});

channel.meter(7_431n);          // consume + sign cumulative voucher (provider gatekeeps)
const witness = channel.close(); // → feed to the prover as input.json
```

## Layout

```
src/
  crypto.ts     ShadowCrypto — Poseidon + EdDSA-BabyJubjub behind a bigint API
  keys.ts       identities and random field values
  voucher.ts    voucher message, sign, verify
  consumer.ts   ConsumerAgent — issues cumulative vouchers
  provider.ts   ProviderAgent — verifies + gatekeeps against escrow, halts on breach
  channel.ts    MeteredChannel — open/meter/close + settlement witness
  circuit.ts    witness → snarkjs input.json (the locked seam with T1)
  demo.ts       the worked example
test/           node:test unit tests
```

## Scope

MVP: unidirectional channel, cooperative close, single final voucher, committed rate,
settlement amount revealed at close, per-channel nullifier. Stretch (not built here):
shielded settlement amount, bidirectional channels, dispute/timeout fraud proofs.
