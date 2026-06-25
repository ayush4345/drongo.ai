import { describe, expect, it } from "vitest";
import {
  DrongoCrypto,
  WeatherService,
  X402ServiceChannel,
  WeatherConsumerAgent,
  createIdentity,
  randomFieldValue,
  StubLlmClient,
  type HttpClient,
  type WeatherResult,
} from "@drongo/agent";

import { createProviderApp } from "./routes.js";
import { DrongoChannelStore } from "./drongo-channels.js";

class MockHttp implements HttpClient {
  async getJson(url: string): Promise<any> {
    if (url.includes("geocoding")) {
      const name = decodeURIComponent(new URL(url).searchParams.get("name") ?? "X");
      return { results: [{ name, latitude: 1, longitude: 2 }] };
    }
    return { current: { temperature_2m: 20, wind_speed_10m: 5, weather_code: 0 } };
  }
}

class FixedLlm extends StubLlmClient {
  override async decide(_goal: string, gathered: WeatherResult[]) {
    if (gathered.length === 0) return { lookups: ["Tokyo", "London"] };
    return { answer: `done: ${gathered.length}` };
  }
}

async function withServer<T>(run: (baseUrl: string) => Promise<T>): Promise<T> {
  const weather = new WeatherService(new MockHttp(), 1n);
  const drongo = new DrongoChannelStore(weather);
  const app = createProviderApp({ drongo });
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("server did not bind to a TCP port");
  }
  try {
    return await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

describe("drongo x402 weather integration", () => {
  it("opens via x402, meters weather with EdDSA vouchers, and finalizes", async () => {
    await withServer(async (baseUrl) => {
      const crypto = await DrongoCrypto.build();
      const channel = await X402ServiceChannel.open(new WeatherService(new MockHttp(), 1n), {
        providerUrl: baseUrl,
        crypto,
        identity: createIdentity(crypto, Buffer.alloc(32, 3)),
        rateBlind: randomFieldValue(),
        channelSecret: randomFieldValue(),
        rate: 2_000n,
        escrow: 20_000_000n,
      });

      const agent = new WeatherConsumerAgent(channel, new FixedLlm());
      const { answer, lookups } = await agent.run("weather");
      expect(lookups).toHaveLength(2);
      expect(answer).toMatch(/done: 2/);

      const witness = await channel.close();
      expect(witness.totalUnits).toBe("2");
    });
  });
});
