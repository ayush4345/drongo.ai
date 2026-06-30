import {
  createVoucher,
  deriveConsumerPublicKey,
  verifyVoucher,
  computeVoucherMessage,
  buildSettlementInputs,
  generateSettlementProof,
  serializeSettlement,
} from "@drongo/proving-setup";
import type {
  AddressPayload,
  ConsumerPublicKey,
  SerializedSettlement,
  SettlementCircuitInputs,
  SettlementProof,
  Voucher,
} from "@drongo/proving-setup";
import type { MeterDb } from "./db.js";
import type { Service } from "./service.js";

/** Why a provider refused (or could not accept) a metering voucher. */
export type RejectReason =
  | "wrong-channel"
  | "bad-signature"
  | "non-monotonic"
  | "ceiling-exceeded"
  | "underpaid";

/** The fixed parameters of one metered channel. */
export interface ChannelTerms {
  channelId: bigint;
  /** Per-unit rate in micro-USDC. PRIVATE — only ever committed on-chain. */
  rate: bigint;
  /** Blinding factor for the rate commitment. PRIVATE. */
  rateBlind: bigint;
  /** Escrow ceiling in micro-USDC. Public on-chain. */
  escrow: bigint;
  /** Per-channel secret for the nullifier. PRIVATE. */
  channelSecret: bigint;
  /** 32-byte Baby Jubjub voucher key (Uint8Array or 64-char hex). */
  consumerPrivateKey: AddressPayload;
  /** 32-byte Soroban address payloads bound into the settlement proof. */
  depositorPayload: AddressPayload;
  providerPayload: AddressPayload;
  tokenPayload: AddressPayload;
}

/** The outcome of one metered call (request -> pay -> serve). */
export interface CallOutcome<Req, Res> {
  served: boolean;
  request: Req;
  voucher: Voucher;
  result?: Res;
  reason?: RejectReason | string;
  /** The provider's independently-computed price for this call, in units. */
  cost: bigint;
  cumulativeUnits?: bigint;
  /** cumulativeUnits * rate so far, in micro-USDC. */
  billable?: bigint;
}

/** Everything needed to drive an on-chain settlement after the channel closes. */
export interface SettlementResult {
  inputs: SettlementCircuitInputs;
  proof: SettlementProof;
  serialized: SerializedSettlement;
}

export interface ServiceChannelOptions {
  meterDb?: MeterDb;
  rateCommitment?: bigint;
  openTx?: string;
  serviceName?: string;
}

/** Shared surface for in-process and (future) x402-backed metered clients. */
export interface MeteredServiceChannel<Req, Res> {
  call(req: Req): Promise<CallOutcome<Req, Res>>;
  close(): Promise<SettlementResult>;
}

/**
 * Consumer side of the meter: signs cumulative EdDSA-Poseidon vouchers via
 * `@drongo/proving-setup`. Each voucher supersedes the last, so settlement needs
 * only the final one.
 */
export class ConsumerMeter {
  #cumulative = 0n;

  constructor(
    private readonly privateKey: AddressPayload,
    private readonly channelId: bigint,
  ) {}

  /** Advance the meter by `units` and return the fresh cumulative voucher. */
  async signFor(units: bigint): Promise<Voucher> {
    if (units <= 0n) throw new Error("units must be positive");
    this.#cumulative += units;
    return createVoucher(this.privateKey, this.channelId, this.#cumulative);
  }

  get cumulativeUnits(): bigint {
    return this.#cumulative;
  }
}

interface ReceiveResult {
  accepted: boolean;
  reason?: RejectReason;
  cumulativeUnits?: bigint;
  billable?: bigint;
}

/**
 * Provider side of the meter: verifies each voucher's signature, enforces
 * monotonicity, and halts the moment billable units would exceed the public
 * escrow. Mirrors the on-chain `settlement <= escrow` invariant.
 */
export class ProviderMeter {
  #latest: Voucher | undefined;
  #halted = false;

  constructor(
    private readonly channelId: bigint,
    private readonly consumerPubKey: ConsumerPublicKey,
    private readonly rate: bigint,
    private readonly escrow: bigint,
  ) {}

  async receive(voucher: Voucher): Promise<ReceiveResult> {
    if (this.#halted) return { accepted: false, reason: "ceiling-exceeded" };
    if (voucher.channelId !== this.channelId) return { accepted: false, reason: "wrong-channel" };

    const prev = this.#latest?.totalUnits ?? 0n;
    if (voucher.totalUnits <= prev) return { accepted: false, reason: "non-monotonic" };

    const message = await computeVoucherMessage(this.channelId, voucher.totalUnits);
    const ok = await verifyVoucher(this.consumerPubKey, message, voucher.signature);
    if (!ok) return { accepted: false, reason: "bad-signature" };

    const billable = voucher.totalUnits * this.rate;
    if (billable > this.escrow) {
      this.#halted = true;
      return { accepted: false, reason: "ceiling-exceeded", cumulativeUnits: voucher.totalUnits, billable };
    }

    this.#latest = voucher;
    return { accepted: true, cumulativeUnits: voucher.totalUnits, billable };
  }

  get latestVoucher(): Voucher | undefined {
    return this.#latest;
  }
}

/**
 * Wires a {@link ConsumerMeter} and {@link ProviderMeter} over one channel and a
 * priced {@link Service}, exposing the full request -> pay -> serve round-trip
 * plus the settlement close. The close builds the 13-signal circuit input,
 * generates the Groth16 proof, and serializes it for the Soroban `settle` call.
 */
export class ServiceChannel<Req, Res> implements MeteredServiceChannel<Req, Res> {
  readonly terms: ChannelTerms;
  readonly consumerPublicKey: ConsumerPublicKey;
  readonly #consumer: ConsumerMeter;
  readonly #provider: ProviderMeter;
  readonly #service: Service<Req, Res>;
  readonly #meterDb: MeterDb | undefined;

  private constructor(
    terms: ChannelTerms,
    service: Service<Req, Res>,
    consumer: ConsumerMeter,
    provider: ProviderMeter,
    consumerPublicKey: ConsumerPublicKey,
    meterDb: MeterDb | undefined,
  ) {
    this.terms = terms;
    this.#service = service;
    this.#consumer = consumer;
    this.#provider = provider;
    this.consumerPublicKey = consumerPublicKey;
    this.#meterDb = meterDb;
  }

  /** Derive the consumer key and stand up both meters for the channel. */
  static async open<Req, Res>(
    terms: ChannelTerms,
    service: Service<Req, Res>,
    options: ServiceChannelOptions = {},
  ): Promise<ServiceChannel<Req, Res>> {
    const consumerPublicKey = await deriveConsumerPublicKey(terms.consumerPrivateKey);
    const consumer = new ConsumerMeter(terms.consumerPrivateKey, terms.channelId);
    const provider = new ProviderMeter(terms.channelId, consumerPublicKey, terms.rate, terms.escrow);
    options.meterDb?.saveChannel({
      terms,
      consumerPublicKey,
      rateCommitment: options.rateCommitment,
      lastAcceptedUnits: 0n,
      halted: false,
      openTx: options.openTx,
      serviceName: options.serviceName ?? service.name,
    });
    return new ServiceChannel(terms, service, consumer, provider, consumerPublicKey, options.meterDb);
  }

  /** One full round-trip: consumer pays, provider verifies + serves (or refuses). */
  async call(req: Req): Promise<CallOutcome<Req, Res>> {
    const cost = this.#service.price(req);
    if (cost <= 0n) throw new Error("service price must be positive");

    const voucher = await this.#consumer.signFor(cost);
    const res = await this.#provider.receive(voucher);

    if (!res.accepted) {
      if (res.reason === "ceiling-exceeded") {
        const latest = this.#provider.latestVoucher;
        this.#meterDb?.updateMeter(
          this.terms.channelId,
          latest?.totalUnits ?? 0n,
          latest,
          true,
          "ceiling_reached",
        );
      }
      return {
        served: false,
        request: req,
        voucher,
        reason: res.reason,
        cost,
        cumulativeUnits: res.cumulativeUnits,
        billable: res.billable,
      };
    }

    this.#meterDb?.updateMeter(
      this.terms.channelId,
      res.cumulativeUnits ?? voucher.totalUnits,
      voucher,
      false,
      "voucher_accepted",
    );

    return {
      served: true,
      request: req,
      voucher,
      result: await this.#service.handle(req),
      cost,
      cumulativeUnits: res.cumulativeUnits,
      billable: res.billable,
    };
  }

  /**
   * Close the channel: build the settlement circuit inputs from the final
   * accepted voucher, generate the Groth16 proof, and serialize it for chain.
   */
  async close(): Promise<SettlementResult> {
    const final = this.#provider.latestVoucher;
    if (!final) throw new Error("no accepted vouchers — nothing to settle");

    const inputs = await buildSettlementInputs({
      channelId: this.terms.channelId,
      channelSecret: this.terms.channelSecret,
      rate: this.terms.rate,
      rateBlind: this.terms.rateBlind,
      totalUnits: final.totalUnits,
      escrowAmount: this.terms.escrow,
      depositorPayload: this.terms.depositorPayload,
      providerPayload: this.terms.providerPayload,
      tokenPayload: this.terms.tokenPayload,
      voucher: { consumerPublicKey: final.consumerPublicKey, signature: final.signature },
    });

    const proof = await generateSettlementProof(inputs);
    const serialized = serializeSettlement(proof);
    return { inputs, proof, serialized };
  }
}
