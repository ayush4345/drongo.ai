"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  calls?: Array<{
    tool: string;
    served: boolean;
    result?: unknown;
    reason?: string;
  }>;
};

type ChatResponse = {
  ok: boolean;
  answer?: string;
  calls?: ChatMessage["calls"];
  error?: string;
};

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatToolCallSummary(
  tool: string,
  result: unknown,
): string {
  if (result === null || typeof result !== "object") return String(result);
  const r = result as Record<string, unknown>;

  if (tool === "get_weather") {
    return `${r.location}: ${r.temperatureC}°C, ${r.summary ?? "—"}`;
  }
  if (tool === "get_crypto_price") {
    return `${r.coin ?? r.id}: ${r.price ?? r.usd}`;
  }
  if (tool === "translate_text") {
    return String(r.translatedText ?? r.text ?? "—");
  }
  return JSON.stringify(result);
}

function formatToolAnswer(tool: string, result: unknown): string {
  if (result === null || typeof result !== "object") return String(result);
  const r = result as Record<string, unknown>;

  if (tool === "get_weather") {
    const location = r.location ?? "Unknown";
    const temp = r.temperatureC;
    const summary = r.summary ?? "unknown conditions";
    const wind = r.windKph;
    return `Weather in ${location}: ${temp}°C, ${summary}${wind !== undefined ? `, wind ${wind} km/h` : ""}.`;
  }
  if (tool === "get_crypto_price") {
    const coin = r.coin ?? r.id ?? "asset";
    const price = r.price ?? r.usd;
    const change = r.change24h ?? r.change_24h;
    const suffix = change !== undefined ? ` (${Number(change) >= 0 ? "+" : ""}${change}% 24h)` : "";
    return `${coin} price: ${price}${suffix}.`;
  }
  if (tool === "translate_text") {
    return `Translation: ${r.translatedText ?? r.text ?? "—"}`;
  }
  return JSON.stringify(result);
}

function formatAgentAnswer(answer: string, calls?: ChatMessage["calls"]): string {
  const served = calls?.filter((c) => c.served && c.result !== undefined) ?? [];
  if (served.length > 0) {
    return served.map((c) => formatToolAnswer(c.tool, c.result)).join("\n\n");
  }
  return answer;
}

export default function ChatPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<"ready" | "loading" | "error">("ready");
  const [statusNote, setStatusNote] = useState("Ready");
  const [agentOnline, setAgentOnline] = useState<boolean | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
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

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || status === "loading") return;

    setMessages((prev) => [...prev, { id: uid(), role: "user", content: trimmed }]);
    setInput("");
    setStatus("loading");
    setStatusNote("Thinking…");

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: trimmed }),
      });
      const data = (await res.json()) as ChatResponse;

      if (!res.ok || !data.ok || !data.answer) {
        throw new Error(data.error ?? `Request failed (${res.status})`);
      }

      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: "assistant",
          content: formatAgentAnswer(data.answer!, data.calls),
          calls: data.calls,
        },
      ]);
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
      setAgentOnline(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void sendMessage(input);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage(input);
    }
  }

  const empty = messages.length === 0;

  return (
    <>
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
                {m.calls && m.calls.length > 0 && (
                  <ul className="chat-tool-calls">
                    {m.calls.map((c, i) => (
                      <li key={i}>
                        <span className={c.served ? "paid" : "skipped"}>
                          {c.served ? "paid" : "skipped"}
                        </span>{" "}
                        {c.tool}
                        {c.served && c.result !== undefined
                          ? ` · ${formatToolCallSummary(c.tool, c.result)}`
                          : c.reason
                            ? ` (${c.reason})`
                            : ""}
                      </li>
                    ))}
                  </ul>
                )}
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
          id="chat-input"
          ref={textareaRef}
          name="message"
          placeholder="Ask anything"
          autoComplete="off"
          rows={1}
          value={input}
          disabled={status === "loading"}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <button type="submit" aria-label="Send message" disabled={status === "loading" || !input.trim()}>
          <span aria-hidden="true">↑</span>
        </button>
      </form>
    </>
  );
}
