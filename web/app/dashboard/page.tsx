import Link from "next/link";
import Topbar from "@/components/dashboard/Topbar";
import { StatusBadge } from "@/components/dashboard/Badges";
import { agents, channels, kpis, usdc } from "@/lib/dashboard-data";

export default function OverviewPage() {
  const recent = channels.slice(0, 5);

  return (
    <>
      <Topbar section="Overview" />
      <div className="dash-body">
        <div className="page-head">
          <span className="eyebrow">Overview</span>
          <h1>Your agent economy</h1>
          <p>
            Agents you own, the channels they run, and what they&apos;ve settled
            on Stellar. Call counts and rates are metered privately off-chain —
            only you and the counterparty agent see them.
          </p>
        </div>

        <div className="kpis">
          <div className="kpi">
            <div className="k-label">Agents</div>
            <div className="k-val">{kpis.agents}</div>
            <div className="k-sub">2 consumers · 2 providers</div>
          </div>
          <div className="kpi">
            <div className="k-label">Active channels</div>
            <div className="k-val">{kpis.activeChannels}</div>
            <div className="k-sub">metering or open</div>
          </div>
          <div className="kpi">
            <div className="k-label">Calls metered</div>
            <div className="k-val">{kpis.callsMetered.toLocaleString("en-US")}</div>
            <div className="k-sub">off-chain · private</div>
          </div>
          <div className="kpi">
            <div className="k-label">Settled on-chain</div>
            <div className="k-val">
              {usdc(kpis.settledUsdc)}
              <span className="u">USDC</span>
            </div>
            <div className="k-sub">across closed channels</div>
          </div>
        </div>

        <div className="grid-2">
          <div className="panel">
            <div className="panel-head">
              <span className="eyebrow">Channels</span>
              <Link href="/dashboard/channels">View all →</Link>
            </div>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Channel</th>
                  <th>Pair</th>
                  <th>Status</th>
                  <th className="right">Settled</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link className="rowlink mono" href={`/dashboard/channels/${c.id}`}>
                        {c.id}
                      </Link>
                    </td>
                    <td>
                      <span className="flow-pair">
                        {c.consumer} <span className="arr">→</span> {c.provider}
                      </span>
                    </td>
                    <td><StatusBadge status={c.status} /></td>
                    <td className="right mono">
                      {c.settledUsdc === null ? <span className="muted">—</span> : `${usdc(c.settledUsdc)}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="panel">
            <div className="panel-head">
              <span className="eyebrow">Agents</span>
              <Link href="/dashboard/agents">View all →</Link>
            </div>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Agent</th>
                  <th>Kind</th>
                  <th>Status</th>
                  <th className="right">Lifetime calls</th>
                </tr>
              </thead>
              <tbody>
                {agents.map((a) => (
                  <tr key={a.id}>
                    <td className="rowlink">{a.name}</td>
                    <td>
                      <span className={`kind-pill ${a.kind}`}>{a.kind}</span>
                    </td>
                    <td><StatusBadge status={a.status} /></td>
                    <td className="right mono">{a.callsLifetime.toLocaleString("en-US")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
