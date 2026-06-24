import { test } from "node:test";
import assert from "node:assert/strict";
import { DrongoCrypto } from "../src/crypto.js";
import { createIdentity } from "../src/keys.js";
import { ServiceChannel } from "../src/service-channel.js";
import { WeatherService, type HttpClient, type WeatherRequest, type WeatherResult } from "../src/weather.js";
import { WeatherConsumerAgent } from "../src/weather-consumer.js";
import type { LlmClient, LlmDecision } from "../src/llm.js";

const USDC = 1_000_000n;

class MockHttp implements HttpClient {
  async getJson(url: string): Promise<any> {
    if (url.includes("geocoding")) {
      const name = decodeURIComponent(new URL(url).searchParams.get("name") ?? "X");
      return { results: [{ name, latitude: 1, longitude: 2 }] };
    }
    return { current: { temperature_2m: 20, wind_speed_10m: 5, weather_code: 0 } };
  }
}

/** A deterministic LLM: asks for three cities once, then answers. */
class FixedLlm implements LlmClient {
  async decide(_goal: string, gathered: WeatherResult[]): Promise<LlmDecision> {
    if (gathered.length === 0) return { lookups: ["Tokyo", "London", "Cairo"] };
    return { answer: `done: ${gathered.length} cities` };
  }
}

function channelWith(crypto: DrongoCrypto, escrow = 20n * USDC) {
  return new ServiceChannel<WeatherRequest, WeatherResult>(
    crypto,
    { channelId: 1234n, rate: 2_000n, escrow, rateBlind: 999n, channelSecret: 555n, identity: createIdentity(crypto, Buffer.alloc(32, 7)) },
    new WeatherService(new MockHttp()),
  );
}

test("LLM consumer buys weather per call, pays, and settles once", async () => {
  const crypto = await DrongoCrypto.build();
  const channel = channelWith(crypto);
  const agent = new WeatherConsumerAgent(channel, new FixedLlm());

  const { answer, lookups } = await agent.run("weather in Tokyo, London, Cairo");
  assert.equal(lookups.length, 3);
  assert.ok(lookups.every((l) => l.served));
  assert.match(answer, /done: 3 cities/);

  const w = channel.close();
  assert.equal(w.totalUnits, "3");
  assert.equal(w.settlementAmount, (3n * 2_000n).toString());
});

test("consumer stops buying when escrow is exhausted", async () => {
  const crypto = await DrongoCrypto.build();
  // escrow only covers 2 calls (rate 2000, escrow 4000)
  const channel = channelWith(crypto, 4_000n);
  const agent = new WeatherConsumerAgent(channel, new FixedLlm());

  const { lookups } = await agent.run("weather in Tokyo, London, Cairo");
  const served = lookups.filter((l) => l.served).length;
  assert.equal(served, 2);
  assert.ok(lookups.some((l) => l.reason === "ceiling-exceeded"));
  assert.equal(channel.close().totalUnits, "2");
});
