import type { ReactNode } from "react";

type Feature = {
  icon: ReactNode;
  title: string;
  body: string;
  tags: string[];
};

const FEATURES: Feature[] = [
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" />
        <path d="M9.5 12l2 2 3.5-4" />
      </svg>
    ),
    title: "Confidential metering",
    body: "Usage volume, rate and timing stay off-chain. The ledger only ever sees one settlement.",
    tags: ["private", "off-chain"],
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <path d="M3 7l9-4 9 4-9 4-9-4z" />
        <path d="M3 12l9 4 9-4" />
        <path d="M3 17l9 4 9-4" />
      </svg>
    ),
    title: "Thousands of calls, one tx",
    body: "Meter freely off-chain; settle the whole channel in a single Stellar transaction.",
    tags: ["efficient", "batched"],
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <circle cx="12" cy="12" r="9" />
        <path d="M8 12l2.5 2.5L16 9" />
      </svg>
    ),
    title: "ZK-proven correctness",
    body: "A Groth16 proof verified inside a Soroban contract guarantees the payout matches the signed meter.",
    tags: ["groth16", "soroban"],
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <path d="M3 13a9 9 0 0118 0" />
        <path d="M12 13l4-2.5" />
        <circle cx="12" cy="13" r="1.4" fill="currentColor" stroke="none" />
      </svg>
    ),
    title: "Escrow & gatekeeping",
    body: "A prepaid USDC ceiling caps spend; the provider serves only against fresh in-budget vouchers.",
    tags: ["escrow", "USDC"],
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <path d="M9 7V4M15 7V4M8 7h8v4a4 4 0 01-8 0z" />
        <path d="M12 15v5" />
      </svg>
    ),
    title: "x402-native front door",
    body: "Discovery and channel-open ride Stellar's x402 — interoperable with the agentic-commerce ecosystem.",
    tags: ["x402", "stellar"],
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <rect x="6" y="6" width="12" height="12" rx="2" />
        <path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3" />
      </svg>
    ),
    title: "Real agents, real work",
    body: "An OpenAI consumer agent buys live weather from a metered provider — paying per call, privately.",
    tags: ["openai", "open-meteo"],
  },
];

export default function Features() {
  return (
    <section id="features" className="light">
      <div className="wrap">
        <span className="label">
          <span className="bar" />
          Features
        </span>
        <h2>A private toll-gate for autonomous agents.</h2>
        <div className="feat">
          {FEATURES.map((f) => (
            <div className="fcard" key={f.title}>
              <div className="tile">{f.icon}</div>
              <h3>{f.title}</h3>
              <p>{f.body}</p>
              <div className="tags">
                {f.tags.map((t) => (
                  <span className="tg" key={t}>
                    {t}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
