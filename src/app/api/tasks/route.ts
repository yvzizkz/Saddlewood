import { NextRequest, NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireOwner } from "@/lib/crew/auth";
import { isDay } from "@/lib/crew/time";
import { getJobRef } from "@/lib/jobs/hub";
import { ROLES } from "@/lib/roles/seats";
import { KIND_LABEL } from "@/lib/tasks/feed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Work items (0033): hand a task to a role, close it, drop it, move it.
// Owners today; project managers get the same once their seats are wired
// (plan §7 Phase 2 step 10). Items from other sources are acted on where
// they live (their own screens), never here.

type Body = { id?: number; title?: string; detail?: string; kind?: string; role?: string; assignee?: string; job?: string; dueOn?: string | null; status?: string; escalateDays?: number };

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function POST(request: NextRequest) {
  const owner = await requireOwner(request);
  if (!owner) return NextResponse.json({ ok: false, error: "owners only" }, { status: 403 });
  const b = ((await request.json().catch(() => null)) ?? {}) as Body;
  const title = text(b.title, 200);
  if (!title) return NextResponse.json({ ok: false, error: "A task needs a title." }, { status: 400 });
  if (!b.role || !(ROLES as readonly string[]).includes(b.role)) return NextResponse.json({ ok: false, error: "Pick who it goes to." }, { status: 400 });
  const kind = b.kind && b.kind in KIND_LABEL ? b.kind : "task";
  if (b.dueOn && !isDay(b.dueOn)) return NextResponse.json({ ok: false, error: "That due date is not a day." }, { status: 400 });
  const job = b.job ? await getJobRef(b.job) : null;
  if (b.job && !job) return NextResponse.json({ ok: false, error: "No such job." }, { status: 400 });
  const { data, error } = await getSupabaseAdmin()
    .from("work_items")
    .insert({
      kind,
      title,
      detail: text(b.detail, 2000),
      role: b.role,
      assignee: text(b.assignee, 200).toLowerCase(),
      job_id: job?.billingId ?? null,
      crew_job_id: job?.crewId ?? null,
      due_on: b.dueOn || null,
      escalate_days: Number.isInteger(b.escalateDays) ? Math.max(0, Math.min(60, b.escalateDays!)) : 2,
      created_by: owner.email,
    })
    .select("id")
    .single();
  if (error) throw new Error(`work_items insert: ${error.message}`);
  return NextResponse.json({ ok: true, id: (data as { id: number }).id });
}

export async function PATCH(request: NextRequest) {
  const owner = await requireOwner(request);
  if (!owner) return NextResponse.json({ ok: false, error: "owners only" }, { status: 403 });
  const b = ((await request.json().catch(() => null)) ?? {}) as Body;
  if (!Number.isInteger(b.id)) return NextResponse.json({ ok: false, error: "Which task?" }, { status: 400 });
  const patch: Record<string, unknown> = {};
  if (b.status === "done" || b.status === "dropped" || b.status === "open") {
    patch.status = b.status;
    patch.done_at = b.status === "open" ? null : new Date().toISOString();
    patch.done_by = b.status === "open" ? "" : owner.email;
  }
  if (b.role !== undefined) {
    if (!(ROLES as readonly string[]).includes(b.role)) return NextResponse.json({ ok: false, error: "No such role." }, { status: 400 });
    patch.role = b.role;
  }
  if (b.assignee !== undefined) patch.assignee = text(b.assignee, 200).toLowerCase();
  if (b.dueOn !== undefined) {
    if (b.dueOn && !isDay(b.dueOn)) return NextResponse.json({ ok: false, error: "That due date is not a day." }, { status: 400 });
    patch.due_on = b.dueOn || null;
  }
  if (!Object.keys(patch).length) return NextResponse.json({ ok: false, error: "Nothing to change." }, { status: 400 });
  const { error } = await getSupabaseAdmin().from("work_items").update(patch).eq("id", b.id!);
  if (error) throw new Error(`work_items update: ${error.message}`);
  return NextResponse.json({ ok: true });
}
