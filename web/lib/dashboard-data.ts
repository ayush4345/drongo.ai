// Mock data for the Drongo AI dashboard.
//
// This is placeholder data so the UI can be built and navigated before it is
// wired to the real @drongo/agent harness. The shapes mirror the actual
// domain: agents open payment channels, meter calls off-chain against an
// escrow at a *private* rate, and settle once on Stellar with a ZK proof.
// Everything marked PRIVATE below is hidden on-chain in the real protocol and
// only ever known to the two agents — the dashboard is the owner's view.

export type AgentKind = "consumer" | "provider";
export type AgentStatus = "online" | "idle" | "offline";

export interface Agent {
  id: string;
  name: string;
  kind: AgentKind;
  status: AgentStatus;
  /** One-line description of what the agent does. */
  blurb: string;
  /** Consumer: the model brain. Provider: the metered service. */
  detail: string;
  /** Per-call price in USDC (provider's rate / consumer's paid rate). PRIVATE. */
  rateUsdc: number;
  activeChannels: number;
  /** Lifetime calls bought (consumer) or served (provider). */
  callsLifetime: number;
  /** USDC earned (provider) or spent (consumer), lifetime. */
  valueUsdc: number;
  /** Stellar account that pays gas / receives settlement. */
  address: string;
}

export type ChannelStatus = "metering" | "open" | "settling" | "closed";

export interface Channel {
  id: string;
  consumer: string;
  provider: string;
  service: string;
  status: ChannelStatus;
  /** Public on-chain. */
  escrowUsdc: number;
  /** PRIVATE — committed as Poseidon(rate, blind), never revealed. */
  rateUsdc: number;
  /** PRIVATE — the number of metered calls. */
  unitsServed: number;
  /** Public at close. null until settled. */
  settledUsdc: number | null;
  refundedUsdc: number | null;
  /** Public at close — prevents double-settlement. */
  nullifier: string | null;
  /** Public — Poseidon(rate, blind). */
  rateCommitment: string;
  proof: "verified" | "pending" | null;
  openedAt: string;
  closedAt: string | null;
}

export const agents: Agent[] = [
  {
    id: "atlas",
    name: "Atlas",
    kind: "consumer",
    status: "online",
    blurb: "LLM agent that buys live weather to answer travel questions.",
    detail: "OpenAI · gpt-4o-mini",
    rateUsdc: 0.002,
    activeChannels: 2,
    callsLifetime: 9261,
    valueUsdc: 16.52,
    address: "GATLAS5XQK7H2WZ4NMVB3J6YRD8C9PUTQF1S0LEKW2A4NXH7VQDM3CZP",
  },
  {
    id: "scout",
    name: "Scout",
    kind: "consumer",
    status: "idle",
    blurb: "Research agent that pulls FX + weather data for daily briefings.",
    detail: "OpenAI · gpt-4o",
    rateUsdc: 0.0015,
    activeChannels: 1,
    callsLifetime: 3040,
    valueUsdc: 6.36,
    address: "GSCOUT9D2KP4MWX7BVR1JTQ8YH6FN3CLE0AUS5ZXKD2VQ4P7MGW1HRB",
  },
  {
    id: "helios",
    name: "Helios",
    kind: "provider",
    status: "online",
    blurb: "Sells current weather per call via the keyless Open-Meteo API.",
    detail: "Weather API · Open-Meteo",
    rateUsdc: 0.002,
    activeChannels: 3,
    callsLifetime: 13110,
    valueUsdc: 24.71,
    address: "GHELIOS4VQ8K2WMX6BRJ7TND1YH5FP3CLE9AUS0ZXKD2VQ4P7MGW2TLR",
  },
  {
    id: "ledger",
    name: "Ledger",
    kind: "provider",
    status: "idle",
    blurb: "Sells real-time FX reference rates, priced per quote.",
    detail: "FX rates API",
    rateUsdc: 0.004,
    activeChannels: 1,
    callsLifetime: 1200,
    valueUsdc: 3.60,
    address: "GLEDGR7M2KX9WVQ4BPR1JTN8YH6FD3CLE0AUS5ZXK2DVQ4P7MGWH1BT",
  },
];

export const channels: Channel[] = [
  {
    id: "ch_8f2a3d",
    consumer: "Atlas",
    provider: "Helios",
    service: "Weather API · Open-Meteo",
    status: "metering",
    escrowUsdc: 0.1,
    rateUsdc: 0.002,
    unitsServed: 23,
    settledUsdc: null,
    refundedUsdc: null,
    nullifier: null,
    rateCommitment: "0x1f4c…a93e",
    proof: null,
    openedAt: "2026-06-26 09:41",
    closedAt: null,
  },
  {
    id: "ch_7c10b8",
    consumer: "Atlas",
    provider: "Helios",
    service: "Weather API · Open-Meteo",
    status: "closed",
    escrowUsdc: 20,
    rateUsdc: 0.002,
    unitsServed: 7431,
    settledUsdc: 14.862,
    refundedUsdc: 5.138,
    nullifier: "0x9b2e7af0…1c44",
    rateCommitment: "0x6a01…ff2d",
    proof: "verified",
    openedAt: "2026-06-25 14:02",
    closedAt: "2026-06-25 18:20",
  },
  {
    id: "ch_4b9166",
    consumer: "Scout",
    provider: "Helios",
    service: "Weather API · Open-Meteo",
    status: "closed",
    escrowUsdc: 5,
    rateUsdc: 0.0015,
    unitsServed: 1840,
    settledUsdc: 2.76,
    refundedUsdc: 2.24,
    nullifier: "0x4417cd92…8be1",
    rateCommitment: "0xb3d9…07a6",
    proof: "verified",
    openedAt: "2026-06-24 11:15",
    closedAt: "2026-06-24 16:48",
  },
  {
    id: "ch_9a3357",
    consumer: "Scout",
    provider: "Ledger",
    service: "FX rates API",
    status: "settling",
    escrowUsdc: 8,
    rateUsdc: 0.003,
    unitsServed: 1200,
    settledUsdc: null,
    refundedUsdc: null,
    nullifier: null,
    rateCommitment: "0x2c88…41fa",
    proof: "pending",
    openedAt: "2026-06-26 08:03",
    closedAt: null,
  },
  {
    id: "ch_2de701",
    consumer: "Atlas",
    provider: "Ledger",
    service: "FX rates API",
    status: "open",
    escrowUsdc: 2,
    rateUsdc: 0.004,
    unitsServed: 0,
    settledUsdc: null,
    refundedUsdc: null,
    nullifier: null,
    rateCommitment: "0x83be…12d7",
    proof: null,
    openedAt: "2026-06-26 09:58",
    closedAt: null,
  },
  {
    id: "ch_1f5524",
    consumer: "Atlas",
    provider: "Helios",
    service: "Weather API · Open-Meteo",
    status: "closed",
    escrowUsdc: 1,
    rateUsdc: 0.002,
    unitsServed: 415,
    settledUsdc: 0.83,
    refundedUsdc: 0.17,
    nullifier: "0x71aa39e4…c0d2",
    rateCommitment: "0x5d20…9e8c",
    proof: "verified",
    openedAt: "2026-06-23 19:30",
    closedAt: "2026-06-23 21:11",
  },
];

export function getChannel(id: string): Channel | undefined {
  return channels.find((c) => c.id === id);
}

export function getAgent(id: string): Agent | undefined {
  return agents.find((a) => a.id === id);
}

// ---- derived KPIs for the overview ---------------------------------------

export const kpis = {
  agents: agents.length,
  activeChannels: channels.filter((c) => c.status === "metering" || c.status === "open").length,
  callsMetered: channels.reduce((sum, c) => sum + c.unitsServed, 0),
  settledUsdc: channels.reduce((sum, c) => sum + (c.settledUsdc ?? 0), 0),
};

// ---- formatting helpers ----------------------------------------------------

/** USDC with up to 6 decimals, trailing zeros trimmed. */
export function usdc(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 });
}

export function shortAddr(addr: string): string {
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

// ---- live-usage simulation feed -------------------------------------------

export interface CallEvent {
  seq: number;
  time: string;
  location: string;
  summary: string;
  tempC: number;
  billableUsdc: number;
  cumulativeUsdc: number;
  voucher: string;
}

const CITIES = [
  "Tokyo", "London", "Cairo", "Reykjavík", "Nairobi", "Lima", "Oslo",
  "Mumbai", "Sydney", "Toronto", "Lisbon", "Seoul", "Athens", "Dubai",
  "Helsinki", "Bogotá", "Hanoi", "Quito", "Doha", "Riga",
];
const SUMMARIES = ["clear sky", "partly cloudy", "overcast", "light rain", "fog", "showers"];

function hashHex(seed: number): string {
  // deterministic-ish short hex purely for display
  let h = (seed * 2654435761) >>> 0;
  h ^= h >>> 13;
  h = (h * 1597334677) >>> 0;
  return "0x" + h.toString(16).padStart(8, "0").slice(0, 8) + "…";
}

/** The live demo channel: small escrow so the drawdown is watchable. */
export const liveSession = {
  channelId: "ch_8f2a3d",
  consumer: "Atlas",
  provider: "Helios",
  service: "Weather API · Open-Meteo",
  rateUsdc: 0.002,
  escrowUsdc: 0.1,
  get ceiling(): number {
    return Math.floor(this.escrowUsdc / this.rateUsdc);
  },
};

/** Build the Nth call event (1-indexed) for the live demo. */
export function makeCallEvent(seq: number): CallEvent {
  const city = CITIES[(seq - 1) % CITIES.length];
  const summary = SUMMARIES[(seq * 7) % SUMMARIES.length];
  const tempC = 4 + ((seq * 13) % 30);
  const billable = liveSession.rateUsdc;
  const now = new Date();
  const time = now.toLocaleTimeString("en-US", { hour12: false });
  return {
    seq,
    time,
    location: city,
    summary,
    tempC,
    billableUsdc: billable,
    cumulativeUsdc: +(billable * seq).toFixed(6),
    voucher: hashHex(seq),
  };
}
