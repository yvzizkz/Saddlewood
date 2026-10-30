import { NextRequest, NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { nextChangeOrderNumberFor } from "@/lib/billing/coIntakeStore";
import { nextChangeOrderNumber } from "@/lib/billing/numbering";
import { CO_STATUS, type CoStatus } from "@/lib/billing/registers";
import { requireOwner } from "@/lib/crew/auth";
import { isDay } from "@/lib/crew/time";
import { jobForWrite, workSeat } from "@/lib/jobs/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The change-order register (0040). Record a request (from a directive, T&M or
// the client), price it, and move it along: sent, signed, billed. Owners
// price and approve (SOP-002, Who decides); the document itself is still made
// and sent from Billing like any other. A project manager records the request
// on their own jobs (the day it is asked for, SOP-002); pricing it is not theirs.

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

// The order a change order moves in; it never goes back except to rejected/void.
const NEXT: Record<CoStatus, CoStatus[]> = {
  requested: ["priced", "rejected", "void"],
  priced: ["sent", "signed", "rejected", "void"],
  sent: ["signed", "rejected", "void"],
  signed: ["billed", "void"],
  billed: [],
  rejected: ["requested"],
  void: [],
};

export async function POST(request: NextRequest) {
  const seat = await workSeat();
  if (!seat) return NextResponse.json({ ok: false, error: "owners and project managers only" }, { status: 403 });
  const b = ((await request.json().catch(() => null)) ?? {}) as { job?: string; title?: string; detail?: string; source?: string };
  const title = text(b.title, 200);
  if (!title) return NextResponse.json({ ok: false, error: "Say what the change is." }, { status: 400 });
  const job = b.job ? await jobForWrite(seat, b.job) : null;
  if (!job) return NextResponse.json({ ok: false, error: "Which job?" }, { status: seat.owner || !b.job ? 400 : 404 });
  const source = ["request", "directive", "tm", "field", "client"].includes(b.source ?? "") ? b.source : "request";
  const { data, error } = await getSupabaseAdmin()
    .from("change_orders")
    .insert({ job_id: job.billingId, crew_job_id: job.crewId, title, detail: text(b.detail, 2000), source, requested_by: seat.email })
    .select("id")
    .single();
  if (error) throw new Error(`change_orders insert: ${error.message}`);
  return NextResponse.json({ ok: true, id: (data as { id: number }).id });
}

export async function PATCH(request: NextRequest) {
  const owner = await requireOwner(request);
  if (!owner) return NextResponse.json({ ok: false, error: "owners only" }, { status: 403 });
  const b = ((await request.json().catch(() => null)) ?? {}) as { id?: number; status?: string; amountCents?: number; signedOn?: string; documentId?: string; billedDocumentId?: string; note?: string };
  if (!Number.isInteger(b.id)) return NextResponse.json({ ok: false, error: "Which change order?" }, { status: 400 });
  const db = getSupabaseAdmin();
  const { data: row, error: readErr } = await db.from("change_orders").select("id,status,number,job_id,amount_cents").eq("id", b.id!).maybeSingle();
  if (readErr) throw new Error(`change_orders read: ${readErr.message}`);
  if (!row) return NextResponse.json({ ok: false, error: "No such change order." }, { status: 404 });
  const cur = row as { status: CoStatus; number: string; job_id: string | null; amount_cents: number | null };
  const patch: Record<string, unknown> = {};

  if (b.amountCents !== undefined) {
    if (!Number.isInteger(b.amountCents) || b.amountCents < 0) return NextResponse.json({ ok: false, error: "The price is in cents, zero or more." }, { status: 400 });
    patch.amount_cents = b.amountCents;
  }
  if (b.status !== undefined) {
    if (!(CO_STATUS as readonly string[]).includes(b.status)) return NextResponse.json({ ok: false, error: "No such step." }, { status: 400 });
    const to = b.status as CoStatus;
    if (to !== cur.status && !NEXT[cur.status].includes(to)) return NextResponse.json({ ok: false, error: `A ${cur.status} change order cannot go to ${to}.` }, { status: 409 });
    if (to !== "requested" && to !== "rejected" && to !== "void" && (patch.amount_cents ?? cur.amount_cents) === null) {
      return NextResponse.json({ ok: false, error: "Price it first." }, { status: 400 });
    }
    patch.status = to;
    if (to === "priced") {
      patch.priced_at = new Date().toISOString();
      patch.priced_by = owner.email;
      // Its number when it is first priced, unless intake already gave it one (8009-CO7 on a job with a prefix, else CO-n).
      if (!cur.number) {
        if (cur.job_id) {
          const { data: job } = await db.from("jobs").select("number_prefix").eq("id", cur.job_id).maybeSingle();
          patch.number = await nextChangeOrderNumberFor(cur.job_id, (job as { number_prefix?: string | null } | null)?.number_prefix ?? "");
        } else {
          const { data: used } = await db.from("change_orders").select("number").is("job_id", null);
          patch.number = nextChangeOrderNumber(((used ?? []) as { number: string }[]).map((x) => x.number).filter(Boolean));
        }
      }
    }
    if (to === "signed") patch.signed_on = b.signedOn && isDay(b.signedOn) ? b.signedOn : new Date().toISOString().slice(0, 10);
  }
  if (b.documentId) patch.document_id = b.documentId;
  if (b.billedDocumentId) patch.billed_document_id = b.billedDocumentId;
  if (b.note !== undefined) patch.note = text(b.note, 2000);
  if (!Object.keys(patch).length) return NextResponse.json({ ok: false, error: "Nothing to change." }, { status: 400 });
  const { error } = await db.from("change_orders").update(patch).eq("id", b.id!);
  if (error) throw new Error(`change_orders update: ${error.message}`);
  return NextResponse.json({ ok: true, number: patch.number ?? cur.number });
}
