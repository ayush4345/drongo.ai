const SPONSORS = [
  { nm: "Stellar", ro: "L1 · Soroban" },
  { nm: "Coinbase", ro: "x402 protocol" },
  { nm: "OpenZeppelin", ro: "x402 facilitator" },
  { nm: "Circle", ro: "USDC" },
  { nm: "DoraHacks", ro: "hackathon" },
];

export default function Sponsors() {
  return (
    <section id="sponsors" className="light">
      <div className="wrap">
        <span className="label">
          <span className="bar" />
          Sponsors &amp; ecosystem
        </span>
        <h2>Powered by the people building agentic money.</h2>
        <div className="spongrid">
          {SPONSORS.map((s) => (
            <div className="spon" key={s.nm}>
              <div className="nm">{s.nm}</div>
              <div className="ro">{s.ro}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
