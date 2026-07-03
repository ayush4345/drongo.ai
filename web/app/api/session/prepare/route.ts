import { NextResponse } from "next/server";

const AGENT_URL = process.env.AGENT_URL ?? "http://localhost:4022";

export async function GET() {
  try {
    const res = await fetch(`${AGENT_URL}/session/prepare`, { cache: "no-store" });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(
      { ok: false, error: "agent unreachable — start provider (4021) and consumer (4022)" },
      { status: 503 },
    );
  }
}
