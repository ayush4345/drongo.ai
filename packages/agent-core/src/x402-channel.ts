import {
  deriveConsumerPublicKey,
  buildSettlementInputs,
  generateSettlementProof,
  serializeSettlement,
} from "@drongo/proving-setup";
import type { ConsumerPublicKey, Voucher } from "@drongo/proving-setup";
import { ConsumerMeter } from "./channel.js";
import type { CallOutcome, ChannelTerms, MeteredServiceChannel, SettlementResult } from "./channel.js";
import { serializeVoucher } from "./voucher-wire.js";
import { fetchWithManualX402, type FetchLike } from "./x402-client.js";

export interface X402ChannelOptions {
  /** Base URL of the remote provider (e.g. http://localhost:4021). */
  providerUrl: string;
  terms: ChannelTerms;
  fetchImpl?: FetchLike;
  /** x402 payment authorization presented at open (mock by default). */
  paymentSignature?: string;
  /** Units signed per call (defaults to 1). */
  unitsPerCall?: bigint;
}

interface CallResponseBody {
  served?: boolean;
  result?: unknown;
  reason?: string;
  cumulativeUnits?: string;
  billable?: string;
}

/**
 * Consumer-side x402 transport. It opens a channel with a REMOTE provider over
 * HTTP (x402: 402 → pay → open), signs a cumulative voucher per call and posts
 * it to the provider, and builds the settlement witness locally at close.
 *
 * It implements {@link MeteredServiceChannel}, so the same ServiceAgent drives
 * it exactly like the in-process channel — the LLM still picks which tool to
 * use, but now the provider is a separate service reached over the network.
 */
export class X402ServiceChannel<Req, Res> implements MeteredServiceChannel<Req, Res> {
  readonly consumerPublicKey: ConsumerPublicKey;
  readonly #baseUrl: string;
  readonly #terms: ChannelTerms;
  readonly #consumer: ConsumerMeter;
  readonly #fetch: FetchLike;
  readonly #unitsPerCall: bigint;
  #lastAccepted: Voucher | undefined;

  private constructor(
    baseUrl: string,
    terms: ChannelTerms,
    consumer: ConsumerMeter,
    consumerPublicKey: ConsumerPublicKey,
    fetchImpl: FetchLike,
    unitsPerCall: bigint,
  ) {
    this.#baseUrl = baseUrl;
    this.#terms = terms;
    this.#consumer = consumer;
    this.consumerPublicKey = consumerPublicKey;
    this.#fetch = fetchImpl;
    this.#unitsPerCall = unitsPerCall;
  }

  /** Discover + x402-open a channel with the remote provider. */
  static async open<Req, Res>(options: X402ChannelOptions): Promise<X402ServiceChannel<Req, Res>> {
    const fetchImpl = options.fetchImpl ?? fetch;
    const baseUrl = options.providerUrl.replace(/\/$/, "");
    const consumerPublicKey = await deriveConsumerPublicKey(options.terms.consumerPrivateKey);

    const res = await fetchWithManualX402({
      url: `${baseUrl}/agent/open`,
      init: {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          channelId: options.terms.channelId.toString(),
          consumerPublicKey: { x: consumerPublicKey.x.toString(), y: consumerPublicKey.y.toString() },
          rate: options.terms.rate.toString(),
          escrow: options.terms.escrow.toString(),
        }),
      },
      fetchImpl,
      paymentSignature: options.paymentSignature,
    });
    if (!res.ok) throw new Error(`x402 open failed: HTTP ${res.status}`);
    await res.json().catch(() => undefined);

    const consumer = new ConsumerMeter(options.terms.consumerPrivateKey, options.terms.channelId);
    return new X402ServiceChannel(
      baseUrl,
      options.terms,
      consumer,
      consumerPublicKey,
      fetchImpl,
      options.unitsPerCall ?? 1n,
    );
  }

  async call(req: Req): Promise<CallOutcome<Req, Res>> {
    const voucher = await this.#consumer.signFor(this.#unitsPerCall);
    const res = await this.#fetch(
      `${this.#baseUrl}/channels/${this.#terms.channelId.toString()}/call`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ voucher: serializeVoucher(voucher), payload: req }),
      },
    );
    const body = (await res.json().catch(() => ({}))) as CallResponseBody;
    const served = res.ok && body.served === true;
    if (served) this.#lastAccepted = voucher;

    return {
      served,
      request: req,
      voucher,
      result: served ? (body.result as Res) : undefined,
      reason: body.reason,
      cost: this.#unitsPerCall,
      cumulativeUnits: body.cumulativeUnits !== undefined ? BigInt(body.cumulativeUnits) : undefined,
      billable: body.billable !== undefined ? BigInt(body.billable) : undefined,
    };
  }

  async close(): Promise<SettlementResult> {
    const final = this.#lastAccepted;
    if (final === undefined) throw new Error("no accepted vouchers — nothing to settle");

    await this.#fetch(`${this.#baseUrl}/channels/${this.#terms.channelId.toString()}/finalize`, {
      method: "POST",
    }).catch(() => undefined);

    const inputs = await buildSettlementInputs({
      channelId: this.#terms.channelId,
      channelSecret: this.#terms.channelSecret,
      rate: this.#terms.rate,
      rateBlind: this.#terms.rateBlind,
      totalUnits: final.totalUnits,
      escrowAmount: this.#terms.escrow,
      depositorPayload: this.#terms.depositorPayload,
      providerPayload: this.#terms.providerPayload,
      tokenPayload: this.#terms.tokenPayload,
      voucher: { consumerPublicKey: final.consumerPublicKey, signature: final.signature },
    });
    const proof = await generateSettlementProof(inputs);
    const serialized = serializeSettlement(proof);
    return { inputs, proof, serialized };
  }
}
