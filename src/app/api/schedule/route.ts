import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { isClock, isDay } from "@/lib/crew/time";
import { jobForWrite, PM_ROLES, seesJob, workSeat } from "@/lib/jobs/access";
import { getJobRef } from "@/lib/jobs/hub";
import type { Role } from "@/lib/roles/seats";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Schedule items (0034): inspections, site visits, deliveries, meetings, sub
// mobilizations. Owners, on any job or none. A project manager
// (jobs/access.ts) puts them on their own jobs for their seat or the field
// lead, and marks done or cancels what is on those jobs.

const noSeat = () => NextResponse.json({ ok: false, error: "owners and project managers only" }, { status: 403 });
const noJob = () => NextResponse.json({ ok: false, error: "No such job." }, { status: 404 });

const createSchema = z.object({
  kind: z.enum(["inspection", "site_visit", "delivery", "meeting", "sub_mobilization"]).default("inspection"),
  title: z.string().trim().min(2, "name the schedule event").max(200),
  detail: z.string().trim().max(1500).default(""),
  job: z.string().trim().max(80).default(""),
  startDay: z.string().refine(isDay, "startDay must be YYYY-MM-DD"),
  endDay: z
    .string()
    .refine((v) => !v || isDay(v), "endDay must be YYYY-MM-DD")
    .default(""),
  startTime: z
    .string()
    .refine((v) => !v || isClock(v), "startTime must be HH:MM")
    .default(""),
  role: z.enum(["decisions", "sales", "finance", "ops", "pm", "field_lead"]).default("pm"),
  who: z.string().trim().max(120).default(""),
});

const patchSchema = z.object({
  id: z.number().int().min(1),
  status: z.enum(["scheduled", "done", "cancelled"]),
});

export async function POST(req: NextRequest) {
  const seat = await workSeat();
  if (!seat) return noSeat();
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues.map((i) => i.message).join("; ") },
      { status: 400 },
    );
  }
  const b = parsed.data;
  const endDay = b.endDay || b.startDay;
  if (endDay < b.startDay) {
    return NextResponse.json({ ok: false, error: "endDay cannot be earlier than startDay" }, { status: 400 });
  }
  if (!seat.owner && !PM_ROLES.includes(b.role as Role)) {
    return NextResponse.json({ ok: false, error: "A project manager schedules for the PM or the field lead." }, { status: 403 });
  }
  // A project manager's go on one of their jobs; an owner's on any job, or none.
  if (!seat.owner && !b.job) return noJob();
  const ref = b.job ? (seat.owner ? await getJobRef(b.job) : await jobForWrite(seat, b.job)) : null;
  if (b.job && !ref) return seat.owner ? NextResponse.json({ ok: false, error: "No such job." }, { status: 400 }) : noJob();
  const { data, error } = await getSupabaseAdmin()
    .from("schedule_items")
    .insert({
      kind: b.kind,
      title: b.title,
      detail: b.detail,
      job_id: ref?.billingId ?? null,
      crew_job_id: ref?.crewId ?? null,
      start_day: b.startDay,
      end_day: endDay,
      start_time: b.startTime,
      role: b.role,
      who: b.who,
      status: "scheduled",
      created_by: seat.email,
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data.id });
}

export async function PATCH(req: NextRequest) {
  const seat = await workSeat();
  if (!seat) return noSeat();
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues.map((i) => i.message).join("; ") },
      { status: 400 },
    );
  }
  const { id, status } = parsed.data;
  const db = getSupabaseAdmin();
  if (!seat.owner) {
    // Only what is on their jobs; a company-wide item is the owners'.
    const { data: cur } = await db.from("schedule_items").select("job_id,crew_job_id").eq("id", id).maybeSingle();
    const it = cur as { job_id: string | null; crew_job_id: string | null } | null;
    if (!it || !(it.job_id || it.crew_job_id) || !seesJob(seat, { billingId: it.job_id, crewId: it.crew_job_id })) {
      return NextResponse.json({ ok: false, error: "No such schedule item." }, { status: 404 });
    }
  }
  const { error } = await db
    .from("schedule_items")
    .update({
      status,
      done_at: status === "done" ? new Date().toISOString() : null,
      done_by: status === "done" ? seat.email : "",
    })
    .eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
