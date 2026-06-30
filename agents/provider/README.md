# @drongo/agent-provider

The **provider agent** — sells current weather per call via the keyless
[Open-Meteo](https://open-meteo.com) API (`WeatherService`: geocode → forecast),
priced at one unit per call. The HTTP client is injected (`FetchHttpClient` in
production, a canned client in tests), so it runs offline.

It is the *service* side of the metered channel: the consumer agent
(`@drongo/agent-consumer`) opens a channel, pays per call with signed vouchers,
and the provider serves only paid, in-budget requests — all wired through
`@drongo/agent-core`.

```bash
pnpm --filter @drongo/agent-provider build
```

Exposed: `WeatherService`, `FetchHttpClient`, `HttpClient`, `WeatherRequest`,
`WeatherResult`, `wmoText`.
