const LIVE = new Set(["metering", "online"]);

/** Status pill for agents (online/idle/offline) and channels (metering/open/settling/closed). */
export function StatusBadge({ status }: { status: string }) {
  const live = LIVE.has(status);
  return (
    <span className={`badge ${status}${live ? " live" : ""}`}>
      <span className="d" />
      {status}
    </span>
  );
}

/** ZK proof verification state. */
export function ProofBadge({ proof }: { proof: "verified" | "pending" | null }) {
  if (!proof) return <span className="muted">—</span>;
  return (
    <span className={`badge ${proof}`}>
      <span className="d" />
      {proof === "verified" ? "proof ✓" : "proving…"}
    </span>
  );
}
