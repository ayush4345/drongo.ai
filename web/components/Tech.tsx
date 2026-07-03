const STACK = [
  { nm: "Stellar / Soroban", ro: "smart contracts · Rust" },
  { nm: "Circom + snarkjs", ro: "Groth16 ZK circuit" },
  { nm: "circomlibjs", ro: "EdDSA-BabyJubjub · Poseidon" },
  { nm: "x402", ro: "agent payment handshake" },
  { nm: "USDC", ro: "SEP-41 settlement asset" },
  { nm: "TypeScript · Node", ro: "agent harness" },
  { nm: "OpenAI", ro: "consumer agent brain" },
  { nm: "Open-Meteo", ro: "metered provider API" },
];

export default function Tech() {
  return (
    <section id="tech" className="dark">
      <div className="wrap">
        <span className="label">
          <span className="bar" />
          Tech used
        </span>
        <h2>Built on a real ZK + Stellar stack.</h2>
        <div className="grid-strip">
          {STACK.map((s) => (
            <div className="gs" key={s.nm}>
              <div className="nm">{s.nm}</div>
              <div className="ro">{s.ro}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
