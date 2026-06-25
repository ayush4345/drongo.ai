import express, { type Express } from "express";
import { buildWitnessBundle } from "@slate/protocol";

import { buildAgentCard } from "./agent-card.js";
import { ChannelStore } from "./channels.js";
import { type ProviderConfig, readProviderConfig } from "./config.js";
import { type EventSink, JsonlFileEventSink, recordEvent } from "./events.js";
import { buildPaymentRequiredTask, hasPaymentSignature } from "./x402.js";

export function createProviderApp(
  config: ProviderConfig = readProviderConfig(),
  channels = new ChannelStore(),
  events: EventSink = new JsonlFileEventSink(),
): Express {
  const app = express();

  app.use(express.json());

  app.get("/.well-known/agent-card.json", async (_request, response) => {
    await recordEvent(events, "agent.discovered", {
      provider: config.X402_PAY_TO,
    });
    response.json(buildAgentCard());
  });

  app.post("/agent/open", async (request, response) => {
    if (!hasPaymentSignature(request.headers)) {
      await recordEvent(events, "x402.payment_required", {
        resource: "/agent/open",
        network: config.X402_NETWORK,
      });
      response.status(402).json(buildPaymentRequiredTask(config));
      return;
    }

    const consumer =
      typeof request.body?.consumer === "string"
        ? request.body.consumer
        : "consumer_demo";
    const channel = await channels.openChannel({
      consumer,
      provider: config.X402_PAY_TO,
      escrowAmount: config.SLATE_ESCROW_AMOUNT,
      unitPrice: config.SLATE_UNIT_PRICE,
      chain: config.SLATE_CHAIN_MODE,
    });

    await recordEvent(events, "x402.channel_opened", {
      channelId: channel.channelId,
      openTx: channel.openTx,
    });
    response.json({ ok: true, channel });
  });

  app.post("/channels/:channelId/call", async (request, response) => {
    const result = await channels.acceptVoucher(
      request.params.channelId,
      request.body?.voucher,
    );

    if (result.ok) {
      await recordEvent(events, "meter.voucher_accepted", {
        channelId: result.channelId,
        acceptedUnits: result.acceptedUnits,
        remainingUnits: result.remainingUnits,
      });
    } else if (result.reason === "over-escrow-ceiling") {
      await recordEvent(events, "meter.ceiling_reached", {
        channelId: request.params.channelId,
      });
    }

    response.status(result.ok ? 200 : 400).json(result);
  });

  app.post("/channels/:channelId/finalize", async (request, response) => {
    const channel = channels.getChannel(request.params.channelId);
    const finalVoucher = channels.getFinalVoucher(request.params.channelId);

    if (channel === undefined || finalVoucher === undefined) {
      response.status(400).json({
        ok: false,
        reason: "channel-not-ready-to-finalize",
      });
      return;
    }

    const witnessBundle = buildWitnessBundle({ channel, finalVoucher });

    await recordEvent(events, "witness.exported", {
      channelId: channel.channelId,
      finalUnits: finalVoucher.cumulativeUnits,
      path: "artifacts/demo-witness.json",
    });

    response.json({
      ok: true,
      finalVoucher,
      witnessBundle,
    });
  });

  return app;
}
