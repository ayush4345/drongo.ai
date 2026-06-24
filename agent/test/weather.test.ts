import { test } from "node:test";
import assert from "node:assert/strict";
import { WeatherService, wmoText, type HttpClient } from "../src/weather.js";

/** A canned HTTP client: first call (geocoding) returns `geo`, second returns `wx`. */
class MockHttp implements HttpClient {
  constructor(private readonly geo: any, private readonly wx: any) {}
  async getJson(url: string): Promise<any> {
    return url.includes("geocoding") ? this.geo : this.wx;
  }
}

test("weather service maps Open-Meteo geocode + forecast into a result", async () => {
  const http = new MockHttp(
    { results: [{ name: "Tokyo", latitude: 35.69, longitude: 139.69 }] },
    { current: { temperature_2m: 21.3, wind_speed_10m: 8, weather_code: 2 } },
  );
  const svc = new WeatherService(http);
  assert.equal(svc.price({ location: "Tokyo" }), 1n);

  const r = await svc.handle({ location: "Tokyo" });
  assert.equal(r.location, "Tokyo");
  assert.equal(r.latitude, 35.69);
  assert.equal(r.temperatureC, 21.3);
  assert.equal(r.windKph, 8);
  assert.equal(r.weatherCode, 2);
  assert.equal(r.summary, "partly cloudy");
});

test("weather service throws on an unknown location", async () => {
  const svc = new WeatherService(new MockHttp({ results: [] }, {}));
  await assert.rejects(() => svc.handle({ location: "Nowhereville" }), /location not found/);
});

test("wmoText maps known weather codes", () => {
  assert.equal(wmoText(0), "clear sky");
  assert.equal(wmoText(95), "thunderstorm");
  assert.match(wmoText(123), /code 123/);
});
