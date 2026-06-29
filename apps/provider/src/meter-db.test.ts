import { describe, expect, it } from "vitest";
import {
  DrongoCrypto,
  WeatherService,
  createIdentity,
  randomFieldValue,
  type HttpClient,
} from "@drongo/agent";
import { DeterministicDevVoucherSigner } from "@slate/protocol";

import { ChannelStore } from "./channels.js";
import { DrongoChannelStore } from "./drongo-channels.js";
import { MeterDb } from "./meter-db.js";

class MockHttp implements HttpClient {
  async getJson(url: string): Promise<any> {
    if (url.includes("geocoding")) {
      const name = decodeURIComponent(new URL(url).searchParams.get("name") ?? "X");
      return { results: [{ name, latitude: 1, longitude: 2 }] };
    }
    return { current: { temperature_2m: 20, wind_speed_10m: 5, weather_code: 0 } };
  }
}

describe("meter db persistence", () => {
  it("persists dev channel vouchers across store restarts", async () => {
    const db = new MeterDb(":memory:");
    const signer = new DeterministicDevVoucherSigner("consumer-secret");

    const opened = await new ChannelStore(undefined, db).openChannel({
      consumer: "consumer_demo",
      provider: "mock_provider",
      escrowAmount: "20",
      unitPrice: "0.002",
      chain: "mock",
      openTx: "mock_tx",
    });

    const voucher = await signer.signVoucher({
      channelId: opened.channelId,
      cumulativeUnits: "7",
      nonce: "n_7",
    });

    const firstStore = new ChannelStore(undefined, db);
    expect(await firstStore.acceptVoucher(opened.channelId, voucher)).toMatchObject({
      ok: true,
      acceptedUnits: "7",
    });

    const reloaded = new ChannelStore(undefined, db);
    expect(reloaded.getChannel(opened.channelId)?.channelId).toBe(opened.channelId);
    expect(reloaded.getFinalVoucher(opened.channelId)?.cumulativeUnits).toBe("7");

    const stale = await signer.signVoucher({
      channelId: opened.channelId,
      cumulativeUnits: "7",
      nonce: "n_7b",
    });
    expect(await reloaded.acceptVoucher(opened.channelId, stale)).toEqual({
      ok: false,
      reason: "stale-voucher",
    });

    db.close();
  });

  it("records meter events for accepted vouchers", async () => {
    const db = new MeterDb(":memory:");
    const signer = new DeterministicDevVoucherSigner("consumer-secret");
    const store = new ChannelStore(undefined, db);
    const channel = await store.openChannel({
      consumer: "consumer_demo",
      provider: "mock_provider",
      escrowAmount: "20",
      unitPrice: "0.002",
      chain: "mock",
      openTx: "mock_tx",
    });

    await store.acceptVoucher(
      channel.channelId,
      await signer.signVoucher({
        channelId: channel.channelId,
        cumulativeUnits: "3",
        nonce: "n_3",
      }),
    );

    expect(db.listMeterEvents(channel.channelId)).toEqual([
      {
        channelId: channel.channelId,
        cumulativeUnits: "3",
        eventType: "voucher_accepted",
      },
    ]);

    db.close();
  });

  it("persists drongo channel metering across store restarts", async () => {
    const db = new MeterDb(":memory:");
    const weather = new WeatherService(new MockHttp(), 1n);
    const crypto = await DrongoCrypto.build();
    const identity = createIdentity(crypto, Buffer.alloc(32, 9));
    const rate = 1n;
    const escrow = 10n;
    const rateCommitment = crypto.poseidon([rate, randomFieldValue()]);

    const opened = await new DrongoChannelStore(weather, db).openChannel({
      consumerPubKey: identity.publicKey,
      rateCommitment,
      escrowMicros: escrow,
      rateMicros: rate,
    });

    const { ConsumerAgent, serializeVoucher } = await import("@drongo/agent");
    const agent = new ConsumerAgent(crypto, identity, BigInt(opened.channelId));
    const wire = serializeVoucher(agent.signFor(1n));

    const firstStore = new DrongoChannelStore(weather, db);
    expect(
      await firstStore.acceptCall(opened.channelId, wire, { location: "Tokyo" }),
    ).toMatchObject({ ok: true, served: true, cumulativeUnits: "1" });

    const reloaded = new DrongoChannelStore(weather, db);
    expect(reloaded.hasChannel(opened.channelId)).toBe(true);

    const nextWire = serializeVoucher(agent.signFor(1n));
    expect(
      await reloaded.acceptCall(opened.channelId, nextWire, { location: "Paris" }),
    ).toMatchObject({ ok: true, served: true, cumulativeUnits: "2" });

    db.close();
  });
});
