// Runnable entrypoint for the provider's x402 HTTP server.
//   pnpm --filter @drongo/agent-provider serve
// Env: PORT, RATE, X402_NETWORK, X402_ASSET, X402_PAY_TO, X402_MAX_AMOUNT,
//      MOCK_X402 (default true), X402_FACILITATOR_URL.
// Loads the shared repo-root .env (same file the consumer reads), so provider
// config lives alongside consumer config in one place. Shell env still wins.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { readProviderServerConfig } from "./config.js";
import { FetchHttpClient } from "./http.js";
import { buildToolbox } from "./tools.js";
import { createProviderServer } from "./server.js";

const envPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env");
loadEnv({ path: envPath });

const config = readProviderServerConfig();
const toolbox = buildToolbox(new FetchHttpClient());
const app = createProviderServer({ config, toolbox });

app.listen(config.port, () => {
  console.log(`drongo provider (x402) listening on http://localhost:${config.port}`);
  console.log(`  payment mode:  ${config.mockX402 ? "MOCK verifier" : `facilitator @ ${config.facilitatorUrl}`}`);
  console.log(`  network/asset: ${config.network}  ${config.asset}`);
  console.log(`  tools:         ${toolbox.toolNames().join(", ")}`);
  console.log(`  open channel:  POST /agent/open   (402 → X-PAYMENT → open)`);
  console.log(`  agent card:    GET  /.well-known/agent-card.json`);
});
