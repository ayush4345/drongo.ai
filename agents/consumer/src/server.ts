import express from "express";
import type { Express } from "express";
import type { AgentSession } from "./session.js";
import type { ConsumerServerConfig } from "./config.js";

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
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  });

  app.get("/health", (_req, res) => {
    res.json({
      ok: session.ready,
      providerUrl: config.providerUrl,
      brain: process.env.OPENAI_API_KEY ? "openai" : "stub",
    });
  });

  app.post("/chat", async (req, res) => {
    if (!session.ready) {
      res.status(503).json({ ok: false, error: "agent session not ready" });
      return;
    }

    const body = req.body as { message?: unknown };
    if (typeof body.message !== "string" || body.message.trim().length === 0) {
      res.status(400).json({ ok: false, error: "message is required" });
      return;
    }

    try {
      const result = await session.chat(body.message);
      res.json({ ok: true, ...result });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      res.status(500).json({ ok: false, error: msg });
    }
  });

  return app;
}
