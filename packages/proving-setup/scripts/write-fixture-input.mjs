#!/usr/bin/env node
/**
 * Write fixtures/settlement.input.json — a deterministic witness input aligned
 * with the Soroban contract test address payloads in slate-escrow/src/test.rs.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildSettlementInputs } from "../dist/inputs.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const outPath = path.join(root, "fixtures", "settlement.input.json");

// 32-byte contract-ID payloads used by the on-chain contract tests.
const FIXTURE_DEPOSITOR =
  "0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f01";
const FIXTURE_PROVIDER =
  "0202030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f02";
const FIXTURE_TOKEN =
  "0302030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f03";

// Deterministic test vector: settlement_amount = total_units * rate.
const CHANNEL_ID = 99_701_849n; // 0x5f48a99
const CHANNEL_SECRET = 42_424_242n;
const RATE = 1_000n;
const RATE_BLIND = 7_777_777n;
const TOTAL_UNITS = 14_862n;
const ESCROW_AMOUNT = 20_000_000n;

// 32-byte Baby Jubjub private key (field element); only used to sign the voucher.
const CONSUMER_PRIVATE_KEY =
  "aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899";

const inputs = await buildSettlementInputs({
  channelId: CHANNEL_ID,
  channelSecret: CHANNEL_SECRET,
  rate: RATE,
  rateBlind: RATE_BLIND,
  totalUnits: TOTAL_UNITS,
  escrowAmount: ESCROW_AMOUNT,
  depositorPayload: FIXTURE_DEPOSITOR,
  providerPayload: FIXTURE_PROVIDER,
  tokenPayload: FIXTURE_TOKEN,
  consumerPrivateKey: CONSUMER_PRIVATE_KEY,
});

mkdirSync(path.dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(inputs, null, 2)}\n`);
console.log(`wrote ${outPath}`);
