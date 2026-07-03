# @drongo/agent-provider

The **provider agent** — a set of real, **keyless** metered services sold per
call through the Drongo channel. Each implements `Service<Req,Res>` from
`@drongo/agent-core` (`name` / `price` / `handle`) with an injectable
`HttpClient` (`FetchHttpClient` in production, a canned client in tests), so
every service runs offline with no API keys.

It is the *service* side of the metered channel: the consumer agent
(`@drongo/agent-consumer`) opens a channel, pays per call with signed vouchers,
and the provider serves only paid, in-budget requests — all wired through
`@drongo/agent-core`.

## Services

| Service | Sells | Keyless API | Request → Result |
| --- | --- | --- | --- |
| `WeatherService` | current weather | [Open-Meteo](https://open-meteo.com) | `{ location }` → temp, wind, conditions |
| `CryptoPriceService` | crypto spot prices | [CoinGecko](https://www.coingecko.com) `/simple/price` | `{ coin, vs? }` → price, 24h change |
| `TranslationService` | text translation | [MyMemory](https://mymemory.translated.net) `/get` | `{ text, from?, to }` → translated text |

All are priced at one unit per call by default (configurable via the
constructor's `unitsPerCall`). CoinGecko's keyless tier is rate-limited
(~10–30/min) and MyMemory's anonymous quota is ~5,000 chars/day — fine for the
demo; both are keyless and need no signup.

## Toolbox

`buildToolbox(http)` bundles all three services into a single `ToolboxService`
(from `@drongo/agent-core`) that routes a `ToolCall { tool, args }` to the right
sub-service. `TOOL_SPECS` is the LLM-facing description (JSON-schema params) of
each tool. Because the whole toolbox meters over **one** channel, any mix of
tools an agent picks settles with a **single** ZK proof.

## x402 HTTP server

The provider is the thing exposing the endpoint, so the x402 resource server
lives here (`createProviderServer` / `serve.ts`). It speaks the
[x402](https://x402.org) `exact` scheme over Stellar:

```
POST /agent/open            → 402 Payment Required { accepts: [PaymentRequirements] }
POST /agent/open  + X-PAYMENT   → verify (+ settle) → open metered channel
POST /channels/:id/call     → validate cumulative voucher → run tool → result
POST /channels/:id/finalize → release the in-memory meter
GET  /.well-known/agent-card.json → advertised tools + x402 open endpoint
```

Each `/call` carries the consumer's cumulative EdDSA voucher, which a
`ProviderMeter` verifies (correct signature, monotonic, within escrow) before
the tool runs. The provider **only meters** — the consumer builds the Groth16
settlement proof locally at close.

```bash
pnpm --filter @drongo/agent-provider build
pnpm --filter @drongo/agent-provider serve     # listens on :4021 (MOCK verifier)
```

**Payment verification** has two modes (a seam, so real settlement drops in
without touching the transport):

- `MockPaymentVerifier` (default, `MOCK_X402=true`) — accepts any non-empty
  `X-PAYMENT` proof. Honest stand-in for local demos; does **not** verify a real
  on-chain payment.
- `FacilitatorPaymentVerifier` (`MOCK_X402=false`) — POSTs the payload to an
  external x402 facilitator's `/verify` then `/settle` (Coinbase / OpenZeppelin).

**Env:** `PORT` (4021), `X402_NETWORK` (`stellar:testnet`), `X402_ASSET`
(SEP-41 token), `X402_PAY_TO`, `X402_MAX_AMOUNT`, `MOCK_X402` (`true`),
`X402_FACILITATOR_URL`.

## Exposed

`HttpClient`, `FetchHttpClient`; `WeatherService` / `CryptoPriceService` /
`TranslationService` (+ their request/result types, `wmoText`); `ToolSpec`,
`TOOL_SPECS`, `buildToolbox`; `createProviderServer`, `ProviderServerDeps`,
`readProviderServerConfig`, `ProviderServerConfig`; `buildPaymentRequirements`,
`build402Response`, `readPaymentHeader`, `PaymentRequirements`;
`createPaymentVerifier`, `MockPaymentVerifier`, `FacilitatorPaymentVerifier`,
`PaymentVerifier`; `ChannelRegistry`, `OpenChannelInput`.
