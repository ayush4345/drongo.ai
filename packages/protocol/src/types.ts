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

/**
 * DEV / PREVIEW ONLY — this is the mock pipeline's witness preview and does NOT
 * match the production Groth16 circuit. The canonical ZK witness (snake_case
 * signals: channel_id, rate_commitment, escrow_amount, settlement_amount,
 * nullifier, consumer_pubkey_x/y and the private rate, rate_blind, total_units,
 * channel_secret, sig_R8x/R8y/S) is produced by `@drongo/agent`'s
 * `buildSettlementWitness` / `toCircuitInput`. Use that for real proving; the
 * remote x402 path already does (see X402ServiceChannel.close()).
 */
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

/**
 * x402 PaymentRequirements for the `exact` scheme, used to gate opening a
 * metered channel. Mirrors the x402 spec: `maxAmountRequired` and any amounts
 * are in the asset's atomic units (micro-USDC), the token contract is `asset`,
 * and the recipient is `payTo`. Drongo-specific, human-readable hints (the
 * offered unit price + escrow, disclosed off-chain to the counterparty only)
 * live in `extra` — they are NOT a rate commitment and never go on-chain.
 */
export const PaymentRequirementsSchema = z.object({
  scheme: z.literal("exact"),
  network: z.literal("stellar:testnet"),
  /** Maximum amount the consumer authorizes, in micro-USDC (the escrow). */
  maxAmountRequired: integerString,
  resource: nonEmptyString,
  description: z.string().default(""),
  mimeType: z.string().default("application/json"),
  payTo: nonEmptyString,
  /** USDC SEP-41 token contract id the payment must be denominated in. */
  asset: nonEmptyString,
  maxTimeoutSeconds: z.number().int().positive().default(120),
  extra: z
    .object({
      escrowAmount: decimalString,
      unitPrice: decimalString,
    })
    .optional(),
});

export type PaymentRequirements = z.infer<typeof PaymentRequirementsSchema>;

/** Backward-compatible alias (the agent card Picks `network`/`scheme`). */
export type X402PaymentTerms = PaymentRequirements;

/** The HTTP 402 body: x402 version + the accepted payment requirements. */
export const PaymentRequiredResponseSchema = z.object({
  x402Version: z.literal(1),
  accepts: z.array(PaymentRequirementsSchema).min(1),
  error: z.string().default("payment required"),
});

export type PaymentRequiredResponse = z.infer<typeof PaymentRequiredResponseSchema>;
