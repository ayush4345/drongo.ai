import { z } from "zod";

const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4021),
  X402_FACILITATOR_URL: z.string().url().default("http://localhost:4023"),
  X402_NETWORK: z.literal("stellar:testnet").default("stellar:testnet"),
  X402_PAY_TO: z.string().min(1).default("mock_provider"),
  MOCK_X402: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  SLATE_ESCROW_AMOUNT: z.string().default("20"),
  SLATE_UNIT_PRICE: z.string().default("0.002"),
  SLATE_CHAIN_MODE: z.enum(["mock", "stellar-testnet"]).default("mock"),
});

export type ProviderConfig = z.infer<typeof EnvSchema>;

export function readProviderConfig(
  env: NodeJS.ProcessEnv = process.env,
): ProviderConfig {
  return EnvSchema.parse(env);
}
