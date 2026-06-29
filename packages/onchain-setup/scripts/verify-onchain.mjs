import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Buffer } from "node:buffer";
import { Keypair } from "@stellar/stellar-sdk";
import { serializeSettlement } from "@drongo/proving-setup";
import { sorobanConfigFromEnv, assertSorobanConfig } from "../dist/index.js";
import { Client as MeteredVerifierClient } from "../dist/bindings/meteredverifier/src/index.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
for (const line of readFileSync(join(repoRoot, ".env"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const provingRoot = join(repoRoot, "packages/proving-setup");
const fixtureProof = JSON.parse(readFileSync(join(provingRoot, "artifacts/proof.json"), "utf8"));
const fixtureSignals = JSON.parse(readFileSync(join(provingRoot, "artifacts/public.json"), "utf8"));
const serialized = serializeSettlement({ proof: fixtureProof, publicSignals: fixtureSignals });

const config = sorobanConfigFromEnv();
assertSorobanConfig(config);
const publicKey = Keypair.fromSecret(process.env.DEPOSITOR_SECRET).publicKey();
const client = new MeteredVerifierClient({
  contractId: config.meteredVerifierId,
  rpcUrl: config.rpcUrl,
  networkPassphrase: config.networkPassphrase,
  publicKey,
});
const tx = await client.verify({
  proof: {
    a: Buffer.from(serialized.proof.a),
    b: Buffer.from(serialized.proof.b),
    c: Buffer.from(serialized.proof.c),
  },
  public_signals: serialized.publicSignals,
});
const r = tx.result;
console.log("on-chain fixture verify:", typeof r?.unwrap === "function" ? r.unwrap() : r);
