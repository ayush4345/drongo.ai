const STATS = [
  { n: "7,431", t: "API calls metered off-chain, privately" },
  { n: "1", t: "on-chain settlement, ZK-proven" },
  { n: "0", t: "of usage, rate or timing leaked" },
];

export default function AccentBand() {
  return (
    <section className="accent">
      <div className="wrap">
        <span className="label">
          <span className="bar" />
          The worked example
        </span>
        <h2>Thousands of calls. One settlement. Zero leaks.</h2>
        <div className="stats">
          {STATS.map((s) => (
            <div className="stat" key={s.t}>
              <div className="n">{s.n}</div>
              <div className="t">{s.t}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
