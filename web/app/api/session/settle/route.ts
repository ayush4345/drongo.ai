import { NextResponse } from "next/server";

const AGENT_URL = process.env.AGENT_URL ?? "http://localhost:4022";

export async function POST() {
  try {
    const res = await fetch(`${AGENT_URL}/session/settle`, {
      method: "POST",
      headers: { "content-type": "application/json" },
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(
      { ok: false, error: "agent unreachable — start the consumer server on :4022" },
      { status: 503 },
    );
  }
}
