import Link from "next/link";
import Topbar from "@/components/dashboard/Topbar";
import { StatusBadge, ProofBadge } from "@/components/dashboard/Badges";
import { getChannel, usdc } from "@/lib/dashboard-data";

export default async function ChannelDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const c = getChannel(id);

  if (!c) {
    return (
      <>
        <Topbar section="Channel" />
        <div className="dash-body">
          <div className="empty">
            Channel <span className="mono">{id}</span> not found.
            <div style={{ marginTop: "16px" }}>
              <Link className="dbtn" href="/dashboard/channels">← All channels</Link>
            </div>
          </div>
        </div>
      </>
    );
  }

  const closed = c.status === "closed";
  const settlePct = c.settledUsdc !== null ? (c.settledUsdc / c.escrowUsdc) * 100 : 0;

  return (
    <>
      <Topbar section="Channel" />
      <div className="dash-body">
        <div className="page-head">
          <span className="eyebrow">
            <Link href="/dashboard/channels" className="muted">Channels</Link> /{" "}
            {c.consumer} → {c.provider}
          </span>
          <h1 className="mono">{c.id}</h1>
          <p>
            {c.service} &middot; opened {c.openedAt}
            {c.closedAt ? ` · closed ${c.closedAt}` : ""} &nbsp;
            <StatusBadge status={c.status} />
          </p>
        </div>

        <div className="detail-grid">
          {/* left: settlement + public/private */}
          <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
            <div className="panel">
              <div className="panel-head">
                <span className="eyebrow">Settlement</span>
                <ProofBadge proof={c.proof} />
              </div>
              <div className="panel-pad">
                {closed && c.settledUsdc !== null ? (
                  <>
                    <div className="settle-amt">
                      {usdc(c.settledUsdc)}<span className="u">USDC → {c.provider}</span>
                    </div>
                    <div className="muted" style={{ fontSize: "13.5px", marginTop: "8px" }}>
                      {usdc(c.refundedUsdc ?? 0)} USDC refunded to {c.consumer} ·
                      one on-chain transaction, ZK-verified
                    </div>
                    <div className="gauge" style={{ marginTop: "16px" }}>
                      <div className="fill" style={{ width: `${settlePct}%` }} />
                    </div>
                    <div className="muted" style={{ fontSize: "12px", marginTop: "8px" }}>
                      {settlePct.toFixed(1)}% of the {usdc(c.escrowUsdc)} USDC escrow paid out
                    </div>
                  </>
                ) : c.status === "settling" ? (
                  <div className="muted" style={{ fontSize: "14px" }}>
                    Generating the Groth16 proof… settlement is pending on-chain
                    verification. {c.unitsServed.toLocaleString("en-US")} calls
                    will settle once the proof lands.
                  </div>
                ) : (
                  <div className="muted" style={{ fontSize: "14px" }}>
                    Not settled yet — {c.unitsServed.toLocaleString("en-US")} calls
                    metered so far against a {usdc(c.escrowUsdc)} USDC escrow.
                    The channel settles in a single transaction at close.
                  </div>
                )}
              </div>
            </div>

            <div className="panel">
              <div className="panel-head">
                <span className="eyebrow">What the chain sees</span>
              </div>
              <div className="panel-pad">
                <div className="grid-2">
                  <div className="pp-col pub">
                    <div className="hd">Public on-chain</div>
                    <ul>
                      <li><span className="lk">Channel</span><span className="vv">{c.id}</span></li>
                      <li><span className="lk">Escrow</span><span className="vv">{usdc(c.escrowUsdc)}</span></li>
                      <li><span className="lk">Settlement</span><span className="vv">{c.settledUsdc !== null ? usdc(c.settledUsdc) : "—"}</span></li>
                      <li><span className="lk">Rate commitment</span><span className="vv">{c.rateCommitment}</span></li>
                      <li><span className="lk">Nullifier</span><span className="vv">{c.nullifier ?? "—"}</span></li>
                    </ul>
                  </div>
                  <div className="pp-col priv">
                    <div className="hd">Private — off-chain</div>
                    <ul>
                      <li><span className="lk">Calls / units</span><span className="vv">{c.unitsServed.toLocaleString("en-US")}</span></li>
                      <li><span className="lk">Per-unit rate</span><span className="vv blurred" title="Never revealed">{usdc(c.rateUsdc)}</span></li>
                      <li><span className="lk">Per-call timing</span><span className="vv muted">hidden</span></li>
                      <li><span className="lk">Individual vouchers</span><span className="vv muted">hidden</span></li>
                      <li><span className="lk">Service queried</span><span className="vv muted">hidden</span></li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* right: parameters */}
          <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
            <div className="panel">
              <div className="panel-head"><span className="eyebrow">Parameters</span></div>
              <div className="panel-pad">
                <dl className="kv">
                  <div className="row"><dt>Consumer</dt><dd>{c.consumer}</dd></div>
                  <div className="row"><dt>Provider</dt><dd>{c.provider}</dd></div>
                  <div className="row"><dt>Service</dt><dd>{c.service}</dd></div>
                  <div className="row"><dt>Escrow</dt><dd className="mono">{usdc(c.escrowUsdc)} USDC</dd></div>
                  <div className="row"><dt>Opened</dt><dd className="mono">{c.openedAt}</dd></div>
                  <div className="row"><dt>Closed</dt><dd className="mono">{c.closedAt ?? "—"}</dd></div>
                </dl>
              </div>
            </div>

            <div className="panel">
              <div className="panel-head"><span className="eyebrow">Actions</span></div>
              <div className="panel-pad" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {closed ? (
                  <button className="dbtn" type="button" disabled>Channel closed</button>
                ) : (
                  <button className="dbtn primary" type="button">
                    {c.status === "settling" ? "Settling…" : "Close & settle"}
                  </button>
                )}
                <Link className="dbtn" href="/dashboard/usage">View live usage</Link>
                <Link className="dbtn" href="/dashboard/channels">← All channels</Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
