import { NextRequest, NextResponse } from "next/server";

import { voidPayment } from "@/lib/billing/payments";
import { authorizeBillingWrite } from "@/lib/billing/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A payment recorded in error is voided with a reason. It stays in the record.
// Owners only, signed in.

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await authorizeBillingWrite(request, { allowToken: false });
  if (gate.response) return gate.response;
  const who = gate.who;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  let reason = "";
  try {
    const body = await request.json();
    reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  if (!reason) return NextResponse.json({ ok: false, error: "voiding a payment needs a reason" }, { status: 400 });
  try {
    const done = await voidPayment(id, `${reason} (${who.actor})`);
    return done ? NextResponse.json({ ok: true }) : NextResponse.json({ ok: false, error: "not found, or already voided" }, { status: 404 });
  } catch (err) {
    console.error("void payment:", err);
    return NextResponse.json({ ok: false, error: "could not void" }, { status: 500 });
  }
}
