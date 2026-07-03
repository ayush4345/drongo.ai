// Runnable entrypoint for the provider's x402 HTTP server.
//   pnpm --filter @drongo/agent-provider serve   # :4021
//
// Env: PORT, X402_NETWORK, X402_ASSET, X402_PAY_TO, X402_OPEN_PRICE,
//      X402_FACILITATOR_URL, X402_FACILITATOR_API_KEY, PROVIDER_PUBLIC.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { readProviderServerConfig } from "./config.js";
import { resolveFacilitatorApiKey } from "./facilitator-key.js";
import { FetchHttpClient, buildToolbox } from "./index.js";
import { createProviderServer } from "./server.js";

const envPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env");
loadEnv({ path: envPath });

async function main(): Promise<void> {
  const apiKey = await resolveFacilitatorApiKey();
  if (apiKey !== undefined) {
    process.env.X402_FACILITATOR_API_KEY = apiKey;
  }

  const config = readProviderServerConfig();
  if (config.facilitatorApiKey === undefined) {
    console.warn(
      "x402 facilitator API key missing — channel open will fail until X402_FACILITATOR_API_KEY is set",
    );
    console.warn("  get a testnet key: https://channels.openzeppelin.com/testnet/gen");
  } else if (process.env.X402_FACILITATOR_API_KEY === apiKey && apiKey !== undefined) {
    console.log("  x402 api key:   auto-fetched from OpenZeppelin testnet");
  }

  const toolbox = buildToolbox(new FetchHttpClient());
  const app = createProviderServer({ config, toolbox });

  app.listen(config.port, () => {
    console.log(`drongo provider listening on http://localhost:${config.port}`);
    console.log(`  x402 network:   ${config.network}`);
    console.log(`  x402 pay-to:    ${config.payTo}`);
    console.log(`  x402 asset:     ${config.asset}`);
    console.log(`  open price:     ${config.openPrice}`);
    console.log(`  facilitator:    ${config.facilitatorUrl}`);
    console.log(`  agent card:     GET  /.well-known/agent-card.json`);
    console.log(`  channel open:   POST /agent/open`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
