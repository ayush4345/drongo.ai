import { z } from "zod";

const decimalString = z
  .string()
  .regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$/, "must be a non-negative decimal");

const integerString = z
  .string()
  .regex(/^(?:0|[1-9]\d*)$/, "must be a non-negative integer");

const nonEmptyString = z.string().min(1);

export const VoucherSchema = z.object({
  channelId: nonEmptyString,
  cumulativeUnits: integerString,
  nonce: nonEmptyString,
  consumerPubKey: nonEmptyString,
  signature: nonEmptyString,
});

export type Voucher = z.infer<typeof VoucherSchema>;

export const ChannelSchema = z.object({
  channelId: nonEmptyString,
  consumer: nonEmptyString,
  provider: nonEmptyString,
  escrowAmount: decimalString,
  unitPrice: decimalString,
  rateCommitment: nonEmptyString,
  maxUnits: integerString,
  openedAt: nonEmptyString,
  chain: z.enum(["mock", "stellar-testnet"]),
  openTx: nonEmptyString.optional(),
});

export type Channel = z.infer<typeof ChannelSchema>;

export const WitnessBundleSchema = z.object({
  scenario: z.object({
    channelId: nonEmptyString,
    escrowAmount: decimalString,
    unitPrice: decimalString,
    finalUnits: integerString,
    settlementAmount: decimalString,
    refundAmount: decimalString,
  }),
  channel: ChannelSchema,
  finalVoucher: VoucherSchema,
  publicInputs: z.object({
    channel_id: nonEmptyString,
    rate_commitment: nonEmptyString,
    escrow_amount: decimalString,
    settlement_amount: decimalString,
    nullifier: nonEmptyString,
  }),
  privateInputs: z.object({
    unit_price: decimalString,
    cumulative_units: integerString,
    voucher_signature: nonEmptyString,
    consumer_secret: nonEmptyString.optional(),
  }),
});

export type WitnessBundle = z.infer<typeof WitnessBundleSchema>;

export const X402PaymentTermsSchema = z.object({
  scheme: z.literal("exact"),
  network: z.literal("stellar:testnet"),
  payTo: nonEmptyString,
  resource: nonEmptyString,
  escrowAmount: decimalString,
  unitPrice: decimalString,
  rateCommitment: nonEmptyString,
});

export type X402PaymentTerms = z.infer<typeof X402PaymentTermsSchema>;
