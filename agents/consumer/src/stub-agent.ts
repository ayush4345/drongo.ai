import type { ToolResult } from "@drongo/agent-core";
import type { AgentBrain, AgentDecision } from "./agent.js";
import type { ToolSpec } from "@drongo/agent-provider";

const COINS: Record<string, string> = {
  btc: "bitcoin", bitcoin: "bitcoin", eth: "ethereum", ethereum: "ethereum",
  xlm: "stellar", stellar: "stellar", sol: "solana", solana: "solana",
  usdc: "usd-coin", ada: "cardano", cardano: "cardano", doge: "dogecoin", dogecoin: "dogecoin",
};
const CURRENCIES: Record<string, string> = { usd: "usd", eur: "eur", gbp: "gbp", jpy: "jpy" };
const LANGS: Record<string, string> = {
  japanese: "ja", french: "fr", spanish: "es", german: "de", italian: "it",
  portuguese: "pt", hindi: "hi", chinese: "zh-CN", korean: "ko", russian: "ru", arabic: "ar",
};

/**
 * A deterministic, offline brain that ROUTES a goal to the right tools by
 * keyword — no LLM, no key, no network. It's good enough to demo multi-service
 * selection offline; the {@link OpenAiAgentBrain} does the real reasoning. It
 * emits all detected calls in the first round, then answers by summarising the
 * results it got back.
 */
export class StubAgentBrain implements AgentBrain {
  async decide(goal: string, _tools: ToolSpec[], gathered: ToolResult[]): Promise<AgentDecision> {
    if (gathered.length > 0) {
      const parts = gathered.map((g) => `${g.tool} → ${JSON.stringify(g.result)}`);
      return { answer: `Used ${gathered.length} paid service(s): ${parts.join("  |  ")}` };
    }

    const g = goal.toLowerCase();
    const words = g.split(/[^a-z0-9-]+/).filter((w) => w.length > 0);
    const calls: Array<{ tool: string; args: Record<string, unknown> }> = [];

    // crypto spot price
    const coin = words.map((w) => COINS[w]).find((c) => c !== undefined);
    if (coin !== undefined) {
      const vs = words.map((w) => CURRENCIES[w]).find((c) => c !== undefined) ?? "usd";
      calls.push({ tool: "get_crypto_price", args: { coin, vs } });
    }

    // translation
    if (g.includes("translat")) {
      const parsed = parseTranslation(goal);
      if (parsed !== null) calls.push({ tool: "translate_text", args: parsed });
    }

    // weather
    const weatherish = /weather|temperature|warm|forecast|climate|rain|hot|cold/.test(g);
    if (weatherish || calls.length === 0) {
      for (const place of extractPlaces(goal).slice(0, 3)) {
        calls.push({ tool: "get_weather", args: { location: place } });
      }
    }

    if (calls.length === 0) calls.push({ tool: "get_weather", args: { location: "London" } });
    return { calls };
  }
}

function parseTranslation(goal: string): { text: string; to: string } | null {
  const quoted = goal.match(/["'“”]([^"'“”]+)["'“”]/);
  const text = quoted?.[1]?.trim();

  let to: string | undefined;
  const lower = goal.toLowerCase();
  for (const [name, code] of Object.entries(LANGS)) {
    if (lower.includes(name)) {
      to = code;
      break;
    }
  }

  if (text === undefined || text.length === 0 || to === undefined) return null;
  return { text, to };
}

const NOISE = new Set([
  "Which", "What", "Where", "When", "The", "Is", "Are", "Or", "And", "For", "A", "An",
  "In", "Of", "To", "Into", "Compare", "Tell", "Me", "Current", "Weather", "Today",
  "Tomorrow", "City", "Price", "USD", "EUR", "GBP", "JPY", "ETH", "BTC", "XLM", "SOL",
  "Japanese", "French", "Spanish", "German", "Italian", "Portuguese", "Hindi", "Chinese",
  "Korean", "Russian", "Arabic", "Translate", "Good", "Morning",
]);

function extractPlaces(goal: string): string[] {
  const matches = goal.match(/\b([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)\b/g) ?? [];
  const out: string[] = [];
  for (const m of matches) {
    if (NOISE.has(m)) continue;
    if (!out.includes(m)) out.push(m);
  }
  return out;
}
