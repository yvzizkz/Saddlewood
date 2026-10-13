import { NextRequest, NextResponse } from "next/server";

import { deliver } from "@/lib/billing/deliver";
import { authorizeBillingWrite } from "@/lib/billing/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A note from accounting@ with no document behind it: to our own people only,
// since there is no client whose contacts could vouch for an outside address.
// Owners, or the Mac's billing_send.py; preview unless confirmed (src/lib/billing/deliver.ts).

export async function POST(request: NextRequest) {
  const gate = await authorizeBillingWrite(request, { allowToken: true });
  if (gate.response) return gate.response;
  const who = gate.who;

  let input: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    input = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  try {
    const result = await deliver(who.actor, null, input);
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    console.error("billing mail:", err);
    return NextResponse.json({ ok: false, error: "could not send" }, { status: 500 });
  }
}
