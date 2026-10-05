import { NextRequest, NextResponse } from "next/server";

import { moneyOverview } from "@/lib/billing/overview";
import { authorizeOps } from "@/lib/ops/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Who owes what, for the bot and for scripts. Staff only; the screen is /app/money.
export async function GET(request: NextRequest) {
  const who = await authorizeOps(request);
  if (!who) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  try {
    return NextResponse.json({ ok: true, ...(await moneyOverview()) });
  } catch (err) {
    console.error("overview:", err);
    return NextResponse.json({ ok: false, error: "could not load" }, { status: 500 });
  }
}
