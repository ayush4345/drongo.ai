# @drongo/agent

The **off-chain agent harness** for Drongo AI — confidential, pay-per-use metering between
autonomous agents. Consumers sign cumulative **EdDSA-BabyJubjub** vouchers as they consume
a service; the channel settles **once** on Stellar with a ZK proof that the payout is
correctly derived from the meter — without revealing the call count, the rate, or the
timing.

This package owns the **Agents** track (T2): vouchers, the consumer/provider loop, escrow
gatekeeping, the witness hand-off to the ZK circuit (T1), **and a real metered service with
an LLM-driven consumer**.

## The meaningful agents (weather × LLM)

To show a genuine agent-to-agent economy, not a toy:

- **Provider agent → a real metered Weather API.** `WeatherService` sells current weather
  via the **keyless [Open-Meteo](https://open-meteo.com) API** (geocode a place, then fetch
  conditions), priced per call. The HTTP client is injected, so it's testable offline.
- **Consumer agent → an OpenAI LLM agent.** `WeatherConsumerAgent` takes a natural-language
  goal, uses **OpenAI function-calling** to decide which locations to look up, **buys each
  weather call through the metered voucher channel** (paying per call), and synthesizes a
  final answer. A deterministic `StubLlmClient` + canned HTTP keep it runnable with no key.

```
goal → LLM picks locations → pay+call weather (per call, off-chain) → LLM answers → settle once
```

## Why circomlibjs (not a generic Ed25519 lib)

Vouchers are signed with **EdDSA over BabyJubjub using Poseidon**, via
[`circomlibjs`](https://github.com/iden3/circomlibjs) — the off-chain twin of circomlib's
`EdDSAPoseidonVerifier` / `Poseidon` circuit templates (same curve, same constants). A
standard Ed25519 signature would be cheap off-chain but ruinously expensive to verify
inside a SNARK. (The BabyJubjub voucher key is app-level, separate from the Stellar account
key that pays gas.)

## Install & run

`npm` and `pnpm` both work. pnpm builds the native `blake-hash` addon automatically
(`pnpm.onlyBuiltDependencies`); npm runs build scripts by default.

```bash
pnpm install            # circomlibjs + openai + tsx + typescript

pnpm run demo           # metering: 7,431 calls → one 14.862 USDC settlement
pnpm run demo:service   # service loop (mock inference) — request → serve → pay
pnpm run demo:weather   # the headline demo: LLM consumer buys real weather, pays per call
                        # set PROVIDER_URL=http://localhost:4021 for x402 HTTP (start provider first)

pnpm test               # unit tests (offline: stub LLM + mock HTTP + crypto)
pnpm run typecheck      # tsc --noEmit
```

`demo:weather` runs in two modes automatically:
- **Real** — set `OPENAI_API_KEY` (and optionally `OPENAI_MODEL`, default `gpt-4o-mini`):
  an OpenAI agent picks the cities and Open-Meteo serves real weather.
- **Offline** — no key: a deterministic stub LLM + canned weather, so it always runs.

```bash
OPENAI_API_KEY=sk-... pnpm run demo:weather "Which is warmest now: Tokyo, London, or Cairo?"
```

> On pnpm, if EdDSA throws a native-binding error, run `pnpm rebuild blake-hash` once.

## What's public vs. private

| Public on-chain | Private (never revealed) |
| --- | --- |
| Channel open / close | Number of calls / units |
| Escrow amount | The per-unit rate |
| Settlement amount *(MVP)* | Per-call timing & frequency |
| Nullifier, rate commitment | Individual vouchers · which cities were queried |

## Interface with the ZK team (the seam)

`toCircuitInput(witness)` produces the flat `input.json` signal map, matching the
`MeteredVerifier` circuit in `jny0444/metered-stellar` (`setttlement.circom`) exactly:

- **Public:** `channel_id, rate_commitment, escrow_amount, settlement_amount, nullifier, consumer_pubkey_x, consumer_pubkey_y`
- **Private:** `rate, rate_blind, total_units, channel_secret, sig_R8x, sig_R8y, sig_S`

## Layout

```
src/
  crypto.ts            DrongoCrypto — Poseidon + EdDSA-BabyJubjub behind a bigint API
  keys.ts              identities and random field values
  voucher.ts           voucher message, sign, verify
  consumer.ts          ConsumerAgent — issues cumulative vouchers
  provider.ts          ProviderAgent — verifies + gatekeeps against escrow, halts on breach
  channel.ts           MeteredChannel — open/meter/close + settlement witness
  circuit.ts           witness → snarkjs input.json (the locked seam with T1)
  service.ts           Service<Req,Res> interface (async) + MockInferenceService
  service-channel.ts   ServiceConsumer / ServiceProvider / ServiceChannel (request→serve→pay)
  weather.ts           WeatherService (Open-Meteo) + injectable HttpClient
  weather-channel.ts   openWeatherChannel / closeWeatherChannel (in-process or x402)
  llm.ts               LlmClient interface + deterministic StubLlmClient
  openai-client.ts     OpenAiLlmClient — function-calling brain for the consumer
  weather-consumer.ts  WeatherConsumerAgent — LLM decides lookups, pays per call
  x402-client.ts         manual x402 retry (PAYMENT-SIGNATURE on 402)
  x402-service-channel.ts  remote ServiceChannel over HTTP + Drongo vouchers
  voucher-wire.ts        JSON serde for EdDSA vouchers on the wire
  demo.ts / service-demo.ts / weather-demo.ts   runnable demos
test/                  node:test unit tests (offline: stub LLM + mock HTTP)
```

## Scope

MVP: unidirectional channel, cooperative close, single final voucher, committed rate,
settlement amount revealed at close, per-channel nullifier, **x402 HTTP transport** for
remote metered calls (set `PROVIDER_URL` — see `X402ServiceChannel`). Stretch:
shielded settlement amount, bidirectional channels, dispute/timeout fraud proofs.
