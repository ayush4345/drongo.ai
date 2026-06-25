import { describe, expect, it } from "vitest";

import { runScenario } from "./run-scenario.js";

describe("consumer scenario runner", () => {
  it("discovers, opens with x402 retry, meters cumulative vouchers, finalizes, and writes witness", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const events: Array<{ type: string; fields: Record<string, unknown> }> = [];
    let witnessWrite:
      | { path: string; contents: string }
      | undefined;

    const fetchImpl: typeof fetch = async (input, init) => {
      const url = input.toString();
      requests.push({ url, init });

      if (url.endsWith("/.well-known/agent-card.json")) {
        return jsonResponse({ name: "ShadowMeter Provider" });
      }

      if (url.endsWith("/agent/open") && !hasPayment(init)) {
        return jsonResponse({ payment: { resource: "/agent/open" } }, 402);
      }

      if (url.endsWith("/agent/open") && hasPayment(init)) {
        return jsonResponse({
          ok: true,
          channel: {
            channelId: "ch_demo",
            consumer: "consumer_demo",
            provider: "mock_provider",
            escrowAmount: "20",
            unitPrice: "0.002",
            rateCommitment: "rate:v1:escrow=20;unit=0.002;max=10000",
            maxUnits: "10000",
            openedAt: new Date(0).toISOString(),
            chain: "mock",
            openTx: "mock_open_tx_ch_demo",
          },
        });
      }

      if (url.endsWith("/channels/ch_demo/call")) {
        const body = JSON.parse(init?.body?.toString() ?? "{}");
        return jsonResponse({
          ok: true,
          channelId: "ch_demo",
          acceptedUnits: body.voucher.cumulativeUnits,
          remainingUnits: (10000 - Number(body.voucher.cumulativeUnits)).toString(),
          result: "provider response",
        });
      }

      if (url.endsWith("/channels/ch_demo/finalize")) {
        return jsonResponse({
          ok: true,
          witnessBundle: {
            scenario: {
              channelId: "ch_demo",
              escrowAmount: "20",
              unitPrice: "0.002",
              finalUnits: "3",
              settlementAmount: "0.006",
              refundAmount: "19.994",
            },
          },
        });
      }

      throw new Error(`unexpected request: ${url}`);
    };

    const result = await runScenario({
      providerUrl: "http://provider.test",
      calls: 3,
      out: "artifacts/demo-witness.json",
      fetchImpl,
      writeFile: async (path, contents) => {
        witnessWrite = { path, contents };
      },
      recordEvent: async (type, fields) => {
        events.push({ type, fields });
      },
    });

    expect(result.finalUnits).toBe("3");
    expect(witnessWrite?.path).toBe("artifacts/demo-witness.json");
    expect(JSON.parse(witnessWrite?.contents ?? "{}").scenario.finalUnits).toBe("3");
    expect(
      requests
        .filter((request) => request.url.endsWith("/channels/ch_demo/call"))
        .map((request) => {
          const body = JSON.parse(request.init?.body?.toString() ?? "{}");
          return body.voucher.cumulativeUnits;
        }),
    ).toEqual(["1", "2", "3"]);
    expect(
      requests.find((request) => request.url.endsWith("/agent/open") && hasPayment(request.init)),
    ).toBeDefined();
    expect(events).toEqual([
      {
        type: "witness.exported",
        fields: {
          path: "artifacts/demo-witness.json",
          finalUnits: "3",
        },
      },
    ]);
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function hasPayment(init: RequestInit | undefined): boolean {
  const headers = new Headers(init?.headers);
  return headers.has("PAYMENT-SIGNATURE");
}
