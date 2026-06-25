import Link from "next/link";
import Topbar from "@/components/dashboard/Topbar";
import { StatusBadge } from "@/components/dashboard/Badges";
import { agents, usdc, shortAddr } from "@/lib/dashboard-data";

export default function AgentsPage() {
  return (
    <>
      <Topbar section="Agents" />
      <div className="dash-body">
        <div className="page-head">
          <span className="eyebrow">Agents</span>
          <h1>Agents</h1>
          <p>
            The consumer and provider agents you operate. Consumers buy metered
            services and pay per call; providers sell a service and collect at
            settlement. Per-call rates are private — hover to reveal.
          </p>
        </div>

        <div className="agent-grid">
          {agents.map((a) => {
            const isProvider = a.kind === "provider";
            return (
              <div className="agent-card" key={a.id}>
                <div className="top">
                  <div className={`avatar ${a.kind}`}>{a.name[0]}</div>
                  <div className="who">
                    <div className="nm">
                      {a.name}
                      <StatusBadge status={a.status} />
                    </div>
                    <div className="ro">
                      <span className={`kind-pill ${a.kind}`}>{a.kind}</span>
                      &nbsp;&nbsp;{a.detail}
                    </div>
                  </div>
                </div>

                <p className="blurb">{a.blurb}</p>

                <div className="stat-row">
                  <div className="m">
                    <div className="lbl">{isProvider ? "Sell rate" : "Paid rate"}</div>
                    <div className="v mono blurred" title="Private — committed on-chain, never revealed">
                      {usdc(a.rateUsdc)}
                      <span className="muted"> /call</span>
                    </div>
                  </div>
                  <div className="m">
                    <div className="lbl">Channels</div>
                    <div className="v mono">{a.activeChannels}</div>
                  </div>
                  <div className="m">
                    <div className="lbl">Lifetime calls</div>
                    <div className="v mono">{a.callsLifetime.toLocaleString("en-US")}</div>
                  </div>
                  <div className="m">
                    <div className="lbl">{isProvider ? "Earned" : "Spent"}</div>
                    <div className="v mono">{usdc(a.valueUsdc)} USDC</div>
                  </div>
                </div>

                <div className="actions">
                  {isProvider ? (
                    <Link className="dbtn primary" href="/dashboard/usage">
                      View live usage
                    </Link>
                  ) : (
                    <button className="dbtn primary" type="button">
                      Run agent
                    </button>
                  )}
                  <Link className="dbtn" href="/dashboard/channels">
                    Channels
                  </Link>
                  <span className="dbtn" style={{ borderColor: "transparent", color: "var(--on-dark-mut)", cursor: "default" }}>
                    {shortAddr(a.address)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
