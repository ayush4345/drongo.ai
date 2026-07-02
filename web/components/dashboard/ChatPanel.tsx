"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import {
  type AgentStep,
  type AgentTurn,
  type ChatResponse,
  type ProviderInfo,
  formatAgentAnswer,
  formatToolAnswer,
  uid,
} from "./chat-types";

function buildFallbackSteps(
  provider: ProviderInfo,
  calls: NonNullable<ChatResponse["calls"]>,
  answer: string,
): AgentStep[] {
  const SERVICE_LABELS: Record<string, string> = {
    get_weather: "Weather",
    get_crypto_price: "Crypto price",
    translate_text: "Translation",
  };

  const steps: AgentStep[] = [
    {
      kind: "provider",
      label: "Connected to provider",
      detail: `${provider.name} · ${provider.url}`,
    },
  ];

  for (const [index, call] of calls.entries()) {
    const service = SERVICE_LABELS[call.tool] ?? call.tool;
    steps.push({
      kind: "tool_call",
      label: `Call ${index + 1}: ${service}`,
      tool: call.tool,
      service,
      args: call.args,
      served: call.served,
      summary: call.served ? formatToolAnswer(call.tool, call.result) : undefined,
      reason: call.reason,
      detail: call.served
        ? formatToolAnswer(call.tool, call.result)
        : (call.reason ?? "not served"),
    });
  }

  steps.push({ kind: "answer", label: "Final answer", detail: answer });
  return steps;
}

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type Props = {
  onTurnStart: (turn: AgentTurn) => void;
  onTurnComplete: (turn: AgentTurn) => void;
};

function resizeTextarea(el: HTMLTextAreaElement) {
  el.style.height = "auto";
  el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
}

export default function ChatPanel({ onTurnStart, onTurnComplete }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<"ready" | "loading" | "error">("ready");
  const [statusNote, setStatusNote] = useState("Ready");
  const [agentOnline, setAgentOnline] = useState<boolean | null>(null);
  const [inputKey, setInputKey] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sendingRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/chat")
      .then((res) => res.json())
      .then((data: { ok?: boolean }) => {
        if (!cancelled) setAgentOnline(Boolean(data.ok));
      })
      .catch(() => {
        if (!cancelled) setAgentOnline(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, status]);

  function readInput(): string {
    return textareaRef.current?.value ?? "";
  }

  function clearInput() {
    setInputKey((k) => k + 1);
  }

  async function sendMessage() {
    const trimmed = readInput().trim();
    if (!trimmed || sendingRef.current || status === "loading") return;

    sendingRef.current = true;
    const turnId = uid();
    setMessages((prev) => [...prev, { id: uid(), role: "user", content: trimmed }]);
    clearInput();
    setStatus("loading");
    setStatusNote("Thinking…");

    onTurnStart({
      id: turnId,
      userMessage: trimmed,
      answer: "",
      provider: { name: "drongo-provider", url: "…" },
      steps: [],
      loading: true,
    });

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: trimmed }),
      });
      const data = (await res.json()) as ChatResponse;

      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? `Request failed (${res.status})`);
      }

      const answer = formatAgentAnswer(data.answer ?? "", data.calls);
      if (!answer) {
        throw new Error("Agent returned an empty response");
      }

      const provider = data.provider ?? { name: "drongo-provider", url: "http://localhost:4021" };
      const steps = data.steps ?? buildFallbackSteps(provider, data.calls ?? [], answer);

      setMessages((prev) => [...prev, { id: uid(), role: "assistant", content: answer }]);
      onTurnComplete({
        id: turnId,
        userMessage: trimmed,
        answer,
        provider,
        steps,
        loading: false,
      });
      setStatus("ready");
      setStatusNote("Ready");
      setAgentOnline(true);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Something went wrong";
      setStatus("error");
      setStatusNote("Error");
      setMessages((prev) => [
        ...prev,
        { id: uid(), role: "assistant", content: `Could not reach the agent: ${msg}` },
      ]);
      onTurnComplete({
        id: turnId,
        userMessage: trimmed,
        answer: msg,
        provider: { name: "—", url: "—" },
        steps: [{ kind: "answer", label: "Error", detail: msg }],
        loading: false,
      });
      setAgentOnline(false);
    } finally {
      sendingRef.current = false;
    }
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    void sendMessage();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void sendMessage();
    }
  }

  const empty = messages.length === 0;

  return (
    <div className="chat-panel-layout">
      <header className="chat-header">
        <div className="chat-title">
          <span className="eyebrow">Chatbot</span>
          <span className="chat-heading">Agent chat</span>
        </div>
        <span className={`status${status !== "ready" ? ` status-${status}` : ""}`}>{statusNote}</span>
      </header>

      <div className="chat-body" ref={scrollRef} aria-live="polite">
        {empty ? (
          <div className="chat-empty" aria-label="Empty conversation">
            <h2>What can I help with?</h2>
            <p>
              Ask about weather, crypto prices, or translations — the agent picks paid tools and
              meters each call over x402.
            </p>
            {agentOnline === false && (
              <p className="chat-offline">
                Agent offline. Start the provider and consumer servers, then refresh.
              </p>
            )}
          </div>
        ) : (
          <ol className="chat-messages">
            {messages.map((m) => (
              <li key={m.id} className={`chat-msg chat-msg-${m.role}`}>
                <span className="chat-msg-role">{m.role === "user" ? "You" : "Agent"}</span>
                <p className="chat-msg-text">{m.content}</p>
              </li>
            ))}
            {status === "loading" && (
              <li className="chat-msg chat-msg-assistant chat-msg-pending" aria-busy="true">
                <span className="chat-msg-role">Agent</span>
                <p className="chat-msg-text">Running metered tools…</p>
              </li>
            )}
          </ol>
        )}
      </div>

      <form className="chat-composer" aria-label="Chat input" onSubmit={onSubmit}>
        <label className="sr-only" htmlFor="chat-input">
          Ask anything
        </label>
        <textarea
          key={inputKey}
          id="chat-input"
          ref={textareaRef}
          name="message"
          placeholder="Ask anything"
          autoComplete="off"
          rows={1}
          disabled={status === "loading"}
          onInput={(e) => {
            resizeTextarea(e.currentTarget);
            if (status === "error") {
              setStatus("ready");
              setStatusNote("Ready");
            }
          }}
          onKeyDown={onKeyDown}
        />
        <button type="submit" aria-label="Send message" disabled={status === "loading"}>
          <span aria-hidden="true">↑</span>
        </button>
      </form>
    </div>
  );
}
