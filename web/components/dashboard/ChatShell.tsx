"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import AgentStepsSidebar from "./AgentStepsSidebar";
import ChatPanel from "./ChatPanel";
import { SETTLE_STAGES, type AgentTurn, type SettleOutcome, type SettlePhase } from "./chat-types";

type SettleError = { message: string; action: "settle" | "open" };

export default function ChatShell() {
  const [turns, setTurns] = useState<AgentTurn[]>([]);
  const [activeTurnId, setActiveTurnId] = useState<string | null>(null);

  const [phase, setPhase] = useState<SettlePhase>("idle");
  const [stage, setStage] = useState(0);
  const [outcome, setOutcome] = useState<SettleOutcome | null>(null);
  const [error, setError] = useState<SettleError | null>(null);
  // Bumped on "New Session" to remount ChatPanel and clear its local messages.
  const [sessionKey, setSessionKey] = useState(0);
  const busyRef = useRef(false);

  // Animate the sidebar through the settlement stages while the request is in
  // flight so the background steps are visible; clamp at the last stage.
  useEffect(() => {
    if (phase !== "settling") return;
    setStage(0);
    const timer = setInterval(() => {
      setStage((s) => Math.min(s + 1, SETTLE_STAGES.length - 1));
    }, 1500);
    return () => clearInterval(timer);
  }, [phase]);

  const onSettle = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setError(null);
    setOutcome(null);
    setPhase("settling");
    try {
      const res = await fetch("/api/settle", { method: "POST" });
      const data = (await res.json()) as SettleOutcome;
      if (res.ok && data.ok && data.settled) {
        setOutcome(data);
        setPhase("settled");
      } else {
        setOutcome(data.steps ? data : null);
        setError({ message: data.reason ?? data.error ?? "Settlement did not complete", action: "settle" });
        setPhase("error");
      }
    } catch {
      setError({ message: "Could not reach the agent to settle", action: "settle" });
      setPhase("error");
    } finally {
      busyRef.current = false;
    }
  }, []);

  const onNewSession = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setError(null);
    setPhase("opening");
    try {
      const res = await fetch("/api/session", { method: "POST" });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (res.ok && data.ok) {
        setTurns([]);
        setActiveTurnId(null);
        setOutcome(null);
        setSessionKey((k) => k + 1);
        setPhase("idle");
      } else {
        setError({ message: data.error ?? "Could not open a new session", action: "open" });
        setPhase("error");
      }
    } catch {
      setError({ message: "Could not reach the agent to open a new session", action: "open" });
      setPhase("error");
    } finally {
      busyRef.current = false;
    }
  }, []);

  // A settle failure leaves the channel alive, so chat stays usable; only a
  // successful settle (torn-down channel) or an in-flight action locks it.
  const chatDisabled = phase === "settling" || phase === "settled" || phase === "opening";

  return (
    <>
      <section className="chat-panel" aria-label="Chat conversation">
        <ChatPanel
          key={sessionKey}
          disabled={chatDisabled}
          disabledLabel={
            phase === "settled"
              ? "Channel settled — start a new session"
              : phase === "opening"
                ? "Opening a new channel…"
                : "Channel settling…"
          }
          onTurnStart={(turn) => {
            setTurns((prev) => [...prev, turn]);
            setActiveTurnId(turn.id);
          }}
          onTurnComplete={(turn) => {
            setTurns((prev) => prev.map((t) => (t.id === turn.id ? turn : t)));
            setActiveTurnId(turn.id);
          }}
        />
      </section>

      <AgentStepsSidebar
        turns={turns}
        activeTurnId={activeTurnId}
        settlePhase={phase}
        settleStage={stage}
        settleOutcome={outcome}
        settleError={error?.message ?? null}
        settleErrorAction={error?.action ?? null}
        onSettle={onSettle}
        onNewSession={onNewSession}
      />
    </>
  );
}
