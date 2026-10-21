import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getViewer, viewerIsOwner } from "@/lib/crew/auth";
import { isClock, isDay } from "@/lib/crew/time";
import { getJobRef } from "@/lib/jobs/hub";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  const viewer = await getViewer();
  if (!(await viewerIsOwner(viewer)) || viewer.kind !== "staff") {
    return NextResponse.json({ ok: false, error: "Owner seat required" }, { status: 403 });
  }
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
  const ref = b.job ? await getJobRef(b.job) : null;
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
      created_by: viewer.email,
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data.id });
}

export async function PATCH(req: NextRequest) {
  const viewer = await getViewer();
  if (!(await viewerIsOwner(viewer)) || viewer.kind !== "staff") {
    return NextResponse.json({ ok: false, error: "Owner seat required" }, { status: 403 });
  }
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues.map((i) => i.message).join("; ") },
      { status: 400 },
    );
  }
  const { id, status } = parsed.data;
  const { error } = await getSupabaseAdmin()
    .from("schedule_items")
    .update({
      status,
      done_at: status === "done" ? new Date().toISOString() : null,
      done_by: status === "done" ? viewer.email : "",
    })
    .eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
