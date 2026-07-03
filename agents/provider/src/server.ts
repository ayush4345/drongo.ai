import express from "express";
import type { Express } from "express";
import type { PaymentRequirements } from "@x402/core/types";
import { deserializeVoucher, isWireVoucher } from "@drongo/agent-core";
import type { ToolboxService, ToolCall } from "@drongo/agent-core";
import type { ProviderServerConfig } from "./config.js";
import { openResourceUrl, readPaymentHeader } from "./x402.js";
import {
  buildOpenChannelPaymentRequired,
  createProviderX402Server,
  settleOpenChannelPayment,
} from "./x402-resource.js";
import { ChannelRegistry } from "./channels.js";
import { TOOL_SPECS } from "./tools.js";

export interface ProviderServerDeps {
  config: ProviderServerConfig;
  /** The priced tools this provider serves. */
  toolbox: ToolboxService;
  /** Override the channel registry (defaults to a fresh in-memory one). */
  registry?: ChannelRegistry;
}

/**
 * The provider's x402 HTTP resource server. Flow per the x402 spec:
 * `POST /agent/open` without payment → `402 Payment Required`;
 * retry with `PAYMENT-SIGNATURE` → facilitator verify+settle → metered channel opens.
 */
export function createProviderServer(deps: ProviderServerDeps): Express {
  const { config, toolbox } = deps;
  const registry = deps.registry ?? new ChannelRegistry();
  const x402Server = createProviderX402Server(config);
  let openRequirements: PaymentRequirements | undefined;

  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", config.corsOrigin);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, PAYMENT-SIGNATURE, X-PAYMENT, PAYMENT-REQUIRED",
    );
    res.setHeader(
      "Access-Control-Expose-Headers",
      "PAYMENT-REQUIRED, PAYMENT-RESPONSE, PAYMENT-SIGNATURE, X-PAYMENT",
    );
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  });

  app.get("/.well-known/agent-card.json", (_req, res) => {
    res.json({
      name: "drongo-provider",
      description: "Metered multi-tool provider, settled via Drongo ZK payment channels.",
      x402: { open: "/agent/open", network: config.network, asset: config.asset, payTo: config.payTo },
      tools: TOOL_SPECS,
    });
  });

  app.post("/agent/open", async (req, res) => {
    const resourceUrl = openResourceUrl(config, req.headers.host);
    const payment = readPaymentHeader(req.headers as Record<string, unknown>);

    if (payment === null) {
      try {
        const unpaid = await buildOpenChannelPaymentRequired(x402Server, config, { resourceUrl });
        openRequirements = unpaid.body.accepts[0];
        res.status(unpaid.status).set(unpaid.headers).json(unpaid.body);
      } catch (error) {
        const message = (error as Error).message;
        const missingFacilitator =
          message.includes("no supported payment kinds") ||
          message.includes("Facilitator getSupported failed");
        res.status(missingFacilitator ? 503 : 500).json({
          ok: false,
          error: missingFacilitator
            ? "x402 facilitator unavailable — set X402_FACILITATOR_API_KEY (https://channels.openzeppelin.com/testnet/gen)"
            : message,
        });
      }
      return;
    }

    if (openRequirements === undefined) {
      try {
        const unpaid = await buildOpenChannelPaymentRequired(x402Server, config, { resourceUrl });
        openRequirements = unpaid.body.accepts[0];
      } catch (error) {
        const message = (error as Error).message;
        const missingFacilitator =
          message.includes("no supported payment kinds") ||
          message.includes("Facilitator getSupported failed");
        res.status(missingFacilitator ? 503 : 500).json({
          ok: false,
          error: missingFacilitator
            ? "x402 facilitator unavailable — set X402_FACILITATOR_API_KEY (https://channels.openzeppelin.com/testnet/gen)"
            : message,
        });
        return;
      }
    }

    const requirements = openRequirements;
    if (requirements === undefined) {
      res.status(500).json({ ok: false, error: "payment requirements unavailable" });
      return;
    }

    let settlementTx: string;
    try {
      const settled = await settleOpenChannelPayment(x402Server, payment, requirements);
      settlementTx = settled.settlementTx;
    } catch (error) {
      res.status(402).json({
        ok: false,
        error: `payment rejected: ${(error as Error).message}`,
      });
      return;
    }

    const body = req.body as {
      channelId?: string;
      consumerPublicKey?: { x?: string; y?: string };
      rate?: string;
      escrow?: string;
    };
    if (
      typeof body.channelId !== "string" ||
      body.consumerPublicKey === undefined ||
      typeof body.consumerPublicKey.x !== "string" ||
      typeof body.consumerPublicKey.y !== "string" ||
      typeof body.rate !== "string" ||
      typeof body.escrow !== "string"
    ) {
      res.status(400).json({ ok: false, error: "invalid open payload" });
      return;
    }

    try {
      registry.open({
        channelId: BigInt(body.channelId),
        consumerPublicKey: { x: BigInt(body.consumerPublicKey.x), y: BigInt(body.consumerPublicKey.y) },
        rate: BigInt(body.rate),
        escrow: BigInt(body.escrow),
      });
    } catch (error) {
      res.status(400).json({ ok: false, error: (error as Error).message });
      return;
    }

    res.json({ ok: true, channelId: body.channelId, settlementTx });
  });

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

    const receipt = await meter.receive(deserializeVoucher(body.voucher));
    if (!receipt.accepted) {
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
      res.status(502).json({ served: false, reason: `tool-error: ${(error as Error).message}` });
      return;
    }

    res.json({
      served: true,
      result,
      cumulativeUnits: receipt.cumulativeUnits?.toString(),
      billable: receipt.billable?.toString(),
    });
  });

  app.post("/channels/:id/finalize", (req, res) => {
    const channelId = String(req.params.id);
    const finalUnits = registry.get(channelId)?.latestVoucher?.totalUnits.toString() ?? "0";
    registry.close(channelId);
    res.json({ ok: true, finalUnits });
  });

  return app;
}
