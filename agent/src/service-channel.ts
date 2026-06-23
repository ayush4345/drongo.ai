import type { ShadowCrypto } from "./crypto.js";
import { MeteredChannel, type OpenChannelOpts } from "./channel.js";
import type { ConsumerAgent } from "./consumer.js";
import type { ProviderAgent, RejectReason } from "./provider.js";
import type { Service } from "./service.js";
import type { ChannelTerms, SettlementWitness, Voucher } from "./types.js";

/** A request bundled with the consumer's payment authorization for it. */
export interface PaidRequest<Req> {
  request: Req;
  /** Units the consumer paid for (its view of the price). */
  cost: bigint;
  /** Cumulative voucher covering this call. */
  voucher: Voucher;
}

export interface ServeResponse<Res> {
  served: boolean;
  /** Present only when `served` — the work product. */
  result?: Res;
  reason?: RejectReason | "underpaid";
  /** The provider's independently-computed price for the request. */
  cost: bigint;
  cumulativeUnits?: bigint;
  /** cumulativeUnits * rate so far. */
  billable?: bigint;
}

export interface CallOutcome<Req, Res> extends ServeResponse<Res> {
  request: Req;
  voucher: Voucher;
}

/**
 * Consumer side of the service loop: turns a request into a *paid request* by signing a
 * cumulative voucher that advances the meter by the call's price.
 */
export class ServiceConsumer<Req, Res> {
  constructor(
    private readonly consumer: ConsumerAgent,
    private readonly service: Service<Req, Res>,
  ) {}

  /** Sign payment for a request and return it bundled with the voucher. */
  request(req: Req): PaidRequest<Req> {
    const cost = this.service.price(req);
    if (cost <= 0n) throw new Error("service price must be positive");
    const voucher = this.consumer.signFor(cost);
    return { request: req, cost, voucher };
  }
}

/**
 * Provider side of the service loop. The provider PRICES the request itself, checks the
 * accompanying voucher actually covers that price, validates it through the channel's
 * gatekeeping (signature, monotonicity, escrow ceiling), and only then performs the work.
 *
 * Order is pay-first: the consumer's voucher arrives with the request, so the provider
 * never serves unpaid work. Worst-case the consumer is out one increment if a provider
 * misbehaves — tune the per-call cost to bound that exposure.
 */
export class ServiceProvider<Req, Res> {
  constructor(
    private readonly provider: ProviderAgent,
    private readonly service: Service<Req, Res>,
  ) {}

  serve(paid: PaidRequest<Req>): ServeResponse<Res> {
    const cost = this.service.price(paid.request);

    // The voucher must advance the meter by at least the provider's price for this call.
    const prev = this.provider.latestVoucher?.cumulativeUnits ?? 0n;
    const increment = paid.voucher.cumulativeUnits - prev;
    if (increment < cost) {
      return { served: false, reason: "underpaid", cost };
    }

    // Channel gatekeeping: signature, monotonicity, escrow ceiling.
    const res = this.provider.receive(paid.voucher);
    if (!res.accepted) {
      return { served: false, reason: res.reason, cost, cumulativeUnits: res.cumulativeUnits, billable: res.billable };
    }

    // Paid and valid → do the work.
    return {
      served: true,
      result: this.service.handle(paid.request),
      cost,
      cumulativeUnits: res.cumulativeUnits,
      billable: res.billable,
    };
  }
}

/**
 * ServiceChannel wires a {@link ServiceConsumer} and {@link ServiceProvider} over a single
 * {@link MeteredChannel}, exposing the full request → pay → serve round-trip plus the
 * settlement close. The metering, gatekeeping, and ZK witness export are reused unchanged.
 */
export class ServiceChannel<Req, Res> {
  readonly channel: MeteredChannel;
  readonly consumer: ServiceConsumer<Req, Res>;
  readonly provider: ServiceProvider<Req, Res>;

  constructor(crypto: ShadowCrypto, opts: OpenChannelOpts, service: Service<Req, Res>) {
    this.channel = new MeteredChannel(crypto, opts);
    this.consumer = new ServiceConsumer(this.channel.consumer, service);
    this.provider = new ServiceProvider(this.channel.provider, service);
  }

  get terms(): ChannelTerms {
    return this.channel.terms;
  }

  rateCommitment(): bigint {
    return this.channel.rateCommitment();
  }

  /** One full round-trip: consumer pays, provider verifies + serves (or refuses). */
  call(req: Req): CallOutcome<Req, Res> {
    const paid = this.consumer.request(req);
    const resp = this.provider.serve(paid);
    return { ...resp, request: req, voucher: paid.voucher };
  }

  /** Build the settlement witness from the final accepted voucher. */
  close(): SettlementWitness {
    return this.channel.close();
  }
}
