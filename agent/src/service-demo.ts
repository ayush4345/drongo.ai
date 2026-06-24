/**
 * Drongo AI service-loop demo — two agents, request → serve → pay.
 *
 * Run with:  npm run demo:service
 *
 * The consumer calls the provider's metered service; the provider serves a result only
 * against a valid in-escrow payment voucher. Thousands of calls meter off-chain; one ZK
 * settlement closes the channel.
 */
import { DrongoCrypto } from "./crypto.js";
import { createIdentity, randomFieldValue } from "./keys.js";
import { ServiceChannel } from "./service-channel.js";
import { MockInferenceService, type InferenceRequest, type InferenceResult } from "./service.js";

const USDC = 1_000_000n;
const usd = (atomic: bigint) => `${(Number(atomic) / 1e6).toFixed(6)} USDC`;

async function main(): Promise<void> {
  const crypto = await DrongoCrypto.build();
  const service = new MockInferenceService(1n); // 1 unit / call

  const channel = new ServiceChannel<InferenceRequest, InferenceResult>(
    crypto,
    {
      channelId: randomFieldValue(),
      rate: 2_000n, //          0.002 USDC / unit (PRIVATE)
      escrow: 20n * USDC, //    20 USDC ceiling (public)
      rateBlind: randomFieldValue(),
      channelSecret: randomFieldValue(),
      identity: createIdentity(crypto),
    },
    service,
  );

  console.log("═══ OPEN — provider sells:", service.name, "@", usd(2_000n), "/ call ═══\n");

  // A few visible calls: request → serve → pay.
  const prompts = ["hello agent", "translate this", "summarize the doc", "what is zk?"];
  for (const prompt of prompts) {
    const out = await channel.call({ prompt });
    if (out.served) {
      console.log(`▸ call "${prompt}"`);
      console.log(`    served  → "${out.result!.completion}"`);
      console.log(`    paid    → cost ${out.cost} unit · running bill ${usd(out.billable!)}\n`);
    } else {
      console.log(`▸ call "${prompt}" → REFUSED (${out.reason})\n`);
    }
  }

  // Burst the rest off-chain to reach the canonical 7,431 calls.
  let served = 4;
  while (served < 7431) {
    const out = await channel.call({ prompt: `req#${served}` });
    if (!out.served) break;
    served++;
  }
  console.log(`… bursted to ${served} total calls, all metered off-chain (no on-chain tx)\n`);

  // Close → one ZK settlement.
  const w = channel.close();
  const settle = BigInt(w.settlementAmount);
  console.log("═══ CLOSE — one on-chain settlement ═══");
  console.log(`  calls served (PRIVATE): ${w.totalUnits}`);
  console.log(`  settled to provider:    ${usd(settle)}`);
  console.log(`  refunded to consumer:   ${usd(20n * USDC - settle)}`);
  console.log(`  → the chain never saw the ${w.totalUnits} calls or the 0.002 rate.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
