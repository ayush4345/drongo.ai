import { z } from "zod";

const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4021),
  X402_FACILITATOR_URL: z.string().url().default("http://localhost:4023"),
  X402_NETWORK: z.literal("stellar:testnet").default("stellar:testnet"),
  X402_PAY_TO: z.string().min(1).default("mock_provider"),
  // USDC SEP-41 token contract the consumer must pay in. Default = Stellar
  // testnet USDC; surfaced as `asset` in the x402 PaymentRequirements.
  X402_ASSET: z
    .string()
    .min(1)
    .default("CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA"),
  MOCK_X402: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  SLATE_ESCROW_AMOUNT: z.string().default("20"),
  SLATE_UNIT_PRICE: z.string().default("0.002"),
  SLATE_CHAIN_MODE: z.enum(["mock", "stellar-testnet"]).default("mock"),
  METER_DB_PATH: z.string().default("artifacts/metering.db"),
});

export type ProviderConfig = z.infer<typeof EnvSchema>;

export function readProviderConfig(
  env: NodeJS.ProcessEnv = process.env,
): ProviderConfig {
  return EnvSchema.parse(env);
}
