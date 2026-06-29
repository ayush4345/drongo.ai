import {
  type Channel,
  ChannelSchema,
  maxUnitsForEscrow,
  rateCommitment,
  type Voucher,
  VoucherSchema,
  verifyDeterministicVoucher,
} from "@slate/protocol";

import { type ChainAdapter, MockChainAdapter } from "./chain.js";
import type { MeterDb } from "./meter-db.js";

export type OpenChannelInput = {
  consumer: string;
  provider: string;
  escrowAmount: string;
  unitPrice: string;
  chain: Channel["chain"];
  openTx?: string;
  channelId?: string;
};

export type AcceptedVoucher = {
  ok: true;
  channelId: string;
  acceptedUnits: string;
  remainingUnits: string;
  result: string;
};

export type RejectedVoucher = {
  ok: false;
  reason:
    | "unknown-channel"
    | "channel-mismatch"
    | "bad-signature"
    | "over-escrow-ceiling"
    | "stale-voucher";
};

type ChannelState = {
  channel: Channel;
  lastAcceptedUnits: bigint;
  finalVoucher?: Voucher;
};

export class ChannelStore {
  readonly #channels = new Map<string, ChannelState>();
  #nextChannelNumber = 1;
  readonly chainAdapter: ChainAdapter;

  constructor(chainAdapter?: ChainAdapter, private readonly meterDb?: MeterDb) {
    this.chainAdapter = chainAdapter ?? new MockChainAdapter();
    if (meterDb !== undefined) {
      for (const snapshot of meterDb.loadDevChannels()) {
        this.#channels.set(snapshot.channel.channelId, {
          channel: snapshot.channel,
          lastAcceptedUnits: BigInt(snapshot.lastAcceptedUnits),
          finalVoucher: snapshot.finalVoucher,
        });
      }
    }
  }

  async openChannel(input: OpenChannelInput): Promise<Channel> {
    const commitment = rateCommitment(input.escrowAmount, input.unitPrice);
    const chainOpen =
      input.channelId === undefined && input.openTx === undefined
        ? await this.chainAdapter.openChannel({
            consumer: input.consumer,
            provider: input.provider,
            escrowAmount: input.escrowAmount,
            unitPrice: input.unitPrice,
            rateCommitment: commitment,
          })
        : undefined;
    const channelId = input.channelId ?? chainOpen?.channelId ?? this.#allocateChannelId();
    const channel = ChannelSchema.parse({
      channelId,
      consumer: input.consumer,
      provider: input.provider,
      escrowAmount: input.escrowAmount,
      unitPrice: input.unitPrice,
      rateCommitment: commitment,
      maxUnits: maxUnitsForEscrow(input.escrowAmount, input.unitPrice),
      openedAt: new Date(0).toISOString(),
      chain: input.chain,
      openTx: input.openTx ?? chainOpen?.openTx,
    });

    this.#channels.set(channel.channelId, {
      channel,
      lastAcceptedUnits: 0n,
    });

    this.meterDb?.saveDevChannel({
      channel,
      lastAcceptedUnits: "0",
    });

    return channel;
  }

  async acceptVoucher(
    channelId: string,
    voucher: Voucher,
  ): Promise<AcceptedVoucher | RejectedVoucher> {
    const state = this.#channels.get(channelId);

    if (state === undefined) {
      return { ok: false, reason: "unknown-channel" };
    }

    const parsedVoucher = VoucherSchema.safeParse(voucher);

    if (!parsedVoucher.success || parsedVoucher.data.channelId !== channelId) {
      return { ok: false, reason: "channel-mismatch" };
    }

    if (!verifyDeterministicVoucher(parsedVoucher.data)) {
      return { ok: false, reason: "bad-signature" };
    }

    const cumulativeUnits = BigInt(parsedVoucher.data.cumulativeUnits);
    const maxUnits = BigInt(state.channel.maxUnits);

    if (cumulativeUnits > maxUnits) {
      return { ok: false, reason: "over-escrow-ceiling" };
    }

    if (cumulativeUnits <= state.lastAcceptedUnits) {
      return { ok: false, reason: "stale-voucher" };
    }

    state.lastAcceptedUnits = cumulativeUnits;
    state.finalVoucher = parsedVoucher.data;

    this.meterDb?.updateDevVoucher(
      channelId,
      parsedVoucher.data.cumulativeUnits,
      parsedVoucher.data,
    );

    return {
      ok: true,
      channelId,
      acceptedUnits: parsedVoucher.data.cumulativeUnits,
      remainingUnits: (maxUnits - cumulativeUnits).toString(),
      result: "provider response",
    };
  }

  getChannel(channelId: string): Channel | undefined {
    return this.#channels.get(channelId)?.channel;
  }

  getFinalVoucher(channelId: string): Voucher | undefined {
    return this.#channels.get(channelId)?.finalVoucher;
  }

  #allocateChannelId(): string {
    if (this.#nextChannelNumber === 1) {
      this.#nextChannelNumber += 1;
      return "ch_demo";
    }

    const channelId = `ch_${this.#nextChannelNumber}`;
    this.#nextChannelNumber += 1;
    return channelId;
  }
}
