export default function Topbar({ section }: { section: string }) {
  return (
    <header className="dash-top">
      <span className="crumbs">
        Dashboard / <b>{section}</b>
      </span>
      <span className="spacer" />
      <span className="dash-wallet">
        <span className="pip" />
        GATLAS5…M3CZP
      </span>
    </header>
  );
}
