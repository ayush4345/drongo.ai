import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import type { Channel, Voucher } from "@slate/protocol";
import type { WireVoucher } from "@drongo/agent";

export type DevChannelSnapshot = {
  channel: Channel;
  lastAcceptedUnits: string;
  finalVoucher?: Voucher;
};

export type DrongoChannelSnapshot = {
  channelId: string;
  consumerPubKey: { Ax: string; Ay: string };
  rateMicros: string;
  escrowMicros: string;
  rateCommitment: string;
  lastAcceptedUnits: string;
  latestVoucher?: WireVoucher;
  halted: boolean;
};

export class MeterDb {
  readonly #db: DatabaseSync;

  constructor(path = "artifacts/metering.db") {
    if (path !== ":memory:") {
      const resolved = resolveWorkspacePath(path);
      mkdirSync(dirname(resolved), { recursive: true });
      this.#db = new DatabaseSync(resolved);
    } else {
      this.#db = new DatabaseSync(":memory:");
    }
    this.#initSchema();
  }

  close(): void {
    this.#db.close();
  }

  saveDevChannel(snapshot: DevChannelSnapshot): void {
    const { channel, lastAcceptedUnits, finalVoucher } = snapshot;
    const now = new Date().toISOString();

    this.#db
      .prepare(
        `INSERT INTO channels (
          channel_id, mode, last_accepted_units, halted, opened_at, updated_at,
          consumer, provider, escrow_amount, unit_price, rate_commitment,
          max_units, chain, open_tx, final_voucher_json
        ) VALUES (
          ?, 'dev', ?, 0, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?
        )
        ON CONFLICT(channel_id) DO UPDATE SET
          last_accepted_units = excluded.last_accepted_units,
          updated_at = excluded.updated_at,
          final_voucher_json = excluded.final_voucher_json`,
      )
      .run(
        channel.channelId,
        lastAcceptedUnits,
        channel.openedAt,
        now,
        channel.consumer,
        channel.provider,
        channel.escrowAmount,
        channel.unitPrice,
        channel.rateCommitment,
        channel.maxUnits,
        channel.chain,
        channel.openTx ?? null,
        finalVoucher === undefined ? null : JSON.stringify(finalVoucher),
      );
  }

  updateDevVoucher(
    channelId: string,
    lastAcceptedUnits: string,
    finalVoucher: Voucher,
  ): void {
    const now = new Date().toISOString();
    this.#db
      .prepare(
        `UPDATE channels
         SET last_accepted_units = ?, final_voucher_json = ?, updated_at = ?
         WHERE channel_id = ? AND mode = 'dev'`,
      )
      .run(lastAcceptedUnits, JSON.stringify(finalVoucher), now, channelId);

    this.#recordMeterEvent(channelId, lastAcceptedUnits, "voucher_accepted");
  }

  saveDrongoChannel(snapshot: DrongoChannelSnapshot): void {
    const now = new Date().toISOString();
    const maxUnits = (
      BigInt(snapshot.escrowMicros) / BigInt(snapshot.rateMicros)
    ).toString();

    this.#db
      .prepare(
        `INSERT INTO channels (
          channel_id, mode, last_accepted_units, halted, opened_at, updated_at,
          consumer_pubkey_ax, consumer_pubkey_ay, rate_micros, escrow_micros,
          drongo_rate_commitment, max_units, latest_drongo_voucher_json
        ) VALUES (
          ?, 'drongo', ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?
        )
        ON CONFLICT(channel_id) DO UPDATE SET
          last_accepted_units = excluded.last_accepted_units,
          halted = excluded.halted,
          updated_at = excluded.updated_at,
          latest_drongo_voucher_json = excluded.latest_drongo_voucher_json`,
      )
      .run(
        snapshot.channelId,
        snapshot.lastAcceptedUnits,
        snapshot.halted ? 1 : 0,
        now,
        now,
        snapshot.consumerPubKey.Ax,
        snapshot.consumerPubKey.Ay,
        snapshot.rateMicros,
        snapshot.escrowMicros,
        snapshot.rateCommitment,
        maxUnits,
        snapshot.latestVoucher === undefined
          ? null
          : JSON.stringify(snapshot.latestVoucher),
      );
  }

  updateDrongoMeter(
    channelId: string,
    lastAcceptedUnits: string,
    latestVoucher: WireVoucher | undefined,
    halted: boolean,
    eventType: "voucher_accepted" | "ceiling_reached" = "voucher_accepted",
  ): void {
    const now = new Date().toISOString();
    this.#db
      .prepare(
        `UPDATE channels
         SET last_accepted_units = ?, latest_drongo_voucher_json = ?,
             halted = ?, updated_at = ?
         WHERE channel_id = ? AND mode = 'drongo'`,
      )
      .run(
        lastAcceptedUnits,
        latestVoucher === undefined ? null : JSON.stringify(latestVoucher),
        halted ? 1 : 0,
        now,
        channelId,
      );

    this.#recordMeterEvent(channelId, lastAcceptedUnits, eventType);
  }

  loadDevChannels(): DevChannelSnapshot[] {
    const rows = this.#db
      .prepare(
        `SELECT channel_id, last_accepted_units, final_voucher_json,
                consumer, provider, escrow_amount, unit_price, rate_commitment,
                max_units, opened_at, chain, open_tx
         FROM channels
         WHERE mode = 'dev'`,
      )
      .all() as Array<Record<string, string | null>>;

    return rows.map((row) => ({
      channel: {
        channelId: row.channel_id!,
        consumer: row.consumer!,
        provider: row.provider!,
        escrowAmount: row.escrow_amount!,
        unitPrice: row.unit_price!,
        rateCommitment: row.rate_commitment!,
        maxUnits: row.max_units!,
        openedAt: row.opened_at!,
        chain: row.chain as Channel["chain"],
        openTx: row.open_tx ?? undefined,
      },
      lastAcceptedUnits: row.last_accepted_units ?? "0",
      finalVoucher:
        row.final_voucher_json === null
          ? undefined
          : (JSON.parse(row.final_voucher_json) as Voucher),
    }));
  }

  listMeterEvents(channelId?: string): Array<{
    channelId: string;
    cumulativeUnits: string;
    eventType: string;
  }> {
    const rows = (
      channelId === undefined
        ? this.#db.prepare(
            `SELECT channel_id, cumulative_units, event_type
             FROM meter_events ORDER BY id`,
          )
        : this.#db.prepare(
            `SELECT channel_id, cumulative_units, event_type
             FROM meter_events WHERE channel_id = ? ORDER BY id`,
          )
    ).all(...(channelId === undefined ? [] : [channelId])) as Array<
      Record<string, string>
    >;

    return rows.map((row) => ({
      channelId: row.channel_id,
      cumulativeUnits: row.cumulative_units,
      eventType: row.event_type,
    }));
  }

  loadDrongoChannels(): DrongoChannelSnapshot[] {
    const rows = this.#db
      .prepare(
        `SELECT channel_id, consumer_pubkey_ax, consumer_pubkey_ay,
                rate_micros, escrow_micros, drongo_rate_commitment,
                last_accepted_units, latest_drongo_voucher_json, halted
         FROM channels
         WHERE mode = 'drongo'`,
      )
      .all() as Array<Record<string, string | null | number>>;

    return rows.map((row) => ({
      channelId: row.channel_id as string,
      consumerPubKey: {
        Ax: row.consumer_pubkey_ax as string,
        Ay: row.consumer_pubkey_ay as string,
      },
      rateMicros: row.rate_micros as string,
      escrowMicros: row.escrow_micros as string,
      rateCommitment: row.drongo_rate_commitment as string,
      lastAcceptedUnits: (row.last_accepted_units as string) ?? "0",
      latestVoucher:
        row.latest_drongo_voucher_json === null
          ? undefined
          : (JSON.parse(row.latest_drongo_voucher_json as string) as WireVoucher),
      halted: row.halted === 1,
    }));
  }

  #recordMeterEvent(
    channelId: string,
    cumulativeUnits: string,
    eventType: "voucher_accepted" | "ceiling_reached",
  ): void {
    this.#db
      .prepare(
        `INSERT INTO meter_events (channel_id, cumulative_units, recorded_at, event_type)
         VALUES (?, ?, ?, ?)`,
      )
      .run(channelId, cumulativeUnits, new Date().toISOString(), eventType);
  }

  #initSchema(): void {
    this.#db.exec(`
      CREATE TABLE IF NOT EXISTS channels (
        channel_id TEXT PRIMARY KEY,
        mode TEXT NOT NULL CHECK (mode IN ('dev', 'drongo')),
        last_accepted_units TEXT NOT NULL DEFAULT '0',
        halted INTEGER NOT NULL DEFAULT 0,
        opened_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        consumer TEXT,
        provider TEXT,
        escrow_amount TEXT,
        unit_price TEXT,
        rate_commitment TEXT,
        max_units TEXT,
        chain TEXT,
        open_tx TEXT,
        final_voucher_json TEXT,
        consumer_pubkey_ax TEXT,
        consumer_pubkey_ay TEXT,
        rate_micros TEXT,
        escrow_micros TEXT,
        drongo_rate_commitment TEXT,
        latest_drongo_voucher_json TEXT
      );

      CREATE TABLE IF NOT EXISTS meter_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        channel_id TEXT NOT NULL,
        cumulative_units TEXT NOT NULL,
        recorded_at TEXT NOT NULL,
        event_type TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_meter_events_channel
        ON meter_events (channel_id);
    `);
  }
}

function resolveWorkspacePath(path: string): string {
  return resolve(process.env.INIT_CWD ?? process.cwd(), path);
}
