// Runnable entrypoint for the consumer's HTTP chat server.
//   pnpm --filter @drongo/agent-provider serve   # terminal 1 — provider on :4021
//   pnpm --filter @drongo/agent-consumer serve   # terminal 2 — consumer on :4022
//   cd web && npm run dev                        # terminal 3 — chat UI on :3000
//
// Env: CONSUMER_PORT, PROVIDER_URL, CORS_ORIGIN, RATE, ESCROW,
//      DEPOSITOR_SECRET, STELLAR_*_ID, OPENAI_API_KEY (optional),
//      X402_FACILITATOR_API_KEY (optional, for facilitator auth).
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { readConsumerServerConfig } from "./config.js";
import { AgentSession } from "./session.js";
import { createConsumerServer } from "./server.js";

const envPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env");
loadEnv({ path: envPath });

const config = readConsumerServerConfig();
const session = new AgentSession(config);

async function main(): Promise<void> {
  console.log("drongo consumer (chat) starting…");
  console.log(`  provider:  ${config.providerUrl}`);
  console.log(`  chain:     Stellar testnet (DEPOSITOR_SECRET required)`);
  console.log(`  x402:      real payments via facilitator`);

  const app = createConsumerServer({ config, session });
  const server = app.listen(config.port, () => {
    console.log(`drongo consumer listening on http://localhost:${config.port}`);
    console.log(`  brain:       ${process.env.OPENAI_API_KEY ? "OpenAI" : "stub (offline)"}`);
    console.log(`  open:        POST /session/open   (wallet x402 payment or server signer)`);
    console.log(`  chat:        POST /chat   { "message": "…" }`);
    console.log(`  health:      GET  /health`);
  });

  const shutdown = async () => {
    console.log("\nsettling channel…");
    server.close();
    await session.shutdown();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
