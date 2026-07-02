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

```bash
pnpm --filter @drongo/agent-provider build
```

Exposed: `HttpClient`, `FetchHttpClient`; `WeatherService`, `WeatherRequest`,
`WeatherResult`, `wmoText`; `CryptoPriceService`, `CryptoPriceRequest`,
`CryptoPriceResult`; `TranslationService`, `TranslateRequest`, `TranslateResult`.
