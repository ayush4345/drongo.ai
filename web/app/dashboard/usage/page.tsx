"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Topbar from "@/components/dashboard/Topbar";
import { StatusBadge } from "@/components/dashboard/Badges";
import { liveSession, makeCallEvent, usdc, type CallEvent } from "@/lib/dashboard-data";

export default function UsagePage() {
  const ceiling = liveSession.ceiling;
  const [events, setEvents] = useState<CallEvent[]>([]);
  const [running, setRunning] = useState(true);

  const done = events.length >= ceiling;
  const cumulative = events[0]?.cumulativeUsdc ?? 0;
  const remaining = Math.max(0, liveSession.escrowUsdc - cumulative);
  const pct = Math.min(100, (cumulative / liveSession.escrowUsdc) * 100);

  // respect reduced-motion: show the finished session statically
  useEffect(() => {
    const reduce =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setRunning(false);
      setEvents(Array.from({ length: ceiling }, (_, i) => makeCallEvent(ceiling - i)));
    }
  }, [ceiling]);

  // self-driving stream: each appended call schedules the next
  useEffect(() => {
    if (!running) return;
    if (events.length >= ceiling) {
      setRunning(false);
      return;
    }
    const delay = events.length < 6 ? 220 : 1000;
    const t = setTimeout(() => {
      setEvents((prev) => {
        const nextSeq = prev.length + 1;
        if (nextSeq > ceiling) return prev;
        return [makeCallEvent(nextSeq), ...prev];
      });
    }, delay);
    return () => clearTimeout(t);
  }, [running, events.length, ceiling]);

  function reset() {
    setEvents([]);
    setRunning(true);
  }

  return (
    <>
      <Topbar section="Live usage" />
      <div className="dash-body">
        <div className="page-head">
          <span className="eyebrow">Live usage</span>
          <h1>Provider · Helios</h1>
          <p>
            Watching <b>Helios</b> serve metered weather calls to <b>Atlas</b>{" "}
            over channel <span className="mono">{liveSession.channelId}</span>.
            Each call is paid for with a fresh signed voucher; nothing touches
            the chain until the channel settles.
          </p>
        </div>

        <div className="live-grid">
          <div className="stat-lg">
            <div className="lbl">
              Calls served <span className="privtag">PRIVATE</span>
            </div>
            <div className="n">{events.length}</div>
          </div>
          <div className="stat-lg">
            <div className="lbl">Billed so far</div>
            <div className="n">
              {usdc(cumulative)}<span className="u">USDC</span>
            </div>
          </div>
          <div className="stat-lg">
            <div className="lbl">Escrow remaining</div>
            <div className="n">
              {usdc(remaining)}<span className="u">/ {usdc(liveSession.escrowUsdc)}</span>
            </div>
            <div className={`gauge ${pct > 80 ? "warn" : ""}`} style={{ marginTop: "12px" }}>
              <div className="fill" style={{ width: `${pct}%` }} />
            </div>
          </div>
          <div className="stat-lg">
            <div className="lbl">
              Rate <span className="privtag">PRIVATE</span>
            </div>
            <div className="n blurred" title="Committed as Poseidon(rate, blind) — never revealed">
              {usdc(liveSession.rateUsdc)}<span className="u">/call</span>
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <StatusBadge status="metering" />
            <span className="mono muted" style={{ fontSize: "12.5px" }}>{liveSession.service}</span>
            <span className="spacer" style={{ flex: 1 }} />
            <div className="controls">
              <button className="dbtn" type="button" onClick={() => setRunning((r) => !r)} disabled={done}>
                {running ? "❚❚ Pause" : "▶ Resume"}
              </button>
              <button className="dbtn" type="button" onClick={reset}>
                ↻ Reset
              </button>
            </div>
          </div>

          <table className="tbl">
            <thead>
              <tr>
                <th>#</th>
                <th>Time</th>
                <th>Location</th>
                <th>Conditions</th>
                <th className="right">Temp</th>
                <th className="right">Billable</th>
                <th className="right">Cumulative</th>
                <th>Voucher</th>
              </tr>
            </thead>
            <tbody>
              {events.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <div className="feed-empty">Waiting for the first metered call…</div>
                  </td>
                </tr>
              ) : (
                events.map((e, i) => (
                  <tr key={e.seq} className={i === 0 && running ? "feed-new" : ""}>
                    <td className="mono muted">{e.seq}</td>
                    <td className="mono muted">{e.time}</td>
                    <td>{e.location}</td>
                    <td className="muted">{e.summary}</td>
                    <td className="right mono">{e.tempC}°C</td>
                    <td className="right mono">{usdc(e.billableUsdc)}</td>
                    <td className="right mono">{usdc(e.cumulativeUsdc)}</td>
                    <td className="mono muted">{e.voucher}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {done && (
          <div className="ceiling-note done">
            <span>
              Escrow ceiling reached after <b>{ceiling}</b> calls — the provider
              halts and the channel is ready to settle. One Groth16 proof pays{" "}
              <b>{usdc(cumulative)} USDC</b> to Helios and refunds the rest.
            </span>
            <span style={{ flex: 1 }} />
            <Link className="dbtn primary" href={`/dashboard/channels/${liveSession.channelId}`}>
              Settle channel →
            </Link>
          </div>
        )}
      </div>
    </>
  );
}
