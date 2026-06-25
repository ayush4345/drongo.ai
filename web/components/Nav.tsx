const REPO = "https://github.com/ayush4345/drongo.ai";

export default function Nav() {
  return (
    <nav>
      <div className="wrap row">
        <a className="brand" href="#top">
          <span className="mark" />
          Drongo <span className="x">AI</span>
        </a>
        <div className="links">
          <a href="#problem">Problem</a>
          <a href="#how">How it works</a>
          <a href="#features">Features</a>
          <a href="#tech">Tech</a>
          <a href="#sponsors">Sponsors</a>
        </div>
        <a
          className="btn ghost-d"
          href={REPO}
          target="_blank"
          rel="noopener noreferrer"
        >
          GitHub ↗
        </a>
      </div>
    </nav>
  );
}
