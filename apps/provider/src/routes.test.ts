import { describe, expect, it } from "vitest";
import { DeterministicDevVoucherSigner } from "@slate/protocol";

import { createProviderApp } from "./routes.js";

async function withServer<T>(
  app: ReturnType<typeof createProviderApp>,
  run: (baseUrl: string) => Promise<T>,
): Promise<T> {
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();

  if (address === null || typeof address === "string") {
    throw new Error("server did not bind to a TCP port");
  }

  try {
    return await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

describe("provider routes", () => {
  it("serves an agent card with x402 payment metadata", async () => {
    await withServer(createProviderApp(), async (baseUrl) => {
      const response = await fetch(`${baseUrl}/.well-known/agent-card.json`);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.name).toBe("ShadowMeter Provider");
      expect(body.skills).toContain("metered paid agent calls");
      expect(body.extensions).toContainEqual(
        expect.objectContaining({
          uri: "https://github.com/coinbase/x402",
          network: "stellar:testnet",
          scheme: "exact",
        }),
      );
    });
  });

  it("requires x402 payment to open a channel in mock mode", async () => {
    await withServer(createProviderApp(), async (baseUrl) => {
      const response = await fetch(`${baseUrl}/agent/open`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ consumer: "consumer_demo" }),
      });
      const body = await response.json();

      expect(response.status).toBe(402);
      expect(body.state).toBe("input-required");
      expect(body.payment).toMatchObject({
        network: "stellar:testnet",
        scheme: "exact",
        payTo: "mock_provider",
        escrowAmount: "20",
        unitPrice: "0.002",
        resource: "/agent/open",
      });
      expect(body.payment.rateCommitment).toBe(
        "rate:v1:escrow=20;unit=0.002;max=10000",
      );
    });
  });

  it("finalizes a channel with the accepted voucher and witness bundle", async () => {
    await withServer(createProviderApp(), async (baseUrl) => {
      const signer = new DeterministicDevVoucherSigner("consumer-secret");
      const openResponse = await fetch(`${baseUrl}/agent/open`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "PAYMENT-SIGNATURE": "mock_payment_signature",
        },
        body: JSON.stringify({ consumer: await signer.publicKey() }),
      });
      const opened = await openResponse.json();
      const voucher = await signer.signVoucher({
        channelId: opened.channel.channelId,
        cumulativeUnits: "7431",
        nonce: "n_7431",
      });

      await fetch(`${baseUrl}/channels/${opened.channel.channelId}/call`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ voucher, payload: { prompt: "demo" } }),
      });

      const finalizeResponse = await fetch(
        `${baseUrl}/channels/${opened.channel.channelId}/finalize`,
        { method: "POST" },
      );
      const finalized = await finalizeResponse.json();

      expect(finalizeResponse.status).toBe(200);
      expect(finalized.finalVoucher).toMatchObject({
        channelId: opened.channel.channelId,
        cumulativeUnits: "7431",
      });
      expect(finalized.witnessBundle.scenario).toMatchObject({
        finalUnits: "7431",
        settlementAmount: "14.862",
        refundAmount: "5.138",
      });
    });
  });
});
