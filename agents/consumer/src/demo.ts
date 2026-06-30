import { randomBytes } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { computeRateCommitment } from "@drongo/proving-setup";
import {
  ServiceChannel,
  MockChainClient,
  realChainFromEnv,
  parseUnits,
  formatUnits,
  stellarExplorerContractUrl,
  stellarExplorerTxUrl,
} from "@drongo/agent-core";
import type { ChainClient, ChannelTerms } from "@drongo/agent-core";
import { WeatherService, FetchHttpClient } from "@drongo/agent-provider";
import { StubLlmClient } from "./llm.js";
import { OpenAiLlmClient } from "./openai-client.js";
import { WeatherConsumerAgent } from "./consumer.js";

// Load the monorepo-root .env (…/drongo.ai/.env) regardless of the directory the
// demo is run from. A missing file is fine — the demo then runs in offline mock
// mode. .env is gitignored, so secrets like DEPOSITOR_SECRET stay out of git.
const envPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env");
const envLoad = loadEnv({ path: envPath });
if (envLoad.error) {
  console.log(`env: no .env found at ${envPath} (${envLoad.error.message})`);
} else {
  const keys = Object.keys(envLoad.parsed ?? {});
  const hasSecret = keys.includes("DEPOSITOR_SECRET");
  console.log(
    `env: loaded ${keys.length} var(s) from ${envPath}` +
      (hasSecret ? "" : " — DEPOSITOR_SECRET NOT among them (check for an `export` prefix or typo)"),
  );
}

/** A random BN254 field element (31 random bytes stays below the prime). */
function randField(): bigint {
  return BigInt("0x" + randomBytes(31).toString("hex"));
}

function logTx(label: string, hash: string, networkPassphrase?: string): void {
  console.log(`  ${label.padEnd(22)} ${hash}`);
  if (!networkPassphrase) return;
  const url = stellarExplorerTxUrl(hash, networkPassphrase);
  if (url) console.log(`  ${"".padEnd(22)} ${url}`);
}

function logExplorerLink(label: string, url: string | undefined): void {
  if (!url) return;
  console.log(`  ${label.padEnd(22)} ${url}`);
}

async function main(): Promise<void> {
  const goal = process.argv.slice(2).join(" ") || "Which is warmest right now: Tokyo, London, or Cairo?";

  // Amounts are in the settlement token's base units (Stellar = 7 decimals,
  // stroops). Default settlement asset is native XLM (see realChainFromEnv).
  const symbol = process.env.SETTLEMENT_TOKEN_SYMBOL ?? "XLM";
  const rate = parseUnits(process.env.RATE ?? "0.0001"); // PRIVATE per-call rate
  const escrow = parseUnits(process.env.ESCROW ?? "0.01"); // public escrow ceiling

  // Real Stellar settlement when DEPOSITOR_SECRET + contract IDs are configured;
  // otherwise an in-memory mock so the demo always runs offline.
  const real = realChainFromEnv();
  if (!real) {
    console.log("note: MOCK mode — DEPOSITOR_SECRET is not set in the environment.");
  }
  const chain: ChainClient = real?.chain ?? new MockChainClient();
  const mode = real ? "REAL Soroban (Stellar testnet)" : "mock (offline)";

  // The same 32-byte payloads must be bound into the proof AND used on-chain, so
  // the contract's address checks in settle() match the proof's public signals.
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

  const channel = await ServiceChannel.open(terms, new WeatherService(new FetchHttpClient(), 1n));

  // ── OPEN ──────────────────────────────────────────────────────────────
  const rateCommitment = await computeRateCommitment(rate, terms.rateBlind);
  console.log("═══ OPEN CHANNEL ═══");
  console.log(`  settlement chain:  ${mode}`);
  if (real) {
    console.log(`  settlement token:  ${symbol}  (${real.tokenId})`);
    console.log(`  addresses:         ${real.label}`);
    logExplorerLink("escrow contract", stellarExplorerContractUrl(real.contracts.escrow, real.networkPassphrase));
    logExplorerLink("registry contract", stellarExplorerContractUrl(real.contracts.registry, real.networkPassphrase));
  }
  console.log(`  rate (PRIVATE):    ${formatUnits(rate)} ${symbol} / call`);
  console.log(`  escrow (public):   ${formatUnits(escrow)} ${symbol}`);
  console.log(`  rate commitment:   ${rateCommitment.toString().slice(0, 16)}…  (Poseidon(rate, blind))`);

  const opened = await chain.openChannel({
    channelId: terms.channelId,
    rateCommitment,
    consumerPublicKey: channel.consumerPublicKey,
    depositor: depositorPayload,
    provider: providerPayload,
    token: tokenPayload,
    escrow,
  });
  logTx("register_channel tx", opened.txs.registerTx, real?.networkPassphrase);
  logTx("add_to_depositors tx", opened.txs.depositTx, real?.networkPassphrase);

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
  console.log(`\n═══ SETTLE — one on-chain settlement (${mode}) ═══`);
  const served = lookups.filter((l) => l.served).length;
  console.log("  generating Groth16 proof (CPU-heavy, ~30–90s)…");
  const settlement = await channel.close(); // generates the real Groth16 proof
  console.log("  proof ready, submitting on-chain…");
  const settled = await chain.settle({
    settlement: settlement.serialized,
    depositor: depositorPayload,
    provider: providerPayload,
    token: tokenPayload,
  });

  const settledUnits = settlement.serialized.publicSignals[3] ?? 0n;
  console.log(`  calls served (PRIVATE):  ${served}`);
  console.log(`  settled to provider:     ${formatUnits(settledUnits)} ${symbol}`);
  console.log(`  refunded to consumer:    ${formatUnits(escrow - settledUnits)} ${symbol}`);
  console.log(`  proof bytes:             a=${settlement.serialized.proof.a.length} b=${settlement.serialized.proof.b.length} c=${settlement.serialized.proof.c.length}`);
  console.log(`  public signals:          ${settlement.serialized.publicSignals.length} (13-signal layout)`);
  logTx("settle tx", settled.settleTx, real?.networkPassphrase);

  if (real) {
    console.log("\n═══ EXPLORER ═══");
    logExplorerLink("register_channel", stellarExplorerTxUrl(opened.txs.registerTx, real.networkPassphrase));
    logExplorerLink("add_to_depositors", stellarExplorerTxUrl(opened.txs.depositTx, real.networkPassphrase));
    logExplorerLink("settle", stellarExplorerTxUrl(settled.settleTx, real.networkPassphrase));
    logExplorerLink("escrow contract", stellarExplorerContractUrl(real.contracts.escrow, real.networkPassphrase));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
