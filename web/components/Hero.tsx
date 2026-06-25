const REPO = "https://github.com/ayush4345/drongo.ai";

const CONSTELLATION = "M120 110 L320 230 L300 460 L520 550 L760 420 L700 190 L940 140 L1060 370";

export default function Hero() {
  return (
    <header className="hero dark">
      <svg
        className="const"
        viewBox="0 0 1200 720"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        <g stroke="#223040" strokeWidth="1" fill="none">
          <path d="M120 110 L320 230 L300 460 L520 550 L760 420 L700 190 L940 140 L1060 370 L880 590 L620 700" />
          <path d="M320 230 L520 550 M760 420 L880 590 M300 460 L120 350 M940 140 L1060 370 M700 190 L520 550 M120 350 L160 630" />
        </g>
        <path
          className="flow"
          fill="none"
          stroke="#34e6c0"
          strokeWidth="1.5"
          strokeLinecap="round"
          d={CONSTELLATION}
        />
        <g fill="#34465a">
          <circle cx="120" cy="110" r="3" />
          <circle cx="300" cy="460" r="3" />
          <circle cx="520" cy="550" r="3" />
          <circle cx="700" cy="190" r="3" />
          <circle cx="940" cy="140" r="3" />
          <circle cx="880" cy="590" r="3" />
          <circle cx="160" cy="630" r="3" />
          <circle cx="620" cy="700" r="3" />
        </g>
        <g fill="#34e6c0">
          <circle className="pulse" style={{ animationDelay: "0s" }} cx="320" cy="230" r="4.5" />
          <circle className="pulse" style={{ animationDelay: "1.1s" }} cx="760" cy="420" r="4.5" />
          <circle className="pulse" style={{ animationDelay: "2.2s" }} cx="1060" cy="370" r="4.5" />
        </g>
        <circle className="pkt" r="3.6" fill="#7af0d6">
          <animateMotion dur="7s" repeatCount="indefinite" path={CONSTELLATION} />
        </circle>
        <circle className="pkt" r="3" fill="#34e6c0">
          <animateMotion dur="5.5s" begin="1.2s" repeatCount="indefinite" path="M940 140 L1060 370 L880 590 L620 700" />
        </circle>
        <circle className="pkt" r="2.6" fill="#34e6c0">
          <animateMotion dur="6.5s" begin="0.6s" repeatCount="indefinite" path="M300 460 L120 350 L160 630" />
        </circle>
      </svg>
      <div className="glow" />
      <div className="wrap">
        <div className="inner">
          <span className="label">
            <span className="bar" />
            Confidential agent payments
          </span>
          <h1>
            Agents pay agents. <span className="ac">Privately.</span>
          </h1>
          <p className="sub">
            Drongo meters thousands of agent-to-agent API calls off-chain, then
            settles them <b style={{ color: "var(--on-dark)" }}>once</b> on
            Stellar with a zero-knowledge proof — so usage volume, pricing and
            timing never touch the chain.
          </p>
          <div className="cta">
            <a className="btn primary" href="#how">
              See how it works
            </a>
            <a
              className="btn ghost-d"
              href={REPO}
              target="_blank"
              rel="noopener noreferrer"
            >
              Read the code
            </a>
          </div>
        </div>
      </div>
      <div className="logos">
        <div className="wrap row">
          <span className="cap">Built with</span>
          <span className="nm">Stellar</span>
          <span className="nm">Soroban</span>
          <span className="nm">Circom</span>
          <span className="nm">snarkjs</span>
          <span className="nm">x402</span>
          <span className="nm">USDC</span>
          <span className="nm">OpenAI</span>
        </div>
      </div>
    </header>
  );
}
