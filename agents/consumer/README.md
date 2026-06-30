# @drongo/agent-consumer

The **consumer agent** — an LLM-driven buyer. Given a natural-language goal it
asks the LLM which locations to look up, **buys each weather call per call**
through the metered channel (signing cumulative EdDSA-Poseidon vouchers), feeds
results back to the LLM, and repeats until it has an answer — then **settles
once** with a Groth16 proof.

Built on the packages:
- **`@drongo/agent-core`** — the metering channel + `ChainClient` seam + money.
- **`@drongo/proving-setup`** — vouchers, the 13-signal settlement inputs, the
  proof, and serialization.
- **`@drongo/agent-provider`** — the `WeatherService` it buys from (in-process
  in the demo; a remote provider would sit behind the x402 transport).

```
goal → LLM picks cities → pay+serve weather (per call) → close → ZK proof → settle once
```

## Run the demo

```bash
pnpm --filter @drongo/agent-consumer build
pnpm --filter @drongo/agent-consumer demo                 # stub LLM + real Open-Meteo + real proof + mock chain
OPENAI_API_KEY=sk-... pnpm --filter @drongo/agent-consumer demo "Warmest of Tokyo, London, Cairo?"
```

`demo.ts` wires the consumer to a provider `WeatherService` in-process and runs
open → meter → close → proof → (mock) settle. Swap `MockChainClient` for
`SorobanChainClient` (from `@drongo/agent-core`) once `@drongo/onchain-setup`
exposes contract bindings + deployed IDs.

Exposed: `WeatherConsumerAgent`, `LlmClient`, `StubLlmClient`, `OpenAiLlmClient`,
`LlmDecision`.
