"use client";

import { useState } from "react";
import AgentStepsSidebar from "./AgentStepsSidebar";
import ChatPanel from "./ChatPanel";
import type { AgentTurn } from "./chat-types";

export default function ChatShell() {
  const [turns, setTurns] = useState<AgentTurn[]>([]);
  const [activeTurnId, setActiveTurnId] = useState<string | null>(null);

  return (
    <>
      <section className="chat-panel" aria-label="Chat conversation">
        <ChatPanel
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

      <AgentStepsSidebar turns={turns} activeTurnId={activeTurnId} />
    </>
  );
}
