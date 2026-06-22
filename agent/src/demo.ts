/**
 * ShadowMeter agent demo — the worked example from the concept doc.
 *
 * Run with:  npm run demo
 *
 * It opens a channel, bursts thousands of off-chain metered calls (signing cumulative
 * vouchers), then closes with a single settlement — printing what stays private vs. what
 * hits the chain, and the circuit input.json the ZK prover consumes.
 */
import { ShadowCrypto } from "./crypto.js";
import { createIdentity, randomFieldValue } from "./keys.js";
import { MeteredChannel } from "./channel.js";
import { toCircuitInput } from "./circuit.js";

const USDC = 1_000_000n; // 6 decimals → atomic "micro-USDC"
const usd = (atomic: bigint) => `${(Number(atomic) / 1e6).toFixed(6)} USDC`;
const short = (s: string) => `${s.slice(0, 18)}…${s.slice(-6)}`;

async function main(): Promise<void> {
  const crypto = await ShadowCrypto.build();
  const identity = createIdentity(crypto);

  const rate = 2_000n; //               0.002 USDC / call  (PRIVATE)
  const escrow = 20n * USDC; //         20 USDC prepaid ceiling (public)
  const channelId = randomFieldValue();
  const rateBlind = randomFieldValue();
  const channelSecret = randomFieldValue();

  const channel = new MeteredChannel(crypto, {
    channelId,
    rate,
    escrow,
    rateBlind,
    channelSecret,
    identity,
  });

  console.log("═══ OPEN CHANNEL ═══════════════════════════════════════════");
  console.log(`  rate (PRIVATE):            ${usd(rate)} / call`);
  console.log(`  escrow (public):           ${usd(escrow)}`);
  console.log(`  rate commitment (public):  ${short(channel.rateCommitment().toString())}`);

  console.log("\n═══ METER (off-chain, instant, private) ════════════════════");
  // The consumer bursts calls and signs cumulative checkpoints. Only the latest
  // voucher matters; intermediate ones are shown to illustrate supersession.
  const checkpoints = [1_000n, 2_500n, 5_000n, 7_431n];
  let prev = 0n;
  for (const target of checkpoints) {
    const { voucher, result } = channel.meter(target - prev);
    prev = target;
    console.log(
      `  voucher → cumulative ${voucher.cumulativeUnits.toString().padStart(5)} calls | ` +
        `accepted=${result.accepted} | running bill=${usd(result.billable!)}`,
    );
  }

  console.log("\n═══ CLOSE CHANNEL — one on-chain settlement ════════════════");
  const w = channel.close();
  const settlement = BigInt(w.settlementAmount);
  const refund = escrow - settlement;
  console.log(`  total calls (PRIVATE):     ${w.totalUnits}`);
  console.log(`  settled to provider:       ${usd(settlement)}`);
  console.log(`  refunded to consumer:      ${usd(refund)}`);
  console.log(`  nullifier (public):        ${short(w.nullifier)}`);

  console.log("\n═══ WHAT THE CHAIN SEES ════════════════════════════════════");
  console.log("  PUBLIC :  channel open/close · escrow · settlement amount · nullifier · rate commitment");
  console.log("  PRIVATE:  # calls (7431) · rate (0.002) · per-call timing — never revealed");

  console.log("\n═══ CIRCUIT input.json  (hand-off to the ZK team) ══════════");
  console.log(JSON.stringify(toCircuitInput(w), null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
