import express from "express";
import type { Express } from "express";
import { requireChainFromEnv } from "@drongo/agent-core";
import type { AgentSession } from "./session.js";
import type { ConsumerServerConfig } from "./config.js";
import { buildAgentSteps } from "./steps.js";
import { ALL_TOOLS, TOOL_PROVIDERS } from "./providers.js";

function providerInfo(config: ConsumerServerConfig) {
  return {
    name: "drongo-provider",
    url: config.providerUrl,
  };
}

export interface ConsumerServerDeps {
  config: ConsumerServerConfig;
  session: AgentSession;
}

/**
 * HTTP server for the consumer agent. Exposes a chat endpoint the web UI can
 * call; the agent meters tool calls over x402 against the remote provider.
 */
export function createConsumerServer(deps: ConsumerServerDeps): Express {
  const { config, session } = deps;
  const app = express();

  app.use(express.json({ limit: "256kb" }));
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", config.corsOrigin);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, PAYMENT-SIGNATURE, X-PAYMENT");
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  });

  app.get("/health", (_req, res) => {
    const real = requireChainFromEnv();
    res.json({
      ok: session.ready,
      provider: providerInfo(config),
      tools: ALL_TOOLS,
      providers: Object.entries(TOOL_PROVIDERS).map(([tool, meta]) => ({
        tool,
        id: meta.id,
        label: meta.label,
      })),
      brain: process.env.OPENAI_API_KEY ? "openai" : "stub",
      settlementMode: "stellar",
      settlementNote:
        "Calls are metered off-chain; POST /session/settle submits one ZK proof on-chain.",
      walletRequired: !session.ready,
      payment: session.getPaymentSummary(),
      chain: real.label,
    });
  });

  app.get("/session/prepare", async (_req, res) => {
    if (session.ready) {
      res.status(409).json({ ok: false, error: "session already open" });
      return;
    }
    try {
      const prepared = await session.prepare();
      res.json({ ok: true, ...prepared, providerUrl: config.providerUrl });
    } catch (error) {
      res.status(500).json({ ok: false, error: (error as Error).message });
    }
  });

  app.post("/session/open", async (req, res) => {
    if (session.ready) {
      res.json({ ok: true, alreadyOpen: true });
      return;
    }

    const body = req.body as { paymentHeader?: unknown };
    const headerFromBody =
      typeof body.paymentHeader === "string" && body.paymentHeader.trim().length > 0
        ? body.paymentHeader
        : undefined;
    const headerFromReq = (() => {
      const h = req.headers["payment-signature"] ?? req.headers["x-payment"];
      return typeof h === "string" && h.trim().length > 0 ? h : undefined;
    })();

    try {
      await session.initialize({ paymentHeader: headerFromBody ?? headerFromReq });
      res.json({ ok: true });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      res.status(500).json({ ok: false, error: msg });
    }
  });

  app.post("/session/settle", async (_req, res) => {
    if (!session.ready) {
      res.status(409).json({ ok: false, error: "no open session to settle" });
      return;
    }

    try {
      const result = await session.settle();
      res.json(result);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      res.status(500).json({ ok: false, error: msg });
    }
  });

  app.post("/chat", async (req, res) => {
    if (!session.ready) {
      res.status(503).json({
        ok: false,
        error: "agent session not ready — open a metered channel first",
        walletRequired: true,
      });
      return;
    }

    const body = req.body as { message?: unknown };
    if (typeof body.message !== "string" || body.message.trim().length === 0) {
      res.status(400).json({ ok: false, error: "message is required" });
      return;
    }

    try {
      const result = await session.chat(body.message);
      const provider = providerInfo(config);
      const { payment, ...rest } = result;
      const steps = buildAgentSteps(provider, result.calls, result.answer, payment);
      res.json({ ok: true, provider, steps, payment, ...rest });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      res.status(500).json({ ok: false, error: msg });
    }
  });

  return app;
}
