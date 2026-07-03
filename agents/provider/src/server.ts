import express from "express";
import type { Express } from "express";
import { deserializeVoucher, isWireVoucher, parseUnits } from "@drongo/agent-core";
import type { ToolboxService, ToolCall } from "@drongo/agent-core";
import type { ProviderServerConfig } from "./config.js";
import { build402Response, buildPaymentRequirements, readPaymentHeader } from "./x402.js";
import { createPaymentVerifier } from "./payments.js";
import type { PaymentVerifier } from "./payments.js";
import { ChannelRegistry } from "./channels.js";
import { TOOL_SPECS } from "./tools.js";

export interface ProviderServerDeps {
  config: ProviderServerConfig;
  /** The priced tools this provider serves. */
  toolbox: ToolboxService;
  /** Override the payment verifier (defaults from config: mock vs facilitator). */
  verifier?: PaymentVerifier;
  /** Override the channel registry (defaults to a fresh in-memory one). */
  registry?: ChannelRegistry;
}

/**
 * The provider's x402 HTTP resource server. It lives INSIDE agents/provider
 * because the provider is the thing exposing the endpoint. Flow per the x402
 * spec: a bare `POST /agent/open` returns `402 Payment Required` with the
 * accepted `PaymentRequirements` — which advertise the provider's rate, payTo
 * address and asset. The consumer accepts those terms and retries with an
 * `X-PAYMENT` header; the server verifies (+ settles) it and opens the metered
 * channel, metering at ITS OWN advertised rate (it no longer trusts a
 * consumer-supplied rate). Each `POST /channels/:id/call` carries the consumer's
 * cumulative voucher, which the ProviderMeter validates before the tool runs.
 * Settlement itself is one ZK proof the consumer builds at close — the provider
 * only meters.
 */
export function createProviderServer(deps: ProviderServerDeps): Express {
  const { config, toolbox } = deps;
  const verifier = deps.verifier ?? createPaymentVerifier(config);
  const registry = deps.registry ?? new ChannelRegistry();

  const app = express();
  app.use(express.json({ limit: "1mb" }));

  // Agent card — advertises the tools and the x402 open endpoint (incl. rate).
  app.get("/.well-known/agent-card.json", (_req, res) => {
    res.json({
      name: "drongo-provider",
      description: "Metered multi-tool provider, settled via Drongo ZK payment channels.",
      x402: { open: "/agent/open", requirements: buildPaymentRequirements(config) },
      tools: TOOL_SPECS,
    });
  });

  // x402-gated channel open: 402 (advertising rate/payTo/asset) without a payment
  // header, else verify + register at the provider's OWN rate.
  app.post("/agent/open", async (req, res) => {
    const payment = readPaymentHeader(req.headers as Record<string, unknown>);
    if (payment === null) {
      res.status(402).json(build402Response(config));
      return;
    }

    const verified = await verifier.verifyAndSettle(payment, buildPaymentRequirements(config));
    if (!verified.ok) {
      res.status(402).json({ ...build402Response(config), error: `payment rejected: ${verified.reason}` });
      return;
    }

    // The consumer proposes the escrow ceiling; the RATE is the provider's own
    // (advertised in the 402), so a consumer can't dictate the price.
    const body = req.body as {
      channelId?: string;
      consumerPublicKey?: { x?: string; y?: string };
      escrow?: string;
    };
    if (
      typeof body.channelId !== "string" ||
      body.consumerPublicKey === undefined ||
      typeof body.consumerPublicKey.x !== "string" ||
      typeof body.consumerPublicKey.y !== "string" ||
      typeof body.escrow !== "string"
    ) {
      res.status(400).json({ ok: false, error: "invalid open payload" });
      return;
    }

    registry.open({
      channelId: BigInt(body.channelId),
      consumerPublicKey: { x: BigInt(body.consumerPublicKey.x), y: BigInt(body.consumerPublicKey.y) },
      rate: parseUnits(config.rate),
      escrow: BigInt(body.escrow),
    });
    res.json({ ok: true, channelId: body.channelId, rate: config.rate, payTo: config.payTo, asset: config.asset, settlementTx: verified.settlementTx });
  });

  // Metered call: validate the cumulative voucher, then run the tool.
  app.post("/channels/:id/call", async (req, res) => {
    const channelId = String(req.params.id);
    const meter = registry.get(channelId);
    if (meter === undefined) {
      res.status(404).json({ served: false, reason: "unknown-channel" });
      return;
    }

    const body = req.body as { voucher?: unknown; payload?: unknown };
    if (!isWireVoucher(body.voucher)) {
      res.status(400).json({ served: false, reason: "invalid-voucher" });
      return;
    }

    const voucher = deserializeVoucher(body.voucher);
    const receipt = await meter.verify(voucher);
    if (!receipt.accepted) {
      // A metering refusal is a valid 200 response — the consumer reads `reason`.
      res.json({
        served: false,
        reason: receipt.reason,
        cumulativeUnits: receipt.cumulativeUnits?.toString(),
        billable: receipt.billable?.toString(),
      });
      return;
    }

    let result: unknown;
    try {
      result = await toolbox.handle(body.payload as ToolCall);
    } catch (error) {
      // Tool failed — do NOT commit the meter, so an unserved call bills nothing
      // and the provider's cumulative stays in sync with the consumer's.
      res.status(502).json({ served: false, reason: `tool-error: ${(error as Error).message}` });
      return;
    }

    // Served — commit the voucher so the meter advances only for served calls.
    meter.commit(voucher);

    res.json({
      served: true,
      result,
      cumulativeUnits: receipt.cumulativeUnits?.toString(),
      billable: receipt.billable?.toString(),
    });
  });

  // Finalize: the consumer builds the settlement proof locally from its last
  // voucher, so the server only releases the in-memory meter here.
  app.post("/channels/:id/finalize", (req, res) => {
    const channelId = String(req.params.id);
    const finalUnits = registry.get(channelId)?.latestVoucher?.totalUnits.toString() ?? "0";
    registry.close(channelId);
    res.json({ ok: true, finalUnits });
  });

  return app;
}
