// Runnable entrypoint for the consumer's HTTP chat server.
//   pnpm --filter @drongo/agent-provider serve   # terminal 1 — provider on :4021
//   pnpm --filter @drongo/agent-consumer serve   # terminal 2 — consumer on :4022
//   pnpm --filter @drongo/web dev                # terminal 3 — chat UI on :3000
//
// Env: CONSUMER_PORT, PROVIDER_URL, CORS_ORIGIN, RATE, ESCROW,
//      OPENAI_API_KEY (optional), X402_PAYMENT_SIGNATURE, DEPOSITOR_SECRET (optional).
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
  console.log("initializing consumer agent session (x402)…");
  console.log(`  provider:  ${config.providerUrl}`);
  try {
    await session.initialize();
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`\n✗ Failed to open x402 session with provider at ${config.providerUrl}.`);
    console.error(`  Start the provider first:  pnpm --filter @drongo/agent-provider serve`);
    console.error(`  ${msg}`);
    process.exitCode = 1;
    return;
  }

  const app = createConsumerServer({ config, session });
  const server = app.listen(config.port, () => {
    console.log(`drongo consumer (chat) listening on http://localhost:${config.port}`);
    console.log(`  brain:       ${process.env.OPENAI_API_KEY ? "OpenAI" : "stub (offline)"}`);
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
