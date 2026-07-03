export default function Flow() {
  return (
    <section id="flow" className="dark">
      <div className="wrap">
        <span className="label">
          <span className="bar" />
          The flow
        </span>
        <h2>Inside a channel.</h2>
        <p className="lead">
          Two on-chain touches bookend thousands of private, off-chain
          exchanges between the consumer and provider agents.
        </p>
        <div className="window">
          <div className="bar">
            <i />
            <i />
            <i className="live" />
            <span className="t">drongo · channel session</span>
          </div>
          <div className="body">
            <svg
              className="flowsvg"
              viewBox="0 0 980 580"
              role="img"
              aria-label="Sequence diagram: consumer and provider agents transact off-chain, settling on Stellar with a ZK proof"
            >
              <defs>
                <marker id="aC" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto">
                  <path d="M0 0L8 4.5L0 9Z" fill="#34e6c0" />
                </marker>
                <marker id="aB" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto">
                  <path d="M0 0L8 4.5L0 9Z" fill="#5e9bff" />
                </marker>
              </defs>
              {/* lifelines */}
              <g stroke="#1c2733" strokeWidth="1.5">
                <line x1="170" y1="78" x2="170" y2="556" />
                <line x1="490" y1="78" x2="490" y2="556" />
                <line x1="812" y1="78" x2="812" y2="556" />
              </g>
              {/* actor headers */}
              <g>
                <rect x="85" y="24" width="170" height="38" rx="10" fill="#10171f" stroke="#1c2733" />
                <rect x="405" y="24" width="170" height="38" rx="10" fill="#10171f" stroke="#1c2733" />
                <rect x="727" y="24" width="170" height="38" rx="10" fill="#10171f" stroke="#1c2733" />
                <text x="170" y="48" textAnchor="middle" fill="#eef3f1" fontSize="13.5" fontWeight="700">Consumer agent</text>
                <text x="490" y="48" textAnchor="middle" fill="#eef3f1" fontSize="13.5" fontWeight="700">Provider agent</text>
                <text x="812" y="48" textAnchor="middle" fill="#eef3f1" fontSize="13.5" fontWeight="700">Stellar · Soroban</text>
              </g>
              {/* phase tags */}
              <g fill="#586676" fontSize="11" fontWeight="600">
                <text x="14" y="116">OPEN</text>
                <text x="14" y="304">METER</text>
                <text x="14" y="404">SETTLE</text>
              </g>
              {/* OPEN */}
              <line x1="170" y1="116" x2="486" y2="116" stroke="#34e6c0" strokeWidth="1.5" markerEnd="url(#aC)" />
              <text x="328" y="108" textAnchor="middle" fill="#34e6c0" fontSize="12.5">request service</text>
              <line x1="490" y1="160" x2="174" y2="160" stroke="#34e6c0" strokeWidth="1.5" markerEnd="url(#aC)" />
              <text x="330" y="152" textAnchor="middle" fill="#9fb0a9" fontSize="12.5">402 · terms (USDC · escrow · rate commitment)</text>
              <line x1="170" y1="214" x2="808" y2="214" stroke="#5e9bff" strokeWidth="1.5" markerEnd="url(#aB)" />
              <text x="490" y="206" textAnchor="middle" fill="#5e9bff" fontSize="12.5">open_channel · lock USDC escrow</text>
              {/* METER loop box */}
              <rect x="122" y="244" width="556" height="98" rx="12" fill="rgba(52,230,192,.05)" stroke="#34e6c0" strokeDasharray="5 5" strokeOpacity=".5" />
              <text x="664" y="266" textAnchor="end" fill="#34e6c0" fontSize="11" fontWeight="600">off-chain · repeats ×7,431</text>
              <line x1="170" y1="302" x2="486" y2="302" stroke="#34e6c0" strokeWidth="1.5" markerEnd="url(#aC)" />
              <text x="328" y="294" textAnchor="middle" fill="#34e6c0" fontSize="12.5">request + signed voucher (cum. N)</text>
              <line x1="490" y1="330" x2="174" y2="330" stroke="#34e6c0" strokeWidth="1.5" markerEnd="url(#aC)" />
              <text x="330" y="322" textAnchor="middle" fill="#9fb0a9" fontSize="12.5">result</text>
              <circle className="pkt" r="4" fill="#7af0d6">
                <animateMotion dur="1.7s" repeatCount="indefinite" path="M170 302 L486 302" />
              </circle>
              {/* SETTLE */}
              <line x1="490" y1="404" x2="808" y2="404" stroke="#5e9bff" strokeWidth="1.5" markerEnd="url(#aB)" />
              <text x="651" y="396" textAnchor="middle" fill="#5e9bff" fontSize="12.5">close_channel · Groth16 proof</text>
              <rect x="606" y="430" width="312" height="56" rx="10" fill="rgba(94,155,255,.09)" stroke="#5e9bff" strokeOpacity=".5" />
              <text x="762" y="452" textAnchor="middle" fill="#cdd9d5" fontSize="11.5">verify ✓ → pay provider</text>
              <text x="762" y="470" textAnchor="middle" fill="#cdd9d5" fontSize="11.5">refund consumer · spend nullifier</text>
            </svg>
          </div>
        </div>
      </div>
    </section>
  );
}
