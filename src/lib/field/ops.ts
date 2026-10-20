// Field operations: structured daily logs (SOP-006 App C), receipts normalized
// into `purchases` (+ worker reimbursement bills), pre-cover checklists per
// phase gating `phase.verify` (SOP-009), punch items per room/wall location,
// and directive/ASK intake into `work_items` (docs/COHESIVE-APP-PLAN.md §6.4).

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { normalizeJobName, TRADE_SLUGS, type Trade } from "@/lib/crew/purchases";
import { localDay } from "@/lib/crew/time";
import { OTHER_JOB } from "@/lib/crew/types";
import { jobHref, type JobRef } from "@/lib/jobs/hub";
import type { FeedItem } from "@/lib/tasks/feed";
import { placeItem } from "@/lib/tasks/feed";

export type ChecklistStage = "pre_cover" | "pre_board" | "pre_tape" | "pre_texture" | "pre_paint" | "final_walk";

export const CHECKLIST_STAGE_LABEL: Record<ChecklistStage, string> = {
  pre_cover: "1. Pre-cover (framing & backing)",
  pre_board: "2. Pre-board (insulation & MEP sign-off)",
  pre_tape: "3. Pre-tape (screw pattern & beads)",
  pre_texture: "4. Pre-texture (skim & inside corners)",
  pre_paint: "5. Pre-paint (500W raking-light check)",
  final_walk: "6. Final walk (punch & closeout)",
};

export type ChecklistItem = {
  key: string;
  label: string;
  checked: boolean;
  note: string;
};

export type ChecklistRow = {
  id: number;
  jobId: string;
  phaseId: number | null;
  phaseName: string;
  stage: ChecklistStage;
  stageLabel: string;
  locationLabel: string;
  items: ChecklistItem[];
  status: "open" | "passed" | "blocked";
  note: string;
  completedBy: string;
  completedAt: string | null;
};

export function defaultChecklistItems(stage: ChecklistStage): ChecklistItem[] {
  switch (stage) {
    case "pre_cover":
      return [
        { key: "studs_backing", label: "Stud spacing, heavy-gauge door bucks & TV/cabinet backing verified", checked: false, note: "" },
        { key: "mep_clearance", label: "MEP rough-in plates, nail guards & acoustic putty pads installed", checked: false, note: "" },
        { key: "firestop", label: "Top-of-wall fire caulk & rated shaft clips inspected", checked: false, note: "" },
        { key: "both_faces_photo", label: "Photos captured of both wall faces with room label visible", checked: false, note: "" },
      ];
    case "pre_board":
      return [
        { key: "insulation_r", label: "Thermal & sound attenuation batts installed full-cavity with zero voids", checked: false, note: "" },
        { key: "municipal_signoff", label: "Municipal framing & insulation pre-board inspection signed off", checked: false, note: "" },
        { key: "both_faces_photo", label: "Photos captured of both insulated wall faces with location label", checked: false, note: "" },
      ];
    case "pre_tape":
      return [
        { key: "screw_pattern", label: "Screw spacing & dimple depth verified (no torn face paper)", checked: false, note: "" },
        { key: "beads_straight", label: "Corner bead, L-bead & reveal beads laser-plumb and square", checked: false, note: "" },
        { key: "both_faces_photo", label: "Photos captured of hung board on both wall faces", checked: false, note: "" },
      ];
    case "pre_texture":
      return [
        { key: "joints_flat", label: "Butt joints & flats feathered wide with zero crowning", checked: false, note: "" },
        { key: "inside_corners", label: "Inside corners crisp, sanded and free of buildup", checked: false, note: "" },
        { key: "both_faces_photo", label: "Photos captured of taped walls prior to texture/skim", checked: false, note: "" },
      ];
    case "pre_paint":
      return [
        { key: "skim_holiday", label: "Zero holidays, lap marks or pinholes under 500W raking light", checked: false, note: "" },
        { key: "sanded_dusted", label: "Walls vacuum-sanded and wiped ready for PVA primer", checked: false, note: "" },
        { key: "both_faces_photo", label: "Photos captured of both wall faces under raking light", checked: false, note: "" },
      ];
    case "final_walk":
      return [
        { key: "touchups_done", label: "All blue-tape punch touch-ups complete and paint sheen uniform", checked: false, note: "" },
        { key: "site_clean", label: "Floors, window tracks & fixtures spotless; protection removed", checked: false, note: "" },
        { key: "closeout_photos", label: "Final completion photos uploaded for billing package", checked: false, note: "" },
      ];
  }
}

/** A field job id for a foreign key: "Other job" (OTHER_JOB) and none are no job. */
export function crewJobIdOf(jobId: string | null | undefined): string | null {
  return jobId && jobId !== OTHER_JOB ? jobId : null;
}

/**
 * Pure helper: a crew receipt entry as its `purchases` line, or null while it
 * has no amount (the line is written when the amount is answered).
 *
 * One owner per receipt (PR #32 review): this line is keyed exactly as the
 * Mac's push keys it (Saddlewood-KB bot/crew.py purchase_line: source "app",
 * source_key "app:<entry id>"), so the app's write and the bot's later push
 * land on the same row instead of two. A receipt paid out of pocket gets no
 * bill here: the bot books it as an expense marked to reimburse, and a second
 * bill in Payables would pay the worker twice. `reimbursementBill` stays in
 * the shape for callers and is always null.
 */
export function buildNormalizedReceiptPurchase(input: {
  entryId: number;
  day: string;
  jobId: string;
  jobName: string;
  billingJobId?: string | null;
  vendor: string;
  amountDollars: number | null;
  paidBy: "company" | "me";
  note: string;
  trade?: string;
  personName: string;
  personEmail: string;
}) {
  const cents = Math.max(0, Math.round((input.amountDollars ?? 0) * 100));
  const rawTrade = (input.trade ?? "").trim().toLowerCase();
  const trade: Trade = (TRADE_SLUGS as readonly string[]).includes(rawTrade) ? (rawTrade as Trade) : "general";
  const sourceKey = `app:${input.entryId}`;
  const vendor = input.vendor.trim() || "Home Depot";
  const description = input.note.trim() || `Field receipt (${vendor})`;

  const purchaseRow = cents <= 0 ? null : {
    source: "app" as const,
    source_key: sourceKey,
    purchased_on: input.day,
    vendor,
    store: "Field Receipt (App)",
    order_ref: `REC-${input.entryId}`,
    job_name_raw: input.jobName,
    job_key: normalizeJobName(input.jobName || input.jobId),
    // "Other job" is no job: the line waits in "Which job is this?" by its register name.
    job_id: crewJobIdOf(input.jobId),
    trade,
    trade_manual: Boolean(rawTrade),
    department: "FIELD RECEIPT",
    class: input.paidBy === "me" ? "REIMBURSEMENT" : "COMPANY CARD",
    sku: "FIELD-REC",
    description,
    qty: 1,
    line_total_cents: cents,
    meta: {
      runner: input.personName,
      email: input.personEmail,
      paidBy: input.paidBy,
      entryId: input.entryId,
    },
  };

  const reimbursementBill = null;

  return { purchaseRow, reimbursementBill };
}

/**
 * Pure helper: extracts CO intake (`co_price`) and owner Decision (`decision`)
 * work items from an EOD daily log's `asked`, `decision`, and `ASK:` lines.
 */
export function extractEodWorkItems(input: {
  entryId: number;
  day: string;
  jobId: string;
  jobName: string;
  billingJobId?: string | null;
  done: string;
  asked: string;
  decision: string;
  stuck: string;
  createdBy: string;
}) {
  const items: {
    kind: "co_price" | "decision";
    title: string;
    detail: string;
    role: "decisions";
    job_id: string | null;
    crew_job_id: string | null;
    due_on: string;
    escalate_days: number;
    source: string;
    href: string;
    created_by: string;
  }[] = [];

  const asked = input.asked.trim();
  if (asked.length >= 2) {
    items.push({
      kind: "co_price",
      title: `CO awaiting price · ${input.jobName}: ${asked.slice(0, 130)}`,
      detail: `Directive captured on ${input.day} EOD log (#${input.entryId}). Price before billing cutoff.`,
      role: "decisions",
      job_id: input.billingJobId ?? null,
      crew_job_id: crewJobIdOf(input.jobId),
      due_on: input.day,
      escalate_days: 2,
      source: `eod:asked:${input.entryId}`,
      href: crewJobIdOf(input.jobId) ? `/app/jobs/${encodeURIComponent(input.jobId)}?tab=changes` : "/app/tasks",
      created_by: input.createdBy,
    });
  }

  let decisionText = input.decision.trim();
  if (!decisionText) {
    const askLine = [input.done, input.stuck]
      .join("\n")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => /^ask\s*:/i.test(l));
    if (askLine) decisionText = askLine.replace(/^ask\s*:\s*/i, "").trim();
  }
  if (decisionText.length >= 2) {
    items.push({
      kind: "decision",
      title: `ASK · ${input.jobName}: ${decisionText.replace(/^ask\s*:\s*/i, "").slice(0, 130)}`,
      detail: `Rule? Logged in ${input.day} EOD check-in (#${input.entryId}).`,
      role: "decisions",
      job_id: input.billingJobId ?? null,
      crew_job_id: crewJobIdOf(input.jobId),
      due_on: input.day,
      escalate_days: 1,
      source: `eod:decision:${input.entryId}`,
      href: crewJobIdOf(input.jobId) ? `/app/jobs/${encodeURIComponent(input.jobId)}?tab=log` : "/app/tasks",
      created_by: input.createdBy,
    });
  }

  return items;
}

/**
 * Writes the receipt's purchase line (keyed as the bot keys it, see above).
 * Called when the receipt is filed and again when its amount is answered; a
 * line someone re-tagged or put on a job by hand keeps that. Never throws.
 */
export async function syncReceiptEntryToPurchases(input: Parameters<typeof buildNormalizedReceiptPurchase>[0]): Promise<void> {
  try {
    const db = getSupabaseAdmin();
    let billingJobId = input.billingJobId ?? null;
    if (!billingJobId && input.jobId) {
      const { data, error: jobErr } = await db.from("jobs").select("id").eq("crew_job_id", input.jobId).maybeSingle();
      if (jobErr) console.error("syncReceiptEntryToPurchases jobs lookup failed:", jobErr);
      billingJobId = (data as { id: string } | null)?.id ?? null;
    }
    const { purchaseRow } = buildNormalizedReceiptPurchase({ ...input, billingJobId });
    if (!purchaseRow) return;
    const row: Record<string, unknown> = { ...purchaseRow };
    const { data: existing, error: exErr } = await db.from("purchases").select("*").eq("source_key", purchaseRow.source_key).maybeSingle();
    if (exErr) console.error("syncReceiptEntryToPurchases purchases lookup failed:", exErr);
    const ex = existing as { trade?: string; trade_manual?: boolean; job_id?: string | null; job_manual?: boolean } | null;
    if (ex?.trade_manual && !purchaseRow.trade_manual) Object.assign(row, { trade: ex.trade, trade_manual: true });
    if (ex?.job_manual) row.job_id = ex.job_id ?? null;
    const { error: purchErr } = await db.from("purchases").upsert(row, { onConflict: "source_key" });
    if (purchErr) console.error("syncReceiptEntryToPurchases purchases upsert failed:", purchErr);
  } catch (err) {
    console.error("syncReceiptEntryToPurchases unexpected error:", err);
  }
}

/** Writes directive (`co_price`) and `ASK:` (`decision`) rows from an EOD log into `work_items` and `change_orders`. Never throws to caller. */
export async function syncEodDirectivesAndDecisions(input: Parameters<typeof extractEodWorkItems>[0]): Promise<void> {
  try {
    const db = getSupabaseAdmin();
    let billingJobId = input.billingJobId ?? null;
    if (!billingJobId && input.jobId) {
      const { data, error: jobErr } = await db.from("jobs").select("id").eq("crew_job_id", input.jobId).maybeSingle();
      if (jobErr) console.error("syncEodDirectivesAndDecisions jobs lookup failed:", jobErr);
      billingJobId = (data as { id: string } | null)?.id ?? null;
    }
    const items = extractEodWorkItems({ ...input, billingJobId });
    for (const item of items) {
      const { data: existing, error: selErr } = await db
        .from("work_items")
        .select("id")
        .eq("source", item.source)
        .eq("status", "open")
        .maybeSingle();
      if (selErr) console.error("syncEodDirectivesAndDecisions work_items lookup failed:", selErr);
      if (!existing) {
        const { error: insErr } = await db.from("work_items").insert(item);
        if (insErr && (insErr as { code?: string }).code !== "23505") {
          console.error("syncEodDirectivesAndDecisions work_items insert failed:", insErr);
        }
      }
    }
    const asked = input.asked.trim();
    if (asked.length >= 2) {
      const title = asked.slice(0, 200);
      const { data: existingCo, error: coSelErr } = await db
        .from("change_orders")
        .select("id")
        .eq("crew_job_id", input.jobId)
        .eq("title", title)
        .maybeSingle();
      if (coSelErr) console.error("syncEodDirectivesAndDecisions change_orders lookup failed:", coSelErr);
      if (!existingCo) {
        const { error: coErr } = await db.from("change_orders").insert({
          job_id: billingJobId,
          crew_job_id: input.jobId || null,
          title,
          detail: `Directive captured on ${input.day} EOD log (#${input.entryId}).`,
          source: "directive",
          requested_by: input.createdBy,
        });
        if (coErr) console.error("syncEodDirectivesAndDecisions change_orders insert failed:", coErr);
      }
    }
  } catch (err) {
    console.error("syncEodDirectivesAndDecisions unexpected error:", err);
  }
}

/**
 * Checks whether a phase has any unpassed quality checklists (`status <> 'passed'`).
 * Returns `[]` if all checklists on the phase are passed or if none exist.
 */
export async function unpassedChecklistsForPhase(phaseId: number): Promise<{ id: number; stageLabel: string; locationLabel: string; status: string }[]> {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from("checklists")
      .select("id,stage,location_label,status")
      .eq("phase_id", phaseId)
      .neq("status", "passed");
    if (error || !data) return [];
    return (data as { id: number; stage: ChecklistStage; location_label: string; status: string }[]).map((r) => ({
      id: r.id,
      stageLabel: CHECKLIST_STAGE_LABEL[r.stage] ?? r.stage,
      locationLabel: r.location_label,
      status: r.status,
    }));
  } catch {
    return [];
  }
}

/**
 * Detects active jobs that had crew shifts on `today` but no `eod` daily log filed yet (plan §6.4, A1).
 */
export async function loadMissingDailyLogs(refs: JobRef[], today = localDay()): Promise<FeedItem[]> {
  try {
    const db = getSupabaseAdmin();
    const [shiftsRes, eodsRes] = await Promise.all([
      db.from("crew_shifts").select("job_id,job_name,email").eq("day", today).eq("status", "ok"),
      db.from("crew_entries").select("job_id").eq("day", today).eq("kind", "eod"),
    ]);
    if (shiftsRes.error || !shiftsRes.data?.length) return [];
    const filedJobs = new Set(((eodsRes.data ?? []) as { job_id: string }[]).map((e) => e.job_id));
    const activeJobShifts = new Map<string, { jobName: string; count: number }>();
    for (const s of (shiftsRes.data ?? []) as { job_id: string; job_name: string }[]) {
      if (!s.job_id || filedJobs.has(s.job_id)) continue;
      const cur = activeJobShifts.get(s.job_id) ?? { jobName: s.job_name, count: 0 };
      cur.count++;
      activeJobShifts.set(s.job_id, cur);
    }
    const out: FeedItem[] = [];
    for (const [crewJobId, info] of activeJobShifts.entries()) {
      const ref = refs.find((r) => r.crewId === crewJobId || r.key === crewJobId);
      const jobKey = ref?.key ?? crewJobId;
      const jobName = ref?.name ?? info.jobName ?? crewJobId;
      out.push({
        id: `dlog:${today}:${crewJobId}`,
        source: "crew",
        kind: "daily_log",
        title: `File 6:00 PM daily log · ${jobName}`,
        detail: `${info.count} crew ${info.count === 1 ? "shift" : "shifts"} today with no EOD daily log filed yet (SOP-006 App C)`,
        role: "field_lead",
        assignee: "",
        jobKey,
        job: jobName,
        dueOn: today,
        since: today,
        ...placeItem("field_lead", today, 0, today),
        href: jobHref(jobKey, "log"),
        editable: false,
      });
    }
    return out;
  } catch {
    return [];
  }
}

export type DailyLogRow = {
  id: number;
  day: string;
  email: string;
  author: string;
  kind: "eod" | "progress" | "note";
  body: string;
  weather: string;
  crewCount: number | null;
  tradesOnSite: string;
  deliveries: string;
  visits: string;
  inspections: string;
  asked: string;
  decision: string;
  stuck: string;
  safety: string;
  photoCount: number;
  photoNames: string[];
};

export type FieldReceiptRow = {
  id: number;
  day: string;
  author: string;
  vendor: string;
  amountCents: number;
  paidBy: string;
  trade: string;
  description: string;
  tripHref: string;
};

export type PunchRow = {
  id: number;
  title: string;
  detail: string;
  location: string;
  assignee: string;
  dueOn: string | null;
  status: string;
};

export async function loadJobFieldOps(ref: JobRef) {
  const db = getSupabaseAdmin();
  const crewId = ref.crewId ?? ref.key;
  const [checklistsRes, phasesRes, entriesRes, peopleRes, punchRes] = await Promise.all([
    db.from("checklists").select("*").eq("job_id", crewId).order("id", { ascending: true }),
    db.from("crew_job_phases").select("id,ord,name,trade,verified_at").eq("job_id", crewId).order("ord", { ascending: true }),
    db.from("crew_entries").select("*").eq("job_id", crewId).order("day", { ascending: false }).order("id", { ascending: false }).limit(200),
    db.from("crew_people").select("email,name"),
    db
      .from("work_items")
      .select("id,title,detail,location,assignee,due_on,status")
      .eq("kind", "punch")
      .or(ref.billingId ? `crew_job_id.eq.${crewId},job_id.eq.${ref.billingId}` : `crew_job_id.eq.${crewId}`)
      .order("status", { ascending: false })
      .order("due_on", { ascending: true }),
  ]);

  const phaseMap = new Map(
    ((phasesRes.data ?? []) as { id: number; ord: number; name: string }[]).map((p) => [p.id, `${p.ord}. ${p.name}`]),
  );
  const personName = new Map(
    ((peopleRes.data ?? []) as { email: string; name: string | null }[]).map((p) => [p.email, p.name || p.email]),
  );

  type C = {
    id: number;
    job_id: string;
    phase_id: number | null;
    stage: ChecklistStage;
    location_label: string;
    items: ChecklistItem[];
    status: "open" | "passed" | "blocked";
    note: string;
    completed_by: string;
    completed_at: string | null;
  };
  const checklists: ChecklistRow[] = ((checklistsRes.data ?? []) as C[]).map((c) => ({
    id: c.id,
    jobId: c.job_id,
    phaseId: c.phase_id,
    phaseName: (c.phase_id && phaseMap.get(c.phase_id)) || "General",
    stage: c.stage,
    stageLabel: CHECKLIST_STAGE_LABEL[c.stage] ?? c.stage,
    locationLabel: c.location_label,
    items: Array.isArray(c.items) ? c.items : [],
    status: c.status,
    note: c.note,
    completedBy: c.completed_by,
    completedAt: c.completed_at,
  }));

  type E = {
    id: number;
    email: string;
    kind: string;
    day: string;
    body: string;
    data: Record<string, unknown>;
    files: { name?: string; type?: string }[];
  };
  const logs: DailyLogRow[] = [];
  const receipts: FieldReceiptRow[] = [];

  for (const e of (entriesRes.data ?? []) as E[]) {
    const author = personName.get(e.email) ?? e.email;
    const str = (k: string) => (typeof e.data?.[k] === "string" ? (e.data[k] as string) : "");
    if (e.kind === "receipt") {
      const amt = typeof e.data?.amount === "number" ? e.data.amount : 0;
      const customKey = str("normalizedPurchaseKey");
      const tripKey = customKey ? customKey.replace(/:[^:]*$/, "") : `app:entry:${e.id}`;
      receipts.push({
        id: e.id,
        day: e.day,
        author,
        vendor: str("vendor") || "Home Depot",
        amountCents: Math.round(amt * 100),
        paidBy: str("paidBy") === "me" ? "Worker (reimburse)" : "Company card",
        trade: str("trade") || "general",
        description: e.body || "Field receipt",
        tripHref: `/app/accounting/purchases/trip/${encodeURIComponent(tripKey)}`,
      });
    } else if (e.kind === "eod" || e.kind === "progress" || e.kind === "note") {
      const photos = (Array.isArray(e.files) ? e.files : []).filter((f) => !(f.type ?? "").startsWith("audio/"));
      logs.push({
        id: e.id,
        day: e.day,
        email: e.email,
        author,
        kind: e.kind as "eod" | "progress" | "note",
        body: e.body,
        weather: str("weather"),
        crewCount: typeof e.data?.crewCount === "number" ? e.data.crewCount : null,
        tradesOnSite: str("tradesOnSite"),
        deliveries: str("deliveries"),
        visits: str("visits"),
        inspections: str("inspections"),
        asked: str("asked"),
        decision: str("decision"),
        stuck: str("stuck"),
        safety: str("safety"),
        photoCount: photos.length,
        photoNames: photos.map((p) => p.name || "photo.jpg"),
      });
    }
  }

  type P = {
    id: number;
    title: string;
    detail: string;
    location: string;
    assignee: string;
    due_on: string | null;
    status: string;
  };
  const punch: PunchRow[] = ((punchRes.data ?? []) as P[]).map((p) => ({
    id: p.id,
    title: p.title,
    detail: p.detail,
    location: p.location || "General",
    assignee: p.assignee ? (personName.get(p.assignee) ?? p.assignee) : "Field lead",
    dueOn: p.due_on,
    status: p.status,
  }));

  const openPunchCount = punch.filter((p) => p.status === "open").length;
  const openChecklistCount = checklists.filter((c) => c.status !== "passed").length;

  return {
    checklists,
    phases: (phasesRes.data ?? []) as { id: number; ord: number; name: string; trade: string; verified_at: string | null }[],
    logs,
    receipts,
    punch,
    openPunchCount,
    openChecklistCount,
    closeoutReady: openPunchCount === 0 && openChecklistCount === 0,
  };
}
