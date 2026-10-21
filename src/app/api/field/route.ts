import { NextResponse } from "next/server";

import { getViewer, viewerIsOwner } from "@/lib/crew/auth";
import { localDay } from "@/lib/crew/time";
import {
  CHECKLIST_STAGE_LABEL,
  defaultChecklistItems,
  syncEodDirectivesAndDecisions,
  syncReceiptEntryToPurchases,
  type ChecklistItem,
  type ChecklistStage,
} from "@/lib/field/ops";
import { getJobRef } from "@/lib/jobs/hub";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const STAGES: ChecklistStage[] = ["pre_cover", "pre_board", "pre_tape", "pre_texture", "pre_paint", "final_walk"];

export async function POST(req: Request) {
  const viewer = await getViewer();
  if (!(await viewerIsOwner(viewer)) || viewer.kind !== "staff") {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(body.action ?? "");
  const jobKey = String(body.job ?? "").trim();
  const ref = jobKey ? await getJobRef(jobKey) : null;
  if (!ref) return NextResponse.json({ error: "Pick a valid job" }, { status: 400 });
  const crewJobId = ref.crewId ?? ref.key;
  const db = getSupabaseAdmin();
  const today = localDay();

  if (action === "checklist.create") {
    const stage = String(body.stage ?? "pre_cover") as ChecklistStage;
    if (!STAGES.includes(stage)) return NextResponse.json({ error: "Invalid checklist stage" }, { status: 400 });
    const locationLabel = String(body.locationLabel ?? "").trim();
    const phaseId = typeof body.phaseId === "number" && body.phaseId > 0 ? body.phaseId : null;
    const { data, error } = await db
      .from("checklists")
      .insert({
        job_id: crewJobId,
        phase_id: phaseId,
        stage,
        location_label: locationLabel || "Main scope",
        items: defaultChecklistItems(stage),
        status: "open",
        note: String(body.note ?? "").trim(),
      })
      .select("id")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, id: (data as { id: number }).id, stageLabel: CHECKLIST_STAGE_LABEL[stage] });
  }

  if (action === "daily_log.add") {
    const done = String(body.done ?? "").trim();
    if (done.length < 2) return NextResponse.json({ error: "Describe what got done today" }, { status: 400 });
    const day = String(body.day ?? today).trim() || today;
    const weather = String(body.weather ?? "").trim();
    const crewCount = typeof body.crewCount === "number" ? body.crewCount : Number(body.crewCount) || null;
    const tradesOnSite = String(body.tradesOnSite ?? "").trim();
    const deliveries = String(body.deliveries ?? "").trim();
    const visits = String(body.visits ?? "").trim();
    const inspections = String(body.inspections ?? "").trim();
    const asked = String(body.asked ?? "").trim();
    const decision = String(body.decision ?? "").trim();
    const stuck = String(body.stuck ?? "").trim();
    const safety = String(body.safety ?? "").trim();

    const { data, error } = await db
      .from("crew_entries")
      .insert({
        email: viewer.email,
        kind: "eod",
        day,
        job_id: crewJobId,
        job_name: ref.name,
        body: done,
        data: {
          weather,
          crewCount,
          tradesOnSite,
          deliveries,
          visits,
          inspections,
          asked,
          decision,
          stuck,
          safety,
        },
        files: [],
        status: "new",
      })
      .select("id")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const entryId = (data as { id: number }).id;
    await syncEodDirectivesAndDecisions({
      entryId,
      day,
      jobId: crewJobId,
      jobName: ref.name,
      billingJobId: ref.billingId,
      done,
      asked,
      decision,
      stuck,
      createdBy: viewer.email,
    });
    return NextResponse.json({ ok: true, id: entryId });
  }

  if (action === "receipt.add") {
    const vendor = String(body.vendor ?? "Home Depot").trim() || "Home Depot";
    const amount = Number(body.amount ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: "Enter a receipt amount" }, { status: 400 });
    const paidBy = body.paidBy === "me" ? "me" : "company";
    const trade = String(body.trade ?? "general").trim();
    const note = String(body.note ?? "").trim() || `${vendor} field receipt`;
    const day = String(body.day ?? today).trim() || today;

    const { data, error } = await db
      .from("crew_entries")
      .insert({
        email: viewer.email,
        kind: "receipt",
        day,
        job_id: crewJobId,
        job_name: ref.name,
        body: note,
        data: { amount, vendor, paidBy, trade },
        files: [],
        status: "filed",
      })
      .select("id")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const entryId = (data as { id: number }).id;
    await syncReceiptEntryToPurchases({
      entryId,
      day,
      jobId: crewJobId,
      jobName: ref.name,
      billingJobId: ref.billingId,
      vendor,
      amountDollars: amount,
      paidBy,
      note,
      trade,
      personName: viewer.email,
      personEmail: viewer.email,
    });
    return NextResponse.json({ ok: true, id: entryId });
  }

  if (action === "punch.add") {
    const title = String(body.title ?? "").trim();
    if (title.length < 2) return NextResponse.json({ error: "Write the punch item" }, { status: 400 });
    const location = String(body.location ?? "").trim();
    const detail = String(body.detail ?? "").trim();
    const dueOn = String(body.dueOn ?? "").trim() || null;
    const { data, error } = await db
      .from("work_items")
      .insert({
        kind: "punch",
        title,
        detail,
        location,
        role: "field_lead",
        job_id: ref.billingId,
        crew_job_id: ref.crewId,
        due_on: dueOn,
        escalate_days: 2,
        source: "",
        href: `/app/jobs/${encodeURIComponent(ref.key)}?tab=log`,
        created_by: viewer.email,
      })
      .select("id")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, id: (data as { id: number }).id });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

export async function PATCH(req: Request) {
  const viewer = await getViewer();
  if (!(await viewerIsOwner(viewer)) || viewer.kind !== "staff") {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(body.action ?? "");
  const db = getSupabaseAdmin();

  if (action === "checklist.toggle") {
    const id = Number(body.id ?? 0);
    if (!id) return NextResponse.json({ error: "Missing checklist id" }, { status: 400 });
    const { data: row, error: readErr } = await db.from("checklists").select("*").eq("id", id).maybeSingle();
    if (readErr || !row) return NextResponse.json({ error: "Checklist not found" }, { status: 404 });
    const currentItems: ChecklistItem[] = Array.isArray((row as { items: unknown }).items) ? ((row as { items: ChecklistItem[] }).items) : [];
    const itemKey = typeof body.itemKey === "string" ? body.itemKey : null;
    const updatedItems = itemKey
      ? currentItems.map((it) => (it.key === itemKey ? { ...it, checked: !it.checked } : it))
      : currentItems;

    let nextStatus = typeof body.status === "string" && ["open", "passed", "blocked"].includes(body.status)
      ? (body.status as "open" | "passed" | "blocked")
      : ((row as { status: "open" | "passed" | "blocked" }).status);

    if (!body.status && itemKey) {
      const allChecked = updatedItems.length > 0 && updatedItems.every((i) => i.checked);
      nextStatus = allChecked ? "passed" : "open";
    }

    const patch: Record<string, unknown> = {
      items: updatedItems,
      status: nextStatus,
      updated_at: new Date().toISOString(),
    };
    if (nextStatus === "passed") {
      patch.completed_by = viewer.email;
      patch.completed_at = new Date().toISOString();
    } else {
      patch.completed_by = "";
      patch.completed_at = null;
    }
    const { error } = await db.from("checklists").update(patch).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, status: nextStatus });
  }

  if (action === "punch.status") {
    const id = Number(body.id ?? 0);
    const status = String(body.status ?? "done");
    if (!id || !["open", "done", "dropped"].includes(status)) {
      return NextResponse.json({ error: "Bad punch update" }, { status: 400 });
    }
    const { error } = await db
      .from("work_items")
      .update({
        status,
        done_at: status === "open" ? null : new Date().toISOString(),
        done_by: status === "open" ? "" : viewer.email,
      })
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
