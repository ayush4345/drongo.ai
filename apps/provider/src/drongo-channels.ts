import {
  DrongoCrypto,
  ProviderAgent,
  ServiceProvider,
  WeatherService,
  FetchHttpClient,
  deserializeVoucher,
  isWireVoucher,
  parseWirePublicKey,
  randomFieldValue,
  type BabyJubPublicKey,
  type WeatherRequest,
  type WeatherResult,
} from "@drongo/agent";

import type { DrongoChannelSnapshot, MeterDb } from "./meter-db.js";

export type DrongoOpenInput = {
  consumerPubKey: BabyJubPublicKey;
  rateCommitment: bigint;
  escrowMicros: bigint;
  rateMicros: bigint;
};

export type DrongoChannelRecord = {
  channelId: string;
  escrow: string;
  rate: string;
  rateCommitment: string;
  maxUnits: string;
};

export type DrongoCallResult =
  | {
      ok: true;
      served: true;
      channelId: string;
      cumulativeUnits: string;
      billable: string;
      result: WeatherResult;
    }
  | {
      ok: true;
      served: false;
      channelId: string;
      reason: string;
      cumulativeUnits?: string;
      billable?: string;
    }
  | { ok: false; reason: string };

type ChannelState = {
  provider: ServiceProvider<WeatherRequest, WeatherResult>;
  rate: bigint;
  escrow: bigint;
  rateCommitment: string;
  consumerPubKey: BabyJubPublicKey;
  halted: boolean;
  lastAcceptedUnits: bigint;
};

export class DrongoChannelStore {
  readonly #channels = new Map<string, ChannelState>();
  #crypto: DrongoCrypto | null = null;
  readonly #weather: WeatherService;
  readonly #pendingSnapshots: DrongoChannelSnapshot[];
  #hydrated = false;

  constructor(
    weather: WeatherService = new WeatherService(new FetchHttpClient(), 1n),
    private readonly meterDb?: MeterDb,
  ) {
    this.#weather = weather;
    this.#pendingSnapshots =
      meterDb === undefined ? [] : meterDb.loadDrongoChannels();
  }

  async ready(): Promise<DrongoCrypto> {
    if (this.#crypto === null) {
      this.#crypto = await DrongoCrypto.build();
      await this.#hydrateFromDb(this.#crypto);
    }
    return this.#crypto;
  }

  async #hydrateFromDb(crypto: DrongoCrypto): Promise<void> {
    if (this.#hydrated) return;
    this.#hydrated = true;

    for (const snapshot of this.#pendingSnapshots) {
      this.#restoreChannel(crypto, snapshot);
    }
  }

  #restoreChannel(crypto: DrongoCrypto, snapshot: DrongoChannelSnapshot): void {
    const channelId = BigInt(snapshot.channelId);
    const consumerPubKey = parseWirePublicKey(snapshot.consumerPubKey);
    const rate = BigInt(snapshot.rateMicros);
    const escrow = BigInt(snapshot.escrowMicros);
    const providerAgent = new ProviderAgent(
      crypto,
      channelId,
      consumerPubKey,
      rate,
      escrow,
    );

    if (snapshot.latestVoucher !== undefined) {
      providerAgent.receive(deserializeVoucher(snapshot.latestVoucher));
    }

    this.#channels.set(snapshot.channelId, {
      provider: new ServiceProvider(providerAgent, this.#weather),
      rate,
      escrow,
      rateCommitment: snapshot.rateCommitment,
      consumerPubKey,
      halted: snapshot.halted,
      lastAcceptedUnits: BigInt(snapshot.lastAcceptedUnits),
    });
  }

  async openChannel(input: DrongoOpenInput): Promise<DrongoChannelRecord> {
    const crypto = await this.ready();
    void crypto;

    const channelId = randomFieldValue();
    const providerAgent = new ProviderAgent(
      crypto,
      channelId,
      input.consumerPubKey,
      input.rateMicros,
      input.escrowMicros,
    );
    const serviceProvider = new ServiceProvider(providerAgent, this.#weather);
    const channelIdStr = channelId.toString();
    const rateCommitment = input.rateCommitment.toString();

    this.#channels.set(channelIdStr, {
      provider: serviceProvider,
      rate: input.rateMicros,
      escrow: input.escrowMicros,
      rateCommitment,
      consumerPubKey: input.consumerPubKey,
      halted: false,
      lastAcceptedUnits: 0n,
    });

    const maxUnits = input.escrowMicros / input.rateMicros;

    this.meterDb?.saveDrongoChannel({
      channelId: channelIdStr,
      consumerPubKey: {
        Ax: input.consumerPubKey.Ax.toString(),
        Ay: input.consumerPubKey.Ay.toString(),
      },
      rateMicros: input.rateMicros.toString(),
      escrowMicros: input.escrowMicros.toString(),
      rateCommitment,
      lastAcceptedUnits: "0",
      halted: false,
    });

    return {
      channelId: channelIdStr,
      escrow: input.escrowMicros.toString(),
      rate: input.rateMicros.toString(),
      rateCommitment,
      maxUnits: maxUnits.toString(),
    };
  }

  async acceptCall(
    channelId: string,
    voucher: unknown,
    payload: unknown,
  ): Promise<DrongoCallResult> {
    await this.ready();

    if (!isWireVoucher(voucher)) {
      return { ok: false, reason: "invalid-voucher" };
    }

    const state = this.#channels.get(channelId);
    if (state === undefined) {
      return { ok: false, reason: "unknown-channel" };
    }

    if (state.halted) {
      return {
        ok: true,
        served: false,
        channelId,
        reason: "ceiling-exceeded",
        cumulativeUnits: state.lastAcceptedUnits.toString(),
      };
    }

    const request = parseWeatherPayload(payload);
    if (request === undefined) {
      return { ok: false, reason: "invalid-payload" };
    }

    const parsed = deserializeVoucher(voucher);
    const cost = this.#weather.price(request);
    const paid = { request, cost, voucher: parsed };
    const resp = await state.provider.serve(paid);

    if (resp.served && resp.result) {
      state.lastAcceptedUnits = resp.cumulativeUnits!;
      this.meterDb?.updateDrongoMeter(
        channelId,
        resp.cumulativeUnits!.toString(),
        voucher,
        false,
      );

      return {
        ok: true,
        served: true,
        channelId,
        cumulativeUnits: resp.cumulativeUnits!.toString(),
        billable: resp.billable!.toString(),
        result: resp.result,
      };
    }

    const halted = resp.reason === "ceiling-exceeded";
    if (halted) {
      state.halted = true;
    } else if (resp.cumulativeUnits !== undefined) {
      state.lastAcceptedUnits = resp.cumulativeUnits;
    }

    this.meterDb?.updateDrongoMeter(
      channelId,
      resp.cumulativeUnits?.toString() ?? "0",
      halted ? undefined : voucher,
      halted,
      halted ? "ceiling_reached" : "voucher_accepted",
    );

    return {
      ok: true,
      served: false,
      channelId,
      reason: resp.reason ?? "rejected",
      cumulativeUnits: resp.cumulativeUnits?.toString(),
      billable: resp.billable?.toString(),
    };
  }

  getChannel(channelId: string): DrongoChannelRecord | undefined {
    const state = this.#channels.get(channelId);
    if (state !== undefined) {
      const maxUnits = state.escrow / state.rate;
      return {
        channelId,
        escrow: state.escrow.toString(),
        rate: state.rate.toString(),
        rateCommitment: state.rateCommitment,
        maxUnits: maxUnits.toString(),
      };
    }

    const pending = this.#pendingSnapshots.find(
      (snapshot) => snapshot.channelId === channelId,
    );
    if (pending === undefined) return undefined;

    const maxUnits = BigInt(pending.escrowMicros) / BigInt(pending.rateMicros);
    return {
      channelId,
      escrow: pending.escrowMicros,
      rate: pending.rateMicros,
      rateCommitment: pending.rateCommitment,
      maxUnits: maxUnits.toString(),
    };
  }

  hasChannel(channelId: string): boolean {
    return (
      this.#channels.has(channelId) ||
      this.#pendingSnapshots.some((snapshot) => snapshot.channelId === channelId)
    );
  }
}

export function parseDrongoOpenBody(body: unknown, escrowMicros: bigint, rateMicros: bigint):
  | { ok: true; input: DrongoOpenInput }
  | { ok: false; reason: string } {
  if (typeof body !== "object" || body === null) {
    return { ok: false, reason: "invalid-body" };
  }
  const record = body as Record<string, unknown>;
  const pub = record.consumerPubKey;
  if (typeof pub !== "object" || pub === null) {
    return { ok: false, reason: "missing-consumer-pubkey" };
  }
  const wire = pub as Record<string, unknown>;
  if (typeof wire.Ax !== "string" || typeof wire.Ay !== "string") {
    return { ok: false, reason: "invalid-consumer-pubkey" };
  }
  if (typeof record.rateCommitment !== "string") {
    return { ok: false, reason: "missing-rate-commitment" };
  }

  return {
    ok: true,
    input: {
      consumerPubKey: parseWirePublicKey({ Ax: wire.Ax, Ay: wire.Ay }),
      rateCommitment: BigInt(record.rateCommitment),
      escrowMicros,
      rateMicros,
    },
  };
}

function parseWeatherPayload(payload: unknown): WeatherRequest | undefined {
  if (typeof payload !== "object" || payload === null) return undefined;
  const location = (payload as Record<string, unknown>).location;
  if (typeof location !== "string" || location.length === 0) return undefined;
  return { location };
}
