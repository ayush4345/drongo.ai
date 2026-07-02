export type AgentStep = {
  kind: "provider" | "tool_call" | "answer";
  label: string;
  detail?: string;
  tool?: string;
  service?: string;
  args?: Record<string, unknown>;
  served?: boolean;
  summary?: string;
  reason?: string;
};

export type ProviderInfo = {
  name: string;
  url: string;
};

export type AgentTurn = {
  id: string;
  userMessage: string;
  answer: string;
  provider: ProviderInfo;
  steps: AgentStep[];
  loading?: boolean;
};

export type ChatResponse = {
  ok: boolean;
  answer?: string;
  provider?: ProviderInfo;
  steps?: AgentStep[];
  calls?: Array<{
    tool: string;
    args?: Record<string, unknown>;
    served: boolean;
    result?: unknown;
    reason?: string;
  }>;
  error?: string;
};

export function formatToolAnswer(tool: string, result: unknown): string {
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

export function formatAgentAnswer(
  answer: string,
  calls?: ChatResponse["calls"],
): string {
  const served = calls?.filter((c) => c.served && c.result !== undefined) ?? [];
  if (served.length > 0) {
    return served.map((c) => formatToolAnswer(c.tool, c.result)).join("\n\n");
  }
  return answer;
}

export function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
