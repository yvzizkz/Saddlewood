import { NextRequest, NextResponse } from "next/server";

import { requireBridge, unauthorized } from "@/lib/bot/auth";
import { botPaymentSchema, recordBotPayment } from "@/lib/billing/botPayments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A Joist payment the bot confirmed (KB accounting.py, after Joist took it):
// one row in the app's payments too, applied to the invoice with that number
// (migration 0054). The bot's token only. Safe to send again.
//
//   201 recorded · 200 already recorded, or voided by an owner (stop sending)
//   404 no issued invoice with that number · 409 two of them, or it would
//   overpay what the app shows open (a person looks; nothing was written)

export async function POST(request: NextRequest) {
  const actor = await requireBridge(request);
  if (!actor) return unauthorized();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  const parsed = botPaymentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") }, { status: 400 });
  }
  try {
    const r = await recordBotPayment(parsed.data, actor);
    switch (r.status) {
      case "recorded":
        return NextResponse.json({ ok: true, status: r.status, payment: r.payment }, { status: 201 });
      case "already":
        return NextResponse.json({ ok: true, status: r.status, payment: r.payment });
      case "voided":
        return NextResponse.json({ ok: true, status: r.status, paymentId: r.paymentId });
      case "no_invoice":
        return NextResponse.json({ ok: false, status: r.status, error: r.detail }, { status: 404 });
      default:
        return NextResponse.json({ ok: false, status: r.status, error: r.detail }, { status: 409 });
    }
  } catch (err) {
    console.error("bot payments:", err);
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "could not record" }, { status: 500 });
  }
}
