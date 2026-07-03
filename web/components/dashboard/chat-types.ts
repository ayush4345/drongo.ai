export type AgentStep = {
  kind: "gateway" | "tool_call" | "answer" | "provider_settlement" | "payment_total" | "provider" | "payment";
  label: string;
  detail?: string;
  tool?: string;
  service?: string;
  providerId?: string;
  args?: Record<string, unknown>;
  served?: boolean;
  summary?: string;
  reason?: string;
};

export type ProviderSettlement = {
  providerId: string;
  providerLabel: string;
  tool: string;
  turnCalls: number;
  turnBillable: string;
  sessionCalls: number;
  sessionBillable: string;
};

export type TurnPayment = {
  turnCalls: number;
  turnBillable: string;
  sessionCalls: number;
  sessionBillable: string;
  tokenSymbol: string;
  providers: ProviderSettlement[];
};

export type ProviderInfo = {
  name: string;
  url: string;
};

export type SettleStep = {
  kind: "proof" | "verify" | "transfer" | "done" | "skipped";
  label: string;
  detail?: string;
};

export type SettleOutcome = {
  ok: boolean;
  settled: boolean;
  reason?: string;
  steps: SettleStep[];
  settleTx?: string;
  totalUnits?: string;
  settlementAmount?: string;
  escrow?: string;
  tokenSymbol: string;
  error?: string;
};

/** Lifecycle of the UI-driven settlement + re-open flow. */
export type SettlePhase = "idle" | "settling" | "settled" | "opening" | "error";

/** The stages the sidebar animates through while a settlement is in flight. */
export const SETTLE_STAGES: { label: string; detail: string }[] = [
  {
    label: "Generating Groth16 settlement proof",
    detail: "Building the 13-signal circuit input from the final voucher",
  },
  {
    label: "Verifying proof on-chain",
    detail: "meteredverifier pairing check · settlement ≤ escrow · nullifier",
  },
  {
    label: "Executing split transfer",
    detail: "Paying the provider, refunding remaining escrow to the depositor",
  },
];

export type AgentTurn = {
  id: string;
  userMessage: string;
  answer: string;
  provider: ProviderInfo;
  steps: AgentStep[];
  payment?: TurnPayment;
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
  payment?: TurnPayment;
  error?: string;
};

const TOOL_PROVIDERS: Record<string, { id: string; label: string }> = {
  get_weather: { id: "weather-provider", label: "Weather" },
  get_crypto_price: { id: "crypto-provider", label: "Crypto price" },
  translate_text: { id: "translation-provider", label: "Translation" },
};

export function allProviderLabels(): string {
  return Object.values(TOOL_PROVIDERS)
    .map((p) => p.label)
    .join(", ");
}

export function gatewayStepDetail(gateway: { name: string; url: string }): string {
  return `${gateway.name} · ${gateway.url}\nProviders: ${allProviderLabels()}`;
}

export function formatBillable(raw: string, symbol: string): string {
  try {
    const n = BigInt(raw);
    if (n === 0n) return `0 ${symbol}`;
    return `${formatUnitsNumber(n)} ${symbol}`;
  } catch {
    return `${raw} ${symbol}`;
  }
}

function formatUnitsNumber(value: bigint, decimals = 7): string {
  const base = 10n ** BigInt(decimals);
  const whole = value / base;
  const frac = value % base;
  if (frac === 0n) return whole.toString();
  const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${whole}.${fracStr}`;
}

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

export function providerForTool(tool: string): { id: string; label: string } {
  return TOOL_PROVIDERS[tool] ?? { id: tool, label: tool };
}

/** Sum payment across completed turns in this chat (not the backend server session). */
export function sumChatPayments(turns: AgentTurn[]): TurnPayment | null {
  const completed = turns.filter((t) => t.payment && !t.loading);
  if (completed.length === 0) return null;

  const byProvider = new Map<string, ProviderSettlement>();
  let totalCalls = 0;
  let totalBillable = BigInt(0);
  let tokenSymbol = "XLM";

  for (const turn of completed) {
    const payment = turn.payment!;
    tokenSymbol = payment.tokenSymbol;
    totalCalls += payment.turnCalls;
    totalBillable += BigInt(payment.turnBillable);

    for (const prov of payment.providers) {
      if (prov.turnCalls === 0) continue;
      const prev = byProvider.get(prov.providerId) ?? {
        providerId: prov.providerId,
        providerLabel: prov.providerLabel,
        tool: prov.tool,
        turnCalls: 0,
        turnBillable: "0",
        sessionCalls: 0,
        sessionBillable: "0",
      };
      prev.turnCalls += prov.turnCalls;
      prev.turnBillable = (BigInt(prev.turnBillable) + BigInt(prov.turnBillable)).toString();
      prev.sessionCalls = prev.turnCalls;
      prev.sessionBillable = prev.turnBillable;
      byProvider.set(prov.providerId, prev);
    }
  }

  return {
    turnCalls: totalCalls,
    turnBillable: totalBillable.toString(),
    sessionCalls: totalCalls,
    sessionBillable: totalBillable.toString(),
    tokenSymbol,
    providers: [...byProvider.values()].sort((a, b) => a.providerLabel.localeCompare(b.providerLabel)),
  };
}

export function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
