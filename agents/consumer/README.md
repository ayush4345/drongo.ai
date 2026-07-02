# @drongo/agent-consumer

The **consumer agent** — an LLM-driven buyer. Given a natural-language goal it
asks the LLM **which tool to use** (weather, crypto price, translation, …),
**buys each call per call** through the metered channel (signing cumulative
EdDSA-Poseidon vouchers), feeds results back to the LLM, and repeats until it
has an answer — then **settles once** with a Groth16 proof.

Built on the packages:
- **`@drongo/agent-core`** — the metering channel (`ServiceChannel`,
  `X402ServiceChannel`) + `ChainClient` seam + money.
- **`@drongo/proving-setup`** — vouchers, the 13-signal settlement inputs, the
  proof, and serialization.
- **`@drongo/agent-provider`** — the `ToolboxService` + `TOOL_SPECS` it buys
  from (in-process in `demo.ts`; **remote over HTTP/x402** in `x402-demo.ts`).

`ServiceAgent` drives an `AgentBrain` — either `StubAgentBrain` (deterministic
keyword router, zero-cost, offline) or `OpenAiAgentBrain` (real function-calling
when `OPENAI_API_KEY` is set). The agent is transport-agnostic: it takes any
`MeteredServiceChannel`, so the exact same loop works in-process or over x402.

```
goal → LLM picks tools → pay+serve per call (any mix) → close → ONE ZK proof → settle once
```

## Run the demo (in-process provider)

```bash
pnpm --filter @drongo/agent-consumer build
pnpm --filter @drongo/agent-consumer demo                 # stub brain + real APIs + real proof + mock chain
OPENAI_API_KEY=sk-... pnpm --filter @drongo/agent-consumer demo "Weather in Tokyo, price of ETH, and 'hello' in French?"
```

`demo.ts` wires the consumer to the provider's `ToolboxService` in-process and
runs open → meter → close → proof → (mock) settle.

## Run the demo over x402 (remote provider)

Same flow, but the provider is a **separate HTTP service** reached via x402
(`402 → X-PAYMENT → open`), so the agent buys tools over the network:

```bash
# terminal 1 — start the provider's x402 server (listens on :4021)
pnpm --filter @drongo/agent-provider serve

# terminal 2 — run the consumer against it
pnpm --filter @drongo/agent-consumer demo:x402
PROVIDER_URL=http://localhost:4021 pnpm --filter @drongo/agent-consumer demo:x402 "Price of BTC and 'good morning' in Japanese?"
```

`x402-demo.ts` opens escrow on-chain, opens a metered channel with the remote
provider via `X402ServiceChannel`, meters each tool call over HTTP, and settles
the whole mixed session with one proof. Set `OPENAI_API_KEY` to use the real
LLM brain; otherwise the stub brain runs offline.

## Settlement chain

Both demos settle to a `MockChainClient` by default (offline). Set
`DEPOSITOR_SECRET` + the deployed contract IDs (see repo-root `.env`) to switch
to **real Soroban** settlement on Stellar testnet — the settle tx then prints a
`stellar.expert` explorer link.

## Run the chat UI (provider + consumer + web)

```bash
# terminal 1 — provider x402 server (:4021)
pnpm --filter @drongo/agent-provider serve

# terminal 2 — consumer chat server (:4022)
pnpm --filter @drongo/agent-consumer serve

# terminal 3 — Next.js chat UI (:3000)
pnpm --filter @drongo/web dev
```

Open http://localhost:3000/dashboard and chat. The UI proxies to the consumer
via `POST /api/chat` → `POST http://localhost:4022/chat`. Set `AGENT_URL` if
the consumer listens elsewhere. Set `OPENAI_API_KEY` for real LLM tool selection;
otherwise the stub brain runs offline.

On shutdown (Ctrl+C), the consumer server settles the metered channel with one
ZK proof.

## Exposed

`ServiceAgent`, `AgentBrain`, `AgentDecision`, `CallRecord`, `AgentRunResult`;
`StubAgentBrain`, `OpenAiAgentBrain`; and the original single-service
`WeatherConsumerAgent`, `LlmClient`, `StubLlmClient`, `OpenAiLlmClient`,
`LlmDecision` (kept for reference).
