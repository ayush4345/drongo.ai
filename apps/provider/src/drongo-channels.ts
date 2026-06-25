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
};

export class DrongoChannelStore {
  readonly #channels = new Map<string, ChannelState>();
  #crypto: DrongoCrypto | null = null;
  readonly #weather: WeatherService;

  constructor(weather: WeatherService = new WeatherService(new FetchHttpClient(), 1n)) {
    this.#weather = weather;
  }

  async ready(): Promise<DrongoCrypto> {
    if (this.#crypto === null) {
      this.#crypto = await DrongoCrypto.build();
    }
    return this.#crypto;
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

    this.#channels.set(channelIdStr, {
      provider: serviceProvider,
      rate: input.rateMicros,
      escrow: input.escrowMicros,
    });

    const maxUnits = input.escrowMicros / input.rateMicros;

    return {
      channelId: channelIdStr,
      escrow: input.escrowMicros.toString(),
      rate: input.rateMicros.toString(),
      rateCommitment: input.rateCommitment.toString(),
      maxUnits: maxUnits.toString(),
    };
  }

  async acceptCall(
    channelId: string,
    voucher: unknown,
    payload: unknown,
  ): Promise<DrongoCallResult> {
    if (!isWireVoucher(voucher)) {
      return { ok: false, reason: "invalid-voucher" };
    }

    const state = this.#channels.get(channelId);
    if (state === undefined) {
      return { ok: false, reason: "unknown-channel" };
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
      return {
        ok: true,
        served: true,
        channelId,
        cumulativeUnits: resp.cumulativeUnits!.toString(),
        billable: resp.billable!.toString(),
        result: resp.result,
      };
    }

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
    if (state === undefined) return undefined;
    const maxUnits = state.escrow / state.rate;
    return {
      channelId,
      escrow: state.escrow.toString(),
      rate: state.rate.toString(),
      rateCommitment: "",
      maxUnits: maxUnits.toString(),
    };
  }

  hasChannel(channelId: string): boolean {
    return this.#channels.has(channelId);
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
