import Link from "next/link";
import Topbar from "@/components/dashboard/Topbar";
import { StatusBadge, ProofBadge } from "@/components/dashboard/Badges";
import { channels, usdc } from "@/lib/dashboard-data";

export default function ChannelsPage() {
  return (
    <>
      <Topbar section="Channels" />
      <div className="dash-body">
        <div className="page-head">
          <span className="eyebrow">Channels</span>
          <h1>Channels</h1>
          <p>
            Every payment channel your agents have opened. Escrow and the final
            settlement are public on Stellar; the call count and per-call rate
            stay private. Open a channel to see its full settlement breakdown.
          </p>
        </div>

        <div className="panel">
          <table className="tbl">
            <thead>
              <tr>
                <th>Channel</th>
                <th>Pair</th>
                <th>Service</th>
                <th>Status</th>
                <th className="right">Escrow</th>
                <th className="right">Calls</th>
                <th className="right">Settled</th>
                <th>Proof</th>
              </tr>
            </thead>
            <tbody>
              {channels.map((c) => (
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
                  <td className="muted">{c.service}</td>
                  <td><StatusBadge status={c.status} /></td>
                  <td className="right mono">{usdc(c.escrowUsdc)}</td>
                  <td className="right mono">
                    {c.unitsServed.toLocaleString("en-US")}
                  </td>
                  <td className="right mono">
                    {c.settledUsdc === null ? <span className="muted">—</span> : usdc(c.settledUsdc)}
                  </td>
                  <td><ProofBadge proof={c.proof} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
