import express, { type Express } from "express";
import { buildWitnessBundle, parseDecimalToMicros } from "@slate/protocol";
import { isWireVoucher } from "@drongo/agent";

import { buildAgentCard } from "./agent-card.js";
import { ChannelStore } from "./channels.js";
import { type ProviderConfig, readProviderConfig } from "./config.js";
import { DrongoChannelStore, parseDrongoOpenBody } from "./drongo-channels.js";
import { type EventSink, JsonlFileEventSink, recordEvent } from "./events.js";
import { buildPaymentRequiredTask, hasPaymentSignature } from "./x402.js";

export type ProviderDeps = {
  config?: ProviderConfig;
  channels?: ChannelStore;
  drongo?: DrongoChannelStore;
  events?: EventSink;
};

export function createProviderApp(deps: ProviderDeps = {}): Express {
  const config = deps.config ?? readProviderConfig();
  const channels = deps.channels ?? new ChannelStore();
  const drongo = deps.drongo ?? new DrongoChannelStore();
  const events = deps.events ?? new JsonlFileEventSink();
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

    const drongoOpen = parseDrongoOpenBody(
      request.body,
      parseDecimalToMicros(config.SLATE_ESCROW_AMOUNT),
      parseDecimalToMicros(config.SLATE_UNIT_PRICE),
    );

    if (drongoOpen.ok) {
      const channel = await drongo.openChannel(drongoOpen.input);
      await recordEvent(events, "x402.channel_opened", {
        channelId: channel.channelId,
        mode: "drongo",
      });
      response.json({ ok: true, channel });
      return;
    }

    if (
      typeof request.body === "object" &&
      request.body !== null &&
      "consumerPubKey" in request.body
    ) {
      response.status(400).json({ ok: false, reason: drongoOpen.reason });
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
      mode: "dev",
    });
    response.json({ ok: true, channel });
  });

  app.post("/channels/:channelId/call", async (request, response) => {
    const channelId = request.params.channelId;
    const voucher = request.body?.voucher;

    if (drongo.hasChannel(channelId) || isWireVoucher(voucher)) {
      const result = await drongo.acceptCall(channelId, voucher, request.body?.payload);

      if (result.ok && result.served) {
        await recordEvent(events, "meter.voucher_accepted", {
          channelId: result.channelId,
          acceptedUnits: result.cumulativeUnits,
          mode: "drongo",
        });
      } else if (result.ok && !result.served && result.reason === "ceiling-exceeded") {
        await recordEvent(events, "meter.ceiling_reached", { channelId, mode: "drongo" });
      }

      response.status(result.ok ? 200 : 400).json(result);
      return;
    }

    const result = await channels.acceptVoucher(channelId, voucher);

    if (result.ok) {
      await recordEvent(events, "meter.voucher_accepted", {
        channelId: result.channelId,
        acceptedUnits: result.acceptedUnits,
        remainingUnits: result.remainingUnits,
      });
    } else if (result.reason === "over-escrow-ceiling") {
      await recordEvent(events, "meter.ceiling_reached", {
        channelId,
      });
    }

    response.status(result.ok ? 200 : 400).json(result);
  });

  app.post("/channels/:channelId/finalize", async (request, response) => {
    const channelId = request.params.channelId;

    if (drongo.hasChannel(channelId)) {
      const channel = drongo.getChannel(channelId);
      if (channel === undefined) {
        response.status(400).json({ ok: false, reason: "channel-not-ready-to-finalize" });
        return;
      }

      await recordEvent(events, "witness.exported", {
        channelId,
        mode: "drongo",
        path: "artifacts/demo-witness.json",
      });

      response.json({ ok: true, channel, mode: "drongo" });
      return;
    }

    const channel = channels.getChannel(channelId);
    const finalVoucher = channels.getFinalVoucher(channelId);

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
