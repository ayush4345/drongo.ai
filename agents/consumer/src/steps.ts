import type { CallRecord } from "./agent.js";

export interface ProviderInfo {
  name: string;
  url: string;
}

export interface AgentStep {
  kind: "provider" | "tool_call" | "answer";
  label: string;
  detail?: string;
  tool?: string;
  service?: string;
  args?: Record<string, unknown>;
  served?: boolean;
  summary?: string;
  reason?: string;
}

const SERVICE_LABELS: Record<string, string> = {
  get_weather: "Weather",
  get_crypto_price: "Crypto price",
  translate_text: "Translation",
};

function summarizeCall(tool: string, result: unknown): string {
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

export function buildAgentSteps(
  provider: ProviderInfo,
  calls: CallRecord[],
  answer: string,
): AgentStep[] {
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
      summary: call.served ? summarizeCall(call.tool, call.result) : undefined,
      reason: call.served ? undefined : call.reason,
      detail: call.served
        ? summarizeCall(call.tool, call.result)
        : (call.reason ?? "not served"),
    });
  }

  steps.push({
    kind: "answer",
    label: "Final answer",
    detail: answer,
  });

  return steps;
}
