import { NextRequest, NextResponse } from "next/server";

import { getViewer, viewerIsOwner } from "@/lib/crew/auth";
import { localDay } from "@/lib/crew/time";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { clearHold, paymentBlock, SETTABLE_STATUSES, splitBalance, waiverCollectedFor, type BillFacts, type Hold } from "@/lib/accounting/payablesRules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Owners act on a bill: set its status, clear one hold, record a payment out.
// The rules (SOP-004) are in lib/accounting/payablesRules.ts: a held, void or
// expired-COI bill is never paid, a sub is paid only with the payer's word
// that the lien waiver for this payment is in hand, and a payment never
// records a waiver.

type BillRow = { id: string; kind: string; status: string; waiver_status: string; amount_cents: number; retainage_cents: number | null; sub_id: string | null };

async function factsOf(db: ReturnType<typeof getSupabaseAdmin>, billId: string): Promise<{ bill: BillRow; facts: BillFacts } | null> {
  const { data, error } = await db.from("bills").select("id,kind,status,waiver_status,amount_cents,retainage_cents,sub_id").eq("id", billId).maybeSingle();
  if (error) throw new Error(`bills read: ${error.message}`);
  if (!data) return null;
  const bill = data as BillRow;
  let coiExpired = false;
  let coiMissing = false;
  if (bill.sub_id) {
    const { data: sub, error: subErr } = await db.from("subs").select("coi_expires_on").eq("id", bill.sub_id).maybeSingle();
    if (subErr) throw new Error(`subs read: ${subErr.message}`);
    const on = (sub as { coi_expires_on: string | null } | null)?.coi_expires_on ?? null;
    coiMissing = !on;
    coiExpired = !on || on < localDay();
  }
  return { bill, facts: { kind: bill.kind, status: bill.status, waiverStatus: bill.waiver_status, coiExpired, coiMissing } };
}

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
  const found = await factsOf(db, billId);
  if (!found) return NextResponse.json({ ok: false, error: "No such bill." }, { status: 404 });
  const { bill, facts } = found;

  if (action === "update_bill") {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof body.clearHold === "string") {
      const hold = body.clearHold as Hold;
      if (!["waiver", "coi", "approval"].includes(hold)) return NextResponse.json({ ok: false, error: "Which hold: waiver, coi or approval?" }, { status: 400 });
      const cleared = clearHold(facts, hold);
      if ("error" in cleared) return NextResponse.json({ ok: false, error: cleared.error }, { status: 409 });
      Object.assign(patch, cleared.patch);
      if (hold === "approval") {
        patch.approved_by = actor;
        patch.approved_at = new Date().toISOString();
      }
    } else if (typeof body.status === "string") {
      if (!(SETTABLE_STATUSES as string[]).includes(body.status)) {
        return NextResponse.json({ ok: false, error: `A bill can be set to ${SETTABLE_STATUSES.join(", ")}.` }, { status: 400 });
      }
      if ((body.status === "open" || body.status === "scheduled") && paymentBlock({ ...facts, status: "open" })) {
        return NextResponse.json({ ok: false, error: `Clear the hold first: ${paymentBlock({ ...facts, status: "open" })}` }, { status: 409 });
      }
      patch.status = body.status;
      // On waiver hold means the waiver is owed again.
      if (body.status === "hold_waiver" && bill.kind === "sub") patch.waiver_status = "missing";
    } else {
      return NextResponse.json({ ok: false, error: "Nothing to change." }, { status: 400 });
    }
    const { error } = await db.from("bills").update(patch).eq("id", billId);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, status: patch.status ?? bill.status });
  }

  if (action === "record_payment") {
    const blocked = paymentBlock(facts);
    if (blocked) return NextResponse.json({ ok: false, error: blocked }, { status: 409 });
    const amountCents = Math.round(Number(body.amountCents ?? 0));
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      return NextResponse.json({ ok: false, error: "amountCents must be positive" }, { status: 400 });
    }
    const waiverCollected = waiverCollectedFor(bill.kind, body.waiverCollected);
    if (waiverCollected === null) {
      return NextResponse.json({ ok: false, error: "Confirm the sub's lien waiver for this payment is in hand (SOP-004)." }, { status: 400 });
    }
    // Retainage is held: a payment covers what is payable now, and goes into retainage only when an owner releases it.
    const { data: before, error: beforeErr } = await db.from("bill_payments").select("amount_cents").eq("bill_id", billId).is("voided_at", null);
    if (beforeErr) return NextResponse.json({ ok: false, error: beforeErr.message }, { status: 500 });
    const paidBefore = ((before ?? []) as { amount_cents: number }[]).reduce((a, r) => a + (Number(r.amount_cents) || 0), 0);
    const owed = splitBalance({ amountCents: bill.amount_cents, retainageCents: Number(bill.retainage_cents) || 0, paidCents: paidBefore, status: bill.status });
    if (amountCents > owed.balanceCents) {
      return NextResponse.json({ ok: false, error: `That is more than the bill's remaining balance (${(owed.balanceCents / 100).toFixed(2)}).` }, { status: 400 });
    }
    const releasing = amountCents > owed.payableNowCents;
    if (releasing && body.releaseRetainage !== true) {
      return NextResponse.json(
        { ok: false, error: `Only ${(owed.payableNowCents / 100).toFixed(2)} is payable now; ${(owed.retainageHeldCents / 100).toFixed(2)} is retainage. Release the retainage to pay it.` },
        { status: 409 },
      );
    }
    const method = typeof body.method === "string" ? body.method : "melio";
    const reference = typeof body.reference === "string" ? body.reference.trim() : "";

    const { error: payErr } = await db.from("bill_payments").insert({
      bill_id: billId,
      paid_on: localDay(),
      amount_cents: amountCents,
      method,
      reference,
      waiver_collected: waiverCollected,
      recorded_by: actor,
      note: releasing ? `Recorded by ${actor}; retainage released by ${actor} (${((amountCents - owed.payableNowCents) / 100).toFixed(2)})` : `Recorded by ${actor}`,
    });
    if (payErr) return NextResponse.json({ ok: false, error: payErr.message }, { status: 500 });

    const { data: paid, error: paidErr } = await db.from("bill_payments").select("amount_cents").eq("bill_id", billId).is("voided_at", null);
    if (paidErr) return NextResponse.json({ ok: false, error: paidErr.message }, { status: 500 });
    const totalPaid = ((paid ?? []) as { amount_cents: number }[]).reduce((a, r) => a + (Number(r.amount_cents) || 0), 0);
    const nextStatus = totalPaid >= bill.amount_cents && bill.amount_cents > 0 ? "paid" : "partial";

    // The status only: a payment is not a waiver, and a final waiver is recorded when it comes in.
    const { error: upErr } = await db.from("bills").update({ status: nextStatus, updated_at: new Date().toISOString() }).eq("id", billId);
    if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });

    return NextResponse.json({ ok: true, status: nextStatus, totalPaid });
  }

  return NextResponse.json({ ok: false, error: "unsupported action" }, { status: 400 });
}
