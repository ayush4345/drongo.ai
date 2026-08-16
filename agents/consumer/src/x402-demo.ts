import { randomBytes } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { computeRateCommitment, deriveConsumerPublicKey } from "@drongo/proving-setup";
import {
  X402ServiceChannel,
  MockChainClient,
  realChainFromEnv,
  settlementBackendFromEnv,
  parseUnits,
  formatUnits,
} from "@drongo/agent-core";
import type { ChainClient, ChannelTerms, ToolCall, ToolResult } from "@drongo/agent-core";
import { TOOL_SPECS } from "@drongo/agent-provider";
import { ServiceAgent } from "./agent.js";
import { StubAgentBrain } from "./stub-agent.js";
import { OpenAiAgentBrain } from "./openai-agent.js";

// This is the SAME demo as demo.ts, but the provider is REMOTE: the consumer
// reaches it over HTTP using x402 (402 → X-PAYMENT → open) instead of calling an
// in-process toolbox. Start the provider first:
//   pnpm --filter @drongo/agent-provider serve
// then run:  pnpm --filter @drongo/agent-consumer demo:x402

const envPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env");
const envLoad = loadEnv({ path: envPath });
if (envLoad.error) {
  console.log(`env: no .env found at ${envPath} (${envLoad.error.message})`);
} else {
  const keys = Object.keys(envLoad.parsed ?? {});
  const hasEvm = keys.includes("EVM_PRIVATE_KEY");
  console.log(
    `env: loaded ${keys.length} var(s) from ${envPath}` +
      (hasEvm ? " — Base (EVM_PRIVATE_KEY)" : " — no EVM_PRIVATE_KEY (mock mode)"),
  );
}

/** A random BN254 field element (31 random bytes stays below the prime). */
function randField(): bigint {
  return BigInt("0x" + randomBytes(31).toString("hex"));
}

async function main(): Promise<void> {
  const providerUrl = process.env.PROVIDER_URL ?? "http://localhost:4021";
  const goal =
    process.argv.slice(2).join(" ") ||
    "What's the weather in Tokyo, the price of ETH in USD, and translate 'good morning' into Japanese?";

  const backend = settlementBackendFromEnv();
  const symbol = process.env.SETTLEMENT_TOKEN_SYMBOL ?? "USDC";
  const rate = parseUnits(process.env.RATE ?? "0.0001");
  const escrow = parseUnits(process.env.ESCROW ?? "0.01");

  const real = realChainFromEnv();
  if (!real) {
    console.log("note: MOCK mode — set EVM_PRIVATE_KEY for on-chain Base settlement.");
  }
  const chain: ChainClient = real?.chain ?? new MockChainClient();
  const mode = backend === "base" ? "REAL Base (EVM)" : "mock (offline)";

  const depositorPayload = real?.depositorPayload ?? randomBytes(32);
  const providerPayload = real?.providerPayload ?? randomBytes(32);
  const tokenPayload = real?.tokenPayload ?? randomBytes(32);

  const terms: ChannelTerms = {
    channelId: randField(),
    rate,
    rateBlind: randField(),
    escrow,
    channelSecret: randField(),
    consumerPrivateKey: randomBytes(32),
    depositorPayload,
    providerPayload,
    tokenPayload,
  };

  const rateCommitment = await computeRateCommitment(rate, terms.rateBlind);
  const consumerPublicKey = await deriveConsumerPublicKey(terms.consumerPrivateKey);

  // ── OPEN (escrow on-chain) ────────────────────────────────────────────
  console.log("═══ OPEN CHANNEL ═══");
  console.log(`  provider (x402):   ${providerUrl}`);
  console.log(`  settlement chain:  ${mode}`);
  if (real) {
    console.log(`  settlement token:  ${symbol}  (${real.tokenId})`);
    console.log(`  addresses:         ${real.label}`);
  }
  console.log(`  rate (PRIVATE):    ${formatUnits(rate)} ${symbol} / call`);
  console.log(`  escrow (public):   ${formatUnits(escrow)} ${symbol}`);
  console.log(`  rate commitment:   ${rateCommitment.toString().slice(0, 16)}…  (Poseidon(rate, blind))`);

  const opened = await chain.openChannel({
    channelId: terms.channelId,
    rateCommitment,
    consumerPublicKey,
    depositor: depositorPayload,
    provider: providerPayload,
    token: tokenPayload,
    escrow,
  });
  console.log(`  open tx:           ${opened.openTx}`);

  // ── x402 OPEN (HTTP: 402 → X-PAYMENT → open) ──────────────────────────
  const channel = await X402ServiceChannel.open<ToolCall, ToolResult>({
    providerUrl,
    terms,
    paymentSignature: process.env.X402_PAYMENT_SIGNATURE,
  });
  console.log(`  x402 open:         paid + metered channel established with remote provider`);

  // ── METER (off-chain, over HTTP) — the agent chooses which tools to use ─
  const useOpenAi = Boolean(process.env.OPENAI_API_KEY);
  const brain = useOpenAi ? new OpenAiAgentBrain() : new StubAgentBrain();
  console.log(`\n═══ METER (over x402) — ${useOpenAi ? "OpenAI" : "stub"} tool-using agent ═══`);
  console.log(`  goal: ${goal}`);

  const { answer, calls } = await new ServiceAgent(channel, brain, TOOL_SPECS).run(goal);
  for (const c of calls) {
    const detail = c.served ? JSON.stringify(c.result) : (c.reason ?? "refused");
    console.log(
      `  ${c.served ? "paid+served" : "skipped   "}  ${c.tool.padEnd(16)} ${JSON.stringify(c.args)} → ${detail}`,
    );
  }
  console.log(`  answer: ${answer}`);

  // ── SETTLE (one ZK proof, built locally from the final voucher) ───────
  console.log(`\n═══ SETTLE — one on-chain settlement (${mode}) ═══`);
  const served = calls.filter((c) => c.served).length;
  const settlement = await channel.close();
  const settled = await chain.settle({
    settlement: settlement.serialized,
    depositor: depositorPayload,
    provider: providerPayload,
    token: tokenPayload,
  });

  const settledUnits = settlement.serialized.publicSignals[3] ?? 0n;
  console.log(
    `  paid calls (PRIVATE):    ${served}  across ${new Set(calls.filter((c) => c.served).map((c) => c.tool)).size} service(s)`,
  );
  console.log(`  settled to provider:     ${formatUnits(settledUnits)} ${symbol}`);
  console.log(`  refunded to consumer:    ${formatUnits(escrow - settledUnits)} ${symbol}`);
  console.log(
    `  proof bytes:             a=${settlement.serialized.proof.a.length} b=${settlement.serialized.proof.b.length} c=${settlement.serialized.proof.c.length}`,
  );
  console.log(`  public signals:          ${settlement.serialized.publicSignals.length} (13-signal layout)`);
  console.log(`  settle tx:               ${settled.settleTx}`);
  if (backend === "base") {
    const chainId = process.env.BASE_CHAIN_ID ?? "84532";
    console.log(`\n  view on explorer: https://sepolia.basescan.org/tx/${settled.settleTx} (chain ${chainId})`);
  }
}

main().catch((error) => {
  const msg = error instanceof Error ? error.message : String(error);
  if (/fetch failed|ECONNREFUSED|failed to fetch|x402 open failed/i.test(msg)) {
    console.error(`\n✗ Could not reach the provider at ${process.env.PROVIDER_URL ?? "http://localhost:4021"}.`);
    console.error(`  Start it first:  pnpm --filter @drongo/agent-provider serve`);
  }
  console.error(error);
  process.exitCode = 1;
});
