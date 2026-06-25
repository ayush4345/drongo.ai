const REPO = "https://github.com/ayush4345/drongo.ai";

export default function SiteFooter() {
  return (
    <footer>
      <div className="wrap row">
        <div className="brand" style={{ fontSize: "16px" }}>
          <span className="mark" style={{ width: "24px", height: "24px" }} />
          Drongo <span className="x">AI</span>
        </div>
        <div>
          Thousands of transactions · one settlement · zero usage leaked
        </div>
        <a href={REPO} target="_blank" rel="noopener noreferrer">
          github.com/ayush4345/drongo.ai
        </a>
      </div>
    </footer>
  );
}
