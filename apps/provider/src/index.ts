import { readProviderConfig } from "./config.js";
import { createProviderApp } from "./routes.js";

const config = readProviderConfig();
const app = createProviderApp(config);

app.listen(config.PORT, () => {
  console.log(`ShadowMeter provider listening on http://localhost:${config.PORT}`);
});
