const CARDS = [
  {
    ix: "01",
    title: "Usage is competitive intel",
    body: "Every micropayment on-chain reconstructs the usage graph — who pays whom, how much, how often.",
  },
  {
    ix: "02",
    title: "Pricing is a secret",
    body: "Providers give different rates to different customers. Per-call amounts on-chain expose the rate card.",
  },
  {
    ix: "03",
    title: "Per-call settlement is wasteful",
    body: "Posting thousands of micro-transactions is slow and costly. You want to meter freely and settle once.",
  },
];

export default function Problem() {
  return (
    <section id="problem" className="light">
      <div className="wrap">
        <span className="label">
          <span className="bar" />
          The problem
        </span>
        <h2>
          Metered machine commerce <span className="ac">leaks everything.</span>
        </h2>
        <p className="lead">
          Agents are starting to buy inference, data and compute from each
          other, and pay-per-use is the natural model. Settled naively
          on-chain, it becomes a metadata firehose.
        </p>
        <div className="three">
          {CARDS.map((c) => (
            <div className="pcard" key={c.ix}>
              <div className="ix">{c.ix}</div>
              <h3>{c.title}</h3>
              <p>{c.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
