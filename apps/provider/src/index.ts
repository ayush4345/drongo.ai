import { readProviderConfig } from "./config.js";
import { MeterDb } from "./meter-db.js";
import { createProviderApp } from "./routes.js";

const config = readProviderConfig();
const meterDb = new MeterDb(config.METER_DB_PATH);
const app = createProviderApp({ config, meterDb });

app.listen(config.PORT, () => {
  console.log(`ShadowMeter provider listening on http://localhost:${config.PORT}`);
});
