import type { DrongoCrypto } from "./crypto.js";
import { buildSettlementWitness } from "./channel.js";
import { ConsumerAgent } from "./consumer.js";
import type { ConsumerIdentity } from "./keys.js";
import type { MeteredServiceChannel, CallOutcome } from "./metered-service.js";
import { parseUsdToMicros } from "./money.js";
import type { Service } from "./service.js";
import { ServiceConsumer } from "./service-channel.js";
import type { BabyJubPublicKey, ChannelTerms, SettlementWitness, Voucher } from "./types.js";
import { fetchWithManualX402, type FetchLike } from "./x402-client.js";
import { deserializeVoucher, serializeVoucher, type WireVoucher } from "./voucher-wire.js";

export type OpenDrongoChannelResponse = {
  ok: true;
  channel: {
    channelId: string;
    escrow: string;
    rate: string;
    rateCommitment: string;
    maxUnits: string;
  };
};

export type X402ServiceChannelOpts = {
  providerUrl: string;
  crypto: DrongoCrypto;
  identity: ConsumerIdentity;
  rateBlind: bigint;
  channelSecret: bigint;
  /** Escrow ceiling in micro-USDC. Defaults to 20 USDC. */
  escrow?: bigint;
  /** Per-unit rate in micro-USDC. Defaults to 0.002 USDC (2000 micro). */
  rate?: bigint;
  fetchImpl?: FetchLike;
  paymentSignature?: string;
};

type CallResponseBody = {
  ok: boolean;
  served?: boolean;
  result?: unknown;
  reason?: string;
  cumulativeUnits?: string;
  billable?: string;
};

/**
 * Remote metered service client: x402 channel open, Drongo vouchers on each call,
 * settlement witness built locally from the last accepted voucher.
 */
export class X402ServiceChannel<Req, Res> implements MeteredServiceChannel<Req, Res> {
  readonly terms: ChannelTerms;
  private readonly consumer: ServiceConsumer<Req, Res>;
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;
  private readonly paymentSignature: string;
  private lastAccepted: Voucher | null = null;

  private constructor(
    private readonly crypto: DrongoCrypto,
    private readonly identity: ConsumerIdentity,
    terms: ChannelTerms,
    service: Service<Req, Res>,
    baseUrl: string,
    fetchImpl: FetchLike,
    paymentSignature: string,
  ) {
    this.terms = terms;
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.fetchImpl = fetchImpl;
    this.paymentSignature = paymentSignature;
    const agent = new ConsumerAgent(crypto, identity, terms.channelId);
    this.consumer = new ServiceConsumer(agent, service);
  }

  /** Discover the provider, pay x402 escrow, and open a Drongo metered channel. */
  static async open<Req, Res>(
    service: Service<Req, Res>,
    opts: X402ServiceChannelOpts,
  ): Promise<X402ServiceChannel<Req, Res>> {
    const fetchImpl = opts.fetchImpl ?? fetch;
    const baseUrl = opts.providerUrl.replace(/\/$/, "");
    const rate = opts.rate ?? 2_000n;
    const escrow = opts.escrow ?? 20_000_000n;
    const rateCommitment = opts.crypto.poseidon([rate, opts.rateBlind]);
    const consumerPubKey = wirePublicKey(opts.identity.publicKey);

    await readJson(fetchImpl(`${baseUrl}/.well-known/agent-card.json`));

    const openResponse = await fetchWithManualX402({
      url: `${baseUrl}/agent/open`,
      init: {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          consumerPubKey,
          rateCommitment: rateCommitment.toString(),
        }),
      },
      fetchImpl,
      paymentSignature: opts.paymentSignature,
    });

    const opened = (await readJson(openResponse)) as OpenDrongoChannelResponse;
    const channelId = BigInt(opened.channel.channelId);

    const terms: ChannelTerms = {
      channelId,
      rate,
      rateBlind: opts.rateBlind,
      escrow,
      channelSecret: opts.channelSecret,
    };

    return new X402ServiceChannel(
      opts.crypto,
      opts.identity,
      terms,
      service,
      baseUrl,
      fetchImpl,
      opts.paymentSignature ?? "mock_payment_signature",
    );
  }

  async call(req: Req): Promise<CallOutcome<Req, Res>> {
    const paid = this.consumer.request(req);
    const response = await this.fetchImpl(
      `${this.baseUrl}/channels/${this.terms.channelId.toString()}/call`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          voucher: serializeVoucher(paid.voucher),
          payload: req,
        }),
      },
    );

    const body = (await response.json()) as CallResponseBody;
    if (!response.ok || !body.ok) {
      return {
        served: false,
        request: req,
        voucher: paid.voucher,
        reason: body.reason ?? `HTTP ${response.status}`,
        cost: paid.cost,
      };
    }

    if (body.served) {
      this.lastAccepted = paid.voucher;
    }

    return {
      served: body.served === true,
      request: req,
      voucher: paid.voucher,
      result: body.result as Res | undefined,
      reason: body.reason,
      cost: paid.cost,
      cumulativeUnits: body.cumulativeUnits ? BigInt(body.cumulativeUnits) : undefined,
      billable: body.billable ? BigInt(body.billable) : undefined,
    };
  }

  async close(): Promise<SettlementWitness> {
    const response = await this.fetchImpl(
      `${this.baseUrl}/channels/${this.terms.channelId.toString()}/finalize`,
      { method: "POST" },
    );
    await readJson(response);

    const finalVoucher = this.lastAccepted;
    if (finalVoucher === null) {
      throw new Error("no accepted vouchers — nothing to settle");
    }

    return buildSettlementWitness(
      this.crypto,
      this.terms,
      this.identity.publicKey,
      finalVoucher,
    );
  }
}

/** Open a channel using USD strings from the provider agent card / env. */
export async function openX402ChannelFromUsd<Req, Res>(
  service: Service<Req, Res>,
  opts: Omit<X402ServiceChannelOpts, "rate" | "escrow"> & {
    unitPriceUsd: string;
    escrowUsd: string;
  },
): Promise<X402ServiceChannel<Req, Res>> {
  return X402ServiceChannel.open(service, {
    ...opts,
    rate: parseUsdToMicros(opts.unitPriceUsd),
    escrow: parseUsdToMicros(opts.escrowUsd),
  });
}

function wirePublicKey(key: BabyJubPublicKey): { Ax: string; Ay: string } {
  return { Ax: key.Ax.toString(), Ay: key.Ay.toString() };
}

export function parseWirePublicKey(wire: { Ax: string; Ay: string }): BabyJubPublicKey {
  return { Ax: BigInt(wire.Ax), Ay: BigInt(wire.Ay) };
}

async function readJson(responsePromise: Promise<Response> | Response): Promise<unknown> {
  const response = await responsePromise;
  if (!response.ok) {
    throw new Error(`request failed with HTTP ${response.status}`);
  }
  return response.json();
}

export type { WireVoucher };
