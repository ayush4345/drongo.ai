/**
 * Drongo AI weather demo — an LLM consumer agent buys real, metered weather from a
 * provider agent and pays per call, privately, settling once.
 *
 * Run with:  npm run demo:weather  ["your goal here"]
 *
 * Two modes, chosen automatically:
 *   • REAL  (OPENAI_API_KEY set): an OpenAI agent decides which cities to look up and
 *     Open-Meteo serves real current weather.
 *   • OFFLINE (no key): a deterministic stub LLM + canned weather, so it always runs.
 *
 * Set PROVIDER_URL (e.g. http://localhost:4021) for x402 HTTP transport (start provider first).
 */
import { DrongoCrypto } from "./crypto.js";
import {
  WeatherService,
  FetchHttpClient,
  type HttpClient,
} from "./weather.js";
import { StubLlmClient, type LlmClient } from "./llm.js";
import { OpenAiLlmClient } from "./openai-client.js";
import { WeatherConsumerAgent } from "./weather-consumer.js";
import { closeWeatherChannel, openWeatherChannel } from "./weather-channel.js";

const USDC = 1_000_000n;
const usd = (a: bigint) => `${(Number(a) / 1e6).toFixed(6)} USDC`;

/** Deterministic canned weather so the demo runs with no network and no key. */
class CannedHttpClient implements HttpClient {
  async getJson(url: string): Promise<any> {
    const params = new URL(url).searchParams;
    if (url.includes("geocoding-api")) {
      const name = params.get("name") ?? "Nowhere";
      const h = [...name].reduce((a, c) => a + c.charCodeAt(0), 0);
      return { results: [{ name, latitude: (h % 170) - 85, longitude: (h % 360) - 180 }] };
    }
    const lat = Math.abs(Number(params.get("latitude") ?? 0));
    return {
      current: {
        temperature_2m: Math.round((35 - (lat % 35)) * 10) / 10,
        wind_speed_10m: Math.round(lat % 40),
        weather_code: [0, 2, 3, 61, 80][Math.floor(lat) % 5],
      },
    };
  }
}

async function main(): Promise<void> {
  const real = !!process.env.OPENAI_API_KEY;
  const crypto = await DrongoCrypto.build();
  const http: HttpClient = real ? new FetchHttpClient() : new CannedHttpClient();
  const llm: LlmClient = real ? new OpenAiLlmClient() : new StubLlmClient();
  const service = new WeatherService(http, 1n); // 1 unit / weather call

  const channel = await openWeatherChannel(crypto, service);

  const goal =
    process.argv.slice(2).join(" ") ||
    "Compare the current weather in Tokyo, London, and Cairo, and tell me which is warmest.";

  console.log(real ? "═══ MODE: real (OpenAI + Open-Meteo) ═══" : "═══ MODE: offline (stub LLM + canned weather) ═══");
  console.log("provider:", service.name, "@", usd(2_000n), "/ call");
  console.log("goal:", goal, "\n");

  const agent = new WeatherConsumerAgent(channel, llm);
  const { answer, lookups } = await agent.run(goal);

  console.log("── metered weather calls (each paid via voucher, off-chain) ──");
  for (const l of lookups) {
    console.log(
      l.served && l.result
        ? `  ✓ ${l.location}: ${l.result.temperatureC}°C, ${l.result.summary}`
        : `  ✗ ${l.location}: REFUSED (${l.reason})`,
    );
  }

  const w = await closeWeatherChannel(channel);
  const settle = BigInt(w.settlementAmount);
  console.log("\n── one on-chain settlement ──");
  console.log(`  calls served (PRIVATE): ${w.totalUnits}`);
  console.log(`  settled to provider:    ${usd(settle)}`);
  console.log(`  refunded to consumer:   ${usd(20n * USDC - settle)}`);

  console.log("\n── consumer agent's answer ──\n  " + answer);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
