import { createHash } from "node:crypto";

import { refundForUnits, settlementForUnits } from "./pricing.js";
import {
  type Channel,
  ChannelSchema,
  type Voucher,
  VoucherSchema,
  type WitnessBundle,
  WitnessBundleSchema,
} from "./types.js";

export type BuildWitnessBundleInput = {
  channel: Channel;
  finalVoucher: Voucher;
  consumerSecret?: string;
};

export function buildWitnessBundle({
  channel,
  finalVoucher,
  consumerSecret,
}: BuildWitnessBundleInput): WitnessBundle {
  const parsedChannel = ChannelSchema.parse(channel);
  const parsedVoucher = VoucherSchema.parse(finalVoucher);

  if (parsedVoucher.channelId !== parsedChannel.channelId) {
    throw new Error("final voucher channel does not match channel");
  }

  const settlementAmount = settlementForUnits(
    parsedChannel.unitPrice,
    parsedVoucher.cumulativeUnits,
  );
  const refundAmount = refundForUnits(
    parsedChannel.escrowAmount,
    parsedChannel.unitPrice,
    parsedVoucher.cumulativeUnits,
  );

  return WitnessBundleSchema.parse({
    scenario: {
      channelId: parsedChannel.channelId,
      escrowAmount: parsedChannel.escrowAmount,
      unitPrice: parsedChannel.unitPrice,
      finalUnits: parsedVoucher.cumulativeUnits,
      settlementAmount,
      refundAmount,
    },
    channel: parsedChannel,
    finalVoucher: parsedVoucher,
    publicInputs: {
      channel_id: parsedChannel.channelId,
      rate_commitment: parsedChannel.rateCommitment,
      escrow_amount: parsedChannel.escrowAmount,
      settlement_amount: settlementAmount,
      nullifier: nullifierFor(parsedChannel.channelId, parsedVoucher.nonce),
    },
    privateInputs: {
      unit_price: parsedChannel.unitPrice,
      cumulative_units: parsedVoucher.cumulativeUnits,
      voucher_signature: parsedVoucher.signature,
      consumer_secret: consumerSecret,
    },
  });
}

function nullifierFor(channelId: string, nonce: string): string {
  return createHash("sha256")
    .update(`slate:nullifier:v1:${channelId}:${nonce}`)
    .digest("hex");
}
