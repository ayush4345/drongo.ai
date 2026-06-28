# @drongo/agent-weather

The first Drongo **agent**: a metered **weather provider** (keyless Open-Meteo)
and an **LLM-driven consumer** that buys weather per call through a
privacy-preserving payment channel, then settles once with a ZK proof.

It is built entirely on the workspace submodules:

- **`@drongo/proving-setup`** — vouchers (`createVoucher`), the 13-signal
  settlement inputs (`buildSettlementInputs`), the Groth16 proof
  (`generateSettlementProof`), and serialization for the contracts
  (`serializeSettlement`).
- **`@drongo/onchain-setup`** — the Soroban contracts, reached through the
  `ChainClient` seam in [`src/chain.ts`](./src/chain.ts).

```
goal → LLM picks cities → pay+serve weather (per call, off-chain) → close → ZK proof → settle once
```

## Layout

```
src/
  service.ts        Service<Req,Res> interface (+ MockInferenceService)
  weather.ts        WeatherService — Open-Meteo, injectable HttpClient (the provider)
  llm.ts            LlmClient + deterministic StubLlmClient
  openai-client.ts  OpenAiLlmClient — OpenAI function-calling brain
  channel.ts        ConsumerMeter + ProviderMeter + ServiceChannel (on @drongo/proving-setup)
  chain.ts          ChainClient seam — MockChainClient + SorobanChainClient (TODO)
  consumer.ts       WeatherConsumerAgent — LLM decides lookups, pays per call
  money.ts          micro-USDC helpers
  demo.ts           runnable open → meter → settle demo
```

## Run

```bash
pnpm --filter @drongo/agent-weather build
pnpm --filter @drongo/agent-weather demo        # stub LLM, real Open-Meteo, real proof, mock chain
OPENAI_API_KEY=sk-... pnpm --filter @drongo/agent-weather demo "Warmest of Tokyo, London, Cairo?"
```

`close()` generates a **real Groth16 proof** via `@drongo/proving-setup` (needs
its compiled `settlement.wasm` + `settlement_final.zkey`). The on-chain `open` /
`settle` run through `MockChainClient` for now — swap in `SorobanChainClient`
once `@drongo/onchain-setup` exposes contract bindings + deployed IDs.

## What's superseded

The crypto/voucher/channel/circuit code from the old `agent/` package is **not**
ported here — `@drongo/proving-setup` is the single source of truth for vouchers,
the rate commitment (`Poseidon(rate, blind)`), the 13-signal witness, and proof
serialization.
