import { NextRequest, NextResponse } from "next/server";

import { getViewer, viewerIsOwner } from "@/lib/crew/auth";
import { localDay } from "@/lib/crew/time";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest) {
  const viewer = await getViewer();
  if (!(await viewerIsOwner(viewer))) {
    return NextResponse.json({ ok: false, error: "owner access required" }, { status: 403 });
  }
  const actor = "email" in viewer && typeof viewer.email === "string" ? viewer.email : "owner";

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const action = String(body.action ?? "");
  const billId = String(body.billId ?? "").trim();
  if (!billId) {
    return NextResponse.json({ ok: false, error: "billId is required" }, { status: 400 });
  }

  const db = getSupabaseAdmin();

  if (action === "update_bill") {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof body.status === "string") patch.status = body.status;
    if (body.waiverReceived === true) {
      patch.waiver_status = "conditional_received";
    }
    if (body.clearHold === true) {
      patch.status = "scheduled";
      patch.approved_by = actor;
      patch.approved_at = new Date().toISOString();
    }
    const { error } = await db.from("bills").update(patch).eq("id", billId);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === "record_payment") {
    const amountCents = Math.round(Number(body.amountCents ?? 0));
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      return NextResponse.json({ ok: false, error: "amountCents must be positive" }, { status: 400 });
    }
    const method = typeof body.method === "string" ? body.method : "melio";
    const reference = typeof body.reference === "string" ? body.reference.trim() : "";

    const { error: payErr } = await db.from("bill_payments").insert({
      bill_id: billId,
      paid_on: localDay(),
      amount_cents: amountCents,
      method,
      reference,
      waiver_collected: true,
      recorded_by: actor,
      note: `Recorded by ${actor}`,
    });
    if (payErr) return NextResponse.json({ ok: false, error: payErr.message }, { status: 500 });

    const [billRes, allPayRes] = await Promise.all([
      db.from("bills").select("amount_cents").eq("id", billId).maybeSingle(),
      db.from("bill_payments").select("amount_cents").eq("bill_id", billId).is("voided_at", null),
    ]);
    const totalBill = Number((billRes.data as { amount_cents?: number } | null)?.amount_cents ?? 0);
    const totalPaid = ((allPayRes.data ?? []) as { amount_cents: number }[]).reduce(
      (a, r) => a + (Number(r.amount_cents) || 0),
      0,
    );
    const nextStatus = totalPaid >= totalBill && totalBill > 0 ? "paid" : "partial";

    await db
      .from("bills")
      .update({
        status: nextStatus,
        waiver_status: nextStatus === "paid" ? "final_received" : "conditional_received",
        updated_at: new Date().toISOString(),
      })
      .eq("id", billId);

    return NextResponse.json({ ok: true, status: nextStatus, totalPaid });
  }

  return NextResponse.json({ ok: false, error: "unsupported action" }, { status: 400 });
}
