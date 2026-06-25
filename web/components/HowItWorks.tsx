const STEPS = [
  { num: "01", tag: "off-chain", cls: "off", title: "Discover", body: "Consumer hits the provider and gets terms over x402." },
  { num: "02", tag: "on-chain", cls: "on", title: "Open", body: "USDC escrow is locked; the rate is committed, not revealed." },
  { num: "03", tag: "off-chain", cls: "off", title: "Meter", body: "Signed cumulative vouchers per call. The ledger stays silent." },
  { num: "04", tag: "on-chain", cls: "on", title: "Settle", body: "One Groth16 proof on Soroban pays out — zero usage leaked." },
];

function DotIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#5e9bff" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#34e6c0" strokeWidth="2">
      <path d="M5 12l4 4L19 6" />
    </svg>
  );
}

export default function HowItWorks() {
  return (
    <section id="how" className="dark">
      <div className="wrap">
        <span className="label">
          <span className="bar" />
          How it works
        </span>
        <h2>
          Meter off-chain. Settle once. <span className="ac">Prove it.</span>
        </h2>
        <p className="lead">
          A payment channel: the consumer signs cumulative EdDSA-BabyJubjub
          vouchers as it consumes, and a single Groth16 proof settles the
          channel on Stellar — asserting the payout is correctly derived from a
          counter-signed meter at the agreed rate.
        </p>
        <div className="steps">
          {STEPS.map((s) => (
            <div className="step" key={s.num}>
              <div className="top">
                <span className="num">{s.num}</span>
                <span className="ln" />
                <span className={`tag ${s.cls}`}>{s.tag}</span>
              </div>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </div>
          ))}
        </div>
        <div className="split">
          <div className="col pub">
            <div className="hd">Public on-chain</div>
            <ul>
              <li><DotIcon />Channel open / close</li>
              <li><DotIcon />Escrow amount</li>
              <li><DotIcon />Settlement amount</li>
              <li><DotIcon />Nullifier &amp; rate commitment</li>
            </ul>
          </div>
          <div className="col priv">
            <div className="hd">Private — never revealed</div>
            <ul>
              <li><CheckIcon />Number of calls / units</li>
              <li><CheckIcon />The per-unit rate</li>
              <li><CheckIcon />Per-call timing &amp; frequency</li>
              <li><CheckIcon />Which services were used</li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
