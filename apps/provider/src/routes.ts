import express, { type Express } from "express";
import { buildWitnessBundle, parseDecimalToMicros } from "@slate/protocol";
import { isWireVoucher } from "@drongo/agent";

import { buildAgentCard } from "./agent-card.js";
import { ChannelStore } from "./channels.js";
import { MockChainAdapter } from "./chain.js";
import { type ProviderConfig, readProviderConfig } from "./config.js";
import { DrongoChannelStore, parseDrongoOpenBody } from "./drongo-channels.js";
import { type EventSink, JsonlFileEventSink, recordEvent } from "./events.js";
import { MeterDb } from "./meter-db.js";
import { createPaymentVerifier, type PaymentVerifier } from "./payments.js";
import { build402Response, buildPaymentRequirements, readPaymentHeader } from "./x402.js";

export type ProviderDeps = {
  config?: ProviderConfig;
  channels?: ChannelStore;
  drongo?: DrongoChannelStore;
  events?: EventSink;
  verifier?: PaymentVerifier;
  meterDb?: MeterDb;
};

export function createProviderApp(deps: ProviderDeps = {}): Express {
  const config = deps.config ?? readProviderConfig();
  const meterDb = deps.meterDb ?? new MeterDb(config.METER_DB_PATH);
  const channels = deps.channels ?? new ChannelStore(new MockChainAdapter(), meterDb);
  const drongo = deps.drongo ?? new DrongoChannelStore(undefined, meterDb);
  const events = deps.events ?? new JsonlFileEventSink();
  const verifier = deps.verifier ?? createPaymentVerifier(config);
  const app = express();

  app.use(express.json());

  app.get("/.well-known/agent-card.json", async (_request, response) => {
    await recordEvent(events, "agent.discovered", {
      provider: config.X402_PAY_TO,
    });
    response.json(buildAgentCard());
  });

  app.post("/agent/open", async (request, response) => {
    // 1. x402 gate: no payment proof → 402 with the payment requirements.
    const payment = readPaymentHeader(request.headers);
    if (payment === null) {
      await recordEvent(events, "x402.payment_required", {
        resource: "/agent/open",
        network: config.X402_NETWORK,
      });
      response.status(402).json(build402Response(config));
      return;
    }

    // 2. Verify (and settle) the payment before opening anything. In mock mode
    //    this is a stand-in; with a facilitator it actually checks + broadcasts.
    const verification = await verifier.verifyAndSettle(
      payment,
      buildPaymentRequirements(config),
    );
    if (!verification.ok) {
      await recordEvent(events, "x402.payment_rejected", {
        resource: "/agent/open",
        reason: verification.reason,
      });
      response.status(402).json({
        ...build402Response(config),
        error: `payment rejected: ${verification.reason}`,
      });
      return;
    }
    await recordEvent(events, "x402.payment_settled", {
      resource: "/agent/open",
      settlementTx: verification.settlementTx,
    });

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
        settlementTx: verification.settlementTx,
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
      settlementTx: verification.settlementTx,
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
