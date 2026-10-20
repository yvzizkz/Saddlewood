import { NextRequest, NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireOwner } from "@/lib/crew/auth";
import { isDay } from "@/lib/crew/time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The lien-waiver register (0040): record a waiver we prepared or sent with an
// invoice (out), or one a sub gave us with a payment (in), and move it along.
// The waiver file itself stays where it is kept today (a document exhibit,
// OneDrive); the register holds the link.

const KINDS = ["conditional_progress", "unconditional_progress", "conditional_final", "unconditional_final"];
const STATUSES = ["required", "prepared", "sent", "received", "void"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The register's rows for one invoice (?document=) or one bill (?bill=). */
export async function GET(request: NextRequest) {
  const owner = await requireOwner(request);
  if (!owner) return NextResponse.json({ ok: false, error: "owners only" }, { status: 403 });
  const doc = request.nextUrl.searchParams.get("document");
  const bill = request.nextUrl.searchParams.get("bill");
  const id = doc ?? bill;
  if (!id || !UUID.test(id)) return NextResponse.json({ ok: false, error: "Which invoice or bill?" }, { status: 400 });
  const { data, error } = await getSupabaseAdmin()
    .from("lien_waivers")
    .select("id,direction,kind,status,amount_cents,received_on,file_url")
    .eq(doc ? "document_id" : "bill_id", id)
    .order("id", { ascending: true });
  if (error) throw new Error(`lien_waivers read: ${error.message}`);
  return NextResponse.json({ ok: true, waivers: data ?? [] });
}

export async function POST(request: NextRequest) {
  const owner = await requireOwner(request);
  if (!owner) return NextResponse.json({ ok: false, error: "owners only" }, { status: 403 });
  const b = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const direction = b.direction === "in" ? "in" : b.direction === "out" ? "out" : null;
  if (!direction) return NextResponse.json({ ok: false, error: "In or out?" }, { status: 400 });
  if (!KINDS.includes(String(b.kind))) return NextResponse.json({ ok: false, error: "Which kind of waiver?" }, { status: 400 });
  const target = direction === "out" ? b.documentId : b.billId;
  if (typeof target !== "string" || !UUID.test(target)) return NextResponse.json({ ok: false, error: direction === "out" ? "Which invoice?" : "Which bill?" }, { status: 400 });
  if (!Number.isInteger(b.amountCents) || (b.amountCents as number) < 0) return NextResponse.json({ ok: false, error: "The amount is in cents." }, { status: 400 });
  const status = STATUSES.includes(String(b.status)) ? String(b.status) : "prepared";
  const { data, error } = await getSupabaseAdmin()
    .from("lien_waivers")
    .insert({
      direction,
      kind: b.kind,
      document_id: direction === "out" ? target : null,
      bill_id: direction === "in" ? target : null,
      party: typeof b.party === "string" ? b.party.slice(0, 200) : "",
      amount_cents: b.amountCents,
      through_on: typeof b.throughOn === "string" && isDay(b.throughOn) ? b.throughOn : null,
      status,
      received_on: status === "received" ? new Date().toISOString().slice(0, 10) : null,
      file_url: typeof b.fileUrl === "string" ? b.fileUrl.slice(0, 1000) : "",
      created_by: owner.email,
    })
    .select("id")
    .single();
  if (error) throw new Error(`lien_waivers insert: ${error.message}`);
  return NextResponse.json({ ok: true, id: (data as { id: number }).id });
}

export async function PATCH(request: NextRequest) {
  const owner = await requireOwner(request);
  if (!owner) return NextResponse.json({ ok: false, error: "owners only" }, { status: 403 });
  const b = ((await request.json().catch(() => null)) ?? {}) as { id?: number; status?: string; fileUrl?: string };
  if (!Number.isInteger(b.id)) return NextResponse.json({ ok: false, error: "Which waiver?" }, { status: 400 });
  if (!b.status || !STATUSES.includes(b.status)) return NextResponse.json({ ok: false, error: "No such step." }, { status: 400 });
  const patch: Record<string, unknown> = { status: b.status };
  if (b.status === "received") patch.received_on = new Date().toISOString().slice(0, 10);
  if (typeof b.fileUrl === "string") patch.file_url = b.fileUrl.slice(0, 1000);
  const { error } = await getSupabaseAdmin().from("lien_waivers").update(patch).eq("id", b.id!);
  if (error) throw new Error(`lien_waivers update: ${error.message}`);
  return NextResponse.json({ ok: true });
}
