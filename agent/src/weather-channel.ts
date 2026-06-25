import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { DrongoCrypto } from "./crypto.js";
import { writeCircuitInput } from "./circuit.js";
import { createIdentity, randomFieldValue } from "./keys.js";
import type { MeteredServiceChannel } from "./metered-service.js";
import { ServiceChannel } from "./service-channel.js";
import type { SettlementWitness } from "./types.js";
import { openX402ChannelFromUsd } from "./x402-service-channel.js";
import type { WeatherRequest, WeatherResult, WeatherService } from "./weather.js";

const USDC = 1_000_000n;

/** Open an in-process or x402-backed weather channel (when `PROVIDER_URL` is set). */
export async function openWeatherChannel(
  crypto: DrongoCrypto,
  service: WeatherService,
): Promise<MeteredServiceChannel<WeatherRequest, WeatherResult>> {
  const identity = createIdentity(crypto);
  const rateBlind = randomFieldValue();
  const channelSecret = randomFieldValue();
  const rate = 2_000n;
  const escrow = 20n * USDC;
  const providerUrl = process.env.PROVIDER_URL;

  if (providerUrl !== undefined && providerUrl.length > 0) {
    return openX402ChannelFromUsd(service, {
      providerUrl,
      crypto,
      identity,
      rateBlind,
      channelSecret,
      unitPriceUsd: process.env.SLATE_UNIT_PRICE ?? "0.002",
      escrowUsd: process.env.SLATE_ESCROW_AMOUNT ?? "20",
    });
  }

  return new ServiceChannel(
    crypto,
    { channelId: randomFieldValue(), rate, escrow, rateBlind, channelSecret, identity },
    service,
  );
}

/** Close the channel; export circuit input when running over x402. */
export async function closeWeatherChannel(
  channel: MeteredServiceChannel<WeatherRequest, WeatherResult>,
): Promise<SettlementWitness> {
  const witness = await channel.close();

  if (process.env.PROVIDER_URL) {
    const out = resolve(process.cwd(), process.env.WITNESS_OUT ?? "../artifacts/demo-witness.json");
    mkdirSync(dirname(out), { recursive: true });
    writeCircuitInput(out, witness);
  }

  return witness;
}
