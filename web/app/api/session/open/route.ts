import { NextRequest, NextResponse } from "next/server";

const AGENT_URL = process.env.AGENT_URL ?? "http://localhost:4022";
const PROVIDER_URL = process.env.PROVIDER_URL ?? "http://localhost:4021";

export async function POST(req: NextRequest) {
  let body: { walletAddress?: string; paymentHeader?: string } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    // Body is optional when the consumer signs server-side.
  }

  if (typeof body.paymentHeader === "string" && body.paymentHeader.trim().length > 0) {
    const res = await fetch(`${AGENT_URL}/session/open`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "PAYMENT-SIGNATURE": body.paymentHeader,
      },
      body: JSON.stringify({ paymentHeader: body.paymentHeader }),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  }

  // Server-side path: consumer uses DEPOSITOR_SECRET to sign x402 when no wallet header supplied.
  try {
    const res = await fetch(`${AGENT_URL}/session/open`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    return NextResponse.json({ ...data, providerUrl: PROVIDER_URL }, { status: res.status });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error:
          "agent unreachable — start provider (4021) and consumer (4022), or pass a wallet paymentHeader",
      },
      { status: 503 },
    );
  }
}
