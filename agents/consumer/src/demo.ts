import { randomBytes } from "node:crypto";
import { computeRateCommitment } from "@drongo/proving-setup";
import { ServiceChannel, MockChainClient, parseUsdToMicros, formatMicros } from "@drongo/agent-core";
import type { ChannelTerms } from "@drongo/agent-core";
import { WeatherService, FetchHttpClient } from "@drongo/agent-provider";
import { StubLlmClient } from "./llm.js";
import { OpenAiLlmClient } from "./openai-client.js";
import { WeatherConsumerAgent } from "./consumer.js";

/** A random BN254 field element (31 random bytes stays below the prime). */
function randField(): bigint {
  return BigInt("0x" + randomBytes(31).toString("hex"));
}

async function main(): Promise<void> {
  const goal = process.argv.slice(2).join(" ") || "Which is warmest right now: Tokyo, London, or Cairo?";

  const rate = parseUsdToMicros("0.002"); // PRIVATE per-call rate
  const escrow = parseUsdToMicros("20"); // public escrow ceiling

  const terms: ChannelTerms = {
    channelId: randField(),
    rate,
    rateBlind: randField(),
    escrow,
    channelSecret: randField(),
    consumerPrivateKey: randomBytes(32),
    depositorPayload: randomBytes(32),
    providerPayload: randomBytes(32),
    tokenPayload: randomBytes(32),
  };

  const chain = new MockChainClient();
  const channel = await ServiceChannel.open(terms, new WeatherService(new FetchHttpClient(), 1n));

  // ── OPEN ──────────────────────────────────────────────────────────────
  const rateCommitment = await computeRateCommitment(rate, terms.rateBlind);
  const opened = await chain.openChannel({
    channelId: terms.channelId,
    rateCommitment,
    consumerPublicKey: channel.consumerPublicKey,
    depositor: terms.depositorPayload,
    provider: terms.providerPayload,
    token: terms.tokenPayload,
    escrow,
  });

  console.log("═══ OPEN CHANNEL ═══");
  console.log(`  channel:           ${opened.channelId.slice(0, 12)}…`);
  console.log(`  rate (PRIVATE):    ${formatMicros(rate)} USDC / call`);
  console.log(`  escrow (public):   ${formatMicros(escrow)} USDC`);
  console.log(`  rate commitment:   ${rateCommitment.toString().slice(0, 16)}…  (Poseidon(rate, blind))`);
  console.log(`  open tx:           ${opened.openTx}`);

  // ── METER (off-chain, per call) ───────────────────────────────────────
  const useOpenAi = Boolean(process.env.OPENAI_API_KEY);
  const llm = useOpenAi ? new OpenAiLlmClient() : new StubLlmClient();
  console.log(`\n═══ METER (off-chain) — ${useOpenAi ? "OpenAI" : "stub"} consumer ═══`);
  console.log(`  goal: ${goal}`);

  const { answer, lookups } = await new WeatherConsumerAgent(channel, llm).run(goal);
  for (const l of lookups) {
    const detail = l.served && l.result ? `${l.result.temperatureC}°C, ${l.result.summary}` : (l.reason ?? "refused");
    console.log(`  ${l.served ? "paid+served" : "skipped   "}  ${l.location.padEnd(14)} ${detail}`);
  }
  console.log(`  answer: ${answer}`);

  // ── SETTLE (one ZK proof) ─────────────────────────────────────────────
  console.log(`\n═══ SETTLE — one on-chain settlement ═══`);
  const served = lookups.filter((l) => l.served).length;
  const settlement = await channel.close(); // generates the real Groth16 proof
  const settled = await chain.settle({
    settlement: settlement.serialized,
    depositor: terms.depositorPayload,
    provider: terms.providerPayload,
    token: terms.tokenPayload,
  });

  const settlementMicros = settlement.serialized.publicSignals[3] ?? 0n;
  console.log(`  calls served (PRIVATE):  ${served}`);
  console.log(`  settled to provider:     ${formatMicros(settlementMicros)} USDC`);
  console.log(`  refunded to consumer:    ${formatMicros(escrow - settlementMicros)} USDC`);
  console.log(`  proof bytes:             a=${settlement.serialized.proof.a.length} b=${settlement.serialized.proof.b.length} c=${settlement.serialized.proof.c.length}`);
  console.log(`  public signals:          ${settlement.serialized.publicSignals.length} (13-signal layout)`);
  console.log(`  settle tx:               ${settled.settleTx}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
