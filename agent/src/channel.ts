import type { ShadowCrypto } from "./crypto.js";
import { ConsumerAgent } from "./consumer.js";
import { ProviderAgent, type ServeResult } from "./provider.js";
import type { ConsumerIdentity } from "./keys.js";
import type { BabyJubPublicKey, ChannelTerms, SettlementWitness, Voucher } from "./types.js";

export interface OpenChannelOpts {
  channelId: bigint;
  /** Private per-unit rate, atomic asset units. */
  rate: bigint;
  /** Public escrow ceiling, atomic asset units. */
  escrow: bigint;
  /** Private blinding factor for the rate commitment. */
  rateBlind: bigint;
  /** Private per-channel secret for the nullifier. */
  channelSecret: bigint;
  identity: ConsumerIdentity;
}

export interface MeterStep {
  voucher: Voucher;
  result: ServeResult;
}

/**
 * MeteredChannel ties a {@link ConsumerAgent} and {@link ProviderAgent} together and
 * models the open → meter → settle lifecycle described in the ShadowMeter spec.
 *
 * The on-chain Soroban contract only ever sees: the escrow (at open), the rate
 * commitment (at open), and the settlement witness (at close). Everything in between
 * is off-chain, instant, and private.
 */
export class MeteredChannel {
  readonly consumer: ConsumerAgent;
  readonly provider: ProviderAgent;
  readonly terms: ChannelTerms;
  private readonly consumerPub: BabyJubPublicKey;

  constructor(private readonly crypto: ShadowCrypto, opts: OpenChannelOpts) {
    this.terms = {
      channelId: opts.channelId,
      rate: opts.rate,
      rateBlind: opts.rateBlind,
      escrow: opts.escrow,
      channelSecret: opts.channelSecret,
    };
    this.consumerPub = opts.identity.publicKey;
    this.consumer = new ConsumerAgent(crypto, opts.identity, opts.channelId);
    this.provider = new ProviderAgent(crypto, opts.channelId, this.consumerPub, opts.rate, opts.escrow);
  }

  /** Poseidon(rate, rateBlind) — the public commitment posted on-chain at channel open. */
  rateCommitment(): bigint {
    return this.crypto.poseidon([this.terms.rate, this.terms.rateBlind]);
  }

  /** Poseidon(channelId, channelSecret) — the per-channel settlement nullifier. */
  nullifier(): bigint {
    return this.crypto.poseidon([this.terms.channelId, this.terms.channelSecret]);
  }

  /** Consumer consumes `units`; the provider validates and gatekeeps against escrow. */
  meter(units: bigint): MeterStep {
    const voucher = this.consumer.signFor(units);
    return { voucher, result: this.provider.receive(voucher) };
  }

  /**
   * Close the channel and build the settlement witness from the final accepted voucher.
   * This object is the hand-off to the ZK team — feed it to the prover as input.json.
   */
  close(): SettlementWitness {
    const finalVoucher = this.provider.latestVoucher;
    if (!finalVoucher) throw new Error("no accepted vouchers — nothing to settle");

    const totalUnits = finalVoucher.cumulativeUnits;
    const settlementAmount = totalUnits * this.terms.rate;
    if (settlementAmount > this.terms.escrow) {
      throw new Error("settlement exceeds escrow — invariant violated");
    }

    const s = (x: bigint) => x.toString();
    return {
      channelId: s(this.terms.channelId),
      rateCommitment: s(this.rateCommitment()),
      escrow: s(this.terms.escrow),
      settlementAmount: s(settlementAmount),
      nullifier: s(this.nullifier()),
      consumerPubKey: { Ax: s(this.consumerPub.Ax), Ay: s(this.consumerPub.Ay) },
      rate: s(this.terms.rate),
      rateBlind: s(this.terms.rateBlind),
      totalUnits: s(totalUnits),
      channelSecret: s(this.terms.channelSecret),
      signature: {
        R8x: s(finalVoucher.signature.R8x),
        R8y: s(finalVoucher.signature.R8y),
        S: s(finalVoucher.signature.S),
      },
    };
  }
}
