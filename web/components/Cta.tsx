import Link from "next/link";

const REPO = "https://github.com/ayush4345/drongo.ai";

export default function Cta() {
  return (
    <section className="dark">
      <div className="wrap">
        <div className="ctaband">
          <span className="label" style={{ display: "inline-block" }}>
            <span className="bar" />
            Drongo AI
          </span>
          <h2 style={{ marginLeft: "auto", marginRight: "auto" }}>
            The confidential settlement layer that x402 metering lacks.
          </h2>
          <div className="cta">
            <Link className="btn primary" href="/dashboard">
              Open dashboard
            </Link>
            <a
              className="btn ghost-d"
              href={REPO}
              target="_blank"
              rel="noopener noreferrer"
            >
              Explore the repo
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
