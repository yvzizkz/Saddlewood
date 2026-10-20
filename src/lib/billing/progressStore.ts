// Progress billing, server side: the job's schedule of values with what is
// billed to date on each line, and creating a draw as a draft invoice.
// Server only. The math is in progress.ts.

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { localDay } from "@/lib/crew/time";
import type { SovLine } from "@/lib/sales/award";
import { createDraft, usedNumbers } from "./documents";
import { nextNumber } from "./numbering";
import { checkReport, computeDraw, drawInvoiceLines, shareOf, type Draw, type PmReport, type ProgressLine } from "./progress";
import type { BillingProfile } from "./types";

/**
 * One SOV line as stored. Award writes { description, amountCents, kind };
 * lines carried in by hand may read { label, cents, billedPct }. Both bill the same.
 */
export function sovLineOf(raw: unknown): { description: string; amountCents: number; billedPct: number } | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const description = String(r.description ?? r.label ?? "").trim();
  const amountCents = Number(r.amountCents ?? r.cents ?? 0);
  if (!description || !Number.isFinite(amountCents)) return null;
  const billedPct = Number(r.billedPct ?? 0);
  return { description, amountCents: Math.round(amountCents), billedPct: billedPct > 0 && billedPct <= 100 ? billedPct : 0 };
}

export class ProgressError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409,
  ) {
    super(message);
  }
}

type JobRow = { id: string; name: string; address: string | null; client_id: string | null; number_prefix: string | null; billing: Record<string, unknown> | null };

export type ProgressState = {
  jobId: string;
  jobName: string;
  clientId: string | null;
  lines: ProgressLine[];
  retainagePct: number;
  /** A draw still in draft: finish or void it before starting another. */
  openDraft: { id: string; number: string } | null;
  /** Draws made in the app; the opening percents can only be set before the first. */
  draws: number;
  opening: Record<string, number>;
  /** The PM's percent complete sent since the last draw, if any: the next draw opens with it. */
  report: PmReport | null;
};

export async function loadProgress(billingJobId: string): Promise<ProgressState> {
  const db = getSupabaseAdmin();
  const { data: job, error } = await db.from("jobs").select("id,name,address,client_id,number_prefix,billing").eq("id", billingJobId).maybeSingle();
  if (error) throw new Error(`jobs: ${error.message}`);
  if (!job) throw new ProgressError("No such job.", 404);
  const j = job as JobRow;
  const billing = (j.billing ?? {}) as { sov?: (SovLine | Record<string, unknown>)[]; retainagePct?: number; sovOpening?: Record<string, number>; pmReport?: PmReport };
  const [client, cos, rows] = await Promise.all([
    j.client_id ? db.from("clients").select("billing").eq("id", j.client_id).maybeSingle() : Promise.resolve({ data: null }),
    db.from("change_orders").select("id,number,title,amount_cents,status").eq("job_id", j.id).in("status", ["signed", "billed"]),
    db.from("sov_progress").select("line_key,pct_to_date,amount_cents,document_id,documents!inner(id,number,status,created_at)").eq("job_id", j.id),
  ]);

  // What standing draws billed per line, and the latest percent on each.
  type Doc = { id: string; number: string; status: string; created_at: string };
  type R = { line_key: string; pct_to_date: number | string; amount_cents: number; document_id: string; documents: Doc | Doc[] };
  const billed = new Map<string, { cents: number; pct: number }>();
  let openDraft: ProgressState["openDraft"] = null;
  const drawDocs = new Set<string>();
  let lastDrawAt = 0;
  for (const r of (rows.data ?? []) as R[]) {
    const doc = Array.isArray(r.documents) ? r.documents[0] : r.documents;
    if (!doc || doc.status === "void") continue;
    lastDrawAt = Math.max(lastDrawAt, Date.parse(doc.created_at) || 0);
    if (doc.status === "draft") openDraft = { id: doc.id, number: doc.number };
    drawDocs.add(doc.id);
    const b = billed.get(r.line_key) ?? { cents: 0, pct: 0 };
    b.cents += Number(r.amount_cents);
    b.pct = Math.max(b.pct, Number(r.pct_to_date));
    billed.set(r.line_key, b);
  }

  // Billed before the app (an opening percent per line, set once at cutover):
  // counted as billed so the first draw in the app starts from there.
  const opening: Record<string, number> = { ...(billing.sovOpening ?? {}) };
  for (const [key, pct] of Object.entries(opening)) {
    const b = billed.get(key) ?? { cents: 0, pct: 0 };
    b.pct = Math.max(b.pct, Number(pct) || 0);
    billed.set(key, b);
  }
  const lines: ProgressLine[] = [];
  const openingCents = (key: string, scheduled: number) => (opening[key] ? shareOf(scheduled, Number(opening[key])) : 0);
  (billing.sov ?? []).forEach((raw, i) => {
    const l = sovLineOf(raw);
    if (!l || !l.amountCents) return;
    const key = `sov:${i}`;
    // A line carried in with what was already billed on it (billedPct) opens there unless an opening was set.
    if (l.billedPct && opening[key] === undefined) {
      const b = billed.get(key) ?? { cents: 0, pct: 0 };
      b.pct = Math.max(b.pct, l.billedPct);
      billed.set(key, b);
      opening[key] = l.billedPct;
    }
    lines.push({ key, description: l.description, scheduledCents: l.amountCents, billedToDateCents: (billed.get(key)?.cents ?? 0) + openingCents(key, l.amountCents), pctToDate: billed.get(key)?.pct ?? 0, kind: "sov" });
  });
  for (const c of (cos.data ?? []) as { id: number; number: string; title: string; amount_cents: number | null; status: string }[]) {
    if (!c.amount_cents) continue;
    const key = `co:${c.id}`;
    // A change order marked billed outside the draws was billed on its own invoice: it is not on the schedule.
    if (c.status === "billed" && !billed.has(key)) continue;
    lines.push({ key, description: `${c.number ? `${c.number} ` : ""}${c.title}`, scheduledCents: Number(c.amount_cents), billedToDateCents: (billed.get(key)?.cents ?? 0) + openingCents(key, Number(c.amount_cents)), pctToDate: billed.get(key)?.pct ?? 0, kind: "co" });
  }
  const profile = ((client.data as { billing?: BillingProfile } | null)?.billing ?? {}) as BillingProfile;
  return {
    jobId: j.id,
    jobName: j.name,
    clientId: j.client_id,
    lines,
    retainagePct: typeof billing.retainagePct === "number" ? billing.retainagePct : (profile.retainagePct ?? 0),
    openDraft,
    draws: drawDocs.size,
    opening,
    // A report a draw has already used is spent.
    report: billing.pmReport?.at && Date.parse(billing.pmReport.at) > lastDrawAt ? billing.pmReport : null,
  };
}

/** Save the PM's percent complete for this cycle on the job (the latest one stands). Bills nothing. */
export async function saveReport(billingJobId: string, pcts: Record<string, number>, note: string, by: { email: string; name: string }): Promise<PmReport> {
  const state = await loadProgress(billingJobId);
  const asked: Record<string, number> = {};
  for (const [k, v] of Object.entries(pcts)) asked[k] = Number(v);
  const errors = checkReport(state.lines, asked);
  if (errors.length) throw new ProgressError(errors.join(" "), 400);
  const at = new Date().toISOString();
  const report: PmReport = { pcts: asked, note: note.trim().slice(0, 1000), by: by.email, byName: by.name, at, day: localDay(at) };
  const db = getSupabaseAdmin();
  const { data } = await db.from("jobs").select("billing").eq("id", billingJobId).maybeSingle();
  const billing = { ...(((data as { billing?: Record<string, unknown> } | null)?.billing) ?? {}), pmReport: report };
  const { error } = await db.from("jobs").update({ billing }).eq("id", billingJobId);
  if (error) throw new Error(`jobs update: ${error.message}`);
  return report;
}

/** Set what was billed before the app, per line, once, before the first draw in the app. */
export async function setOpening(billingJobId: string, pcts: Record<string, number>, by: string): Promise<void> {
  const state = await loadProgress(billingJobId);
  if (state.draws > 0) throw new ProgressError("Draws already exist in the app; the opening can't change now.", 409);
  const keys = new Set(state.lines.map((l) => l.key));
  const clean: Record<string, number> = {};
  for (const [k, v] of Object.entries(pcts)) {
    if (!keys.has(k)) throw new ProgressError(`No line ${k} on this job.`, 400);
    const n = Number(v);
    if (!(n >= 0 && n <= 100)) throw new ProgressError("An opening percent is 0 to 100.", 400);
    if (n > 0) clean[k] = Math.round(n * 100) / 100;
  }
  const db = getSupabaseAdmin();
  const { data } = await db.from("jobs").select("billing").eq("id", billingJobId).maybeSingle();
  const billing = { ...(((data as { billing?: Record<string, unknown> } | null)?.billing) ?? {}), sovOpening: clean, sovOpeningBy: by, sovOpeningAt: new Date().toISOString(), pmReport: null };
  const { error } = await db.from("jobs").update({ billing }).eq("id", billingJobId);
  if (error) throw new Error(`jobs update: ${error.message}`);
}

/** Preview a draw: the same math the draft will use. */
export function previewDraw(state: ProgressState, asked: Record<string, number>): Draw {
  return computeDraw(state.lines, asked, state.retainagePct);
}

/** Create the draw as a draft invoice and record what it bills per line. */
export async function createDrawDraft(billingJobId: string, asked: Record<string, number>, by: string): Promise<{ documentId: string; number: string; draw: Draw }> {
  const state = await loadProgress(billingJobId);
  if (state.openDraft) throw new ProgressError(`Draw ${state.openDraft.number} is still a draft. Send or void it first.`, 409);
  if (!state.lines.length) throw new ProgressError("This job has no schedule of values to bill against.", 400);
  const draw = computeDraw(state.lines, asked, state.retainagePct);
  if (draw.errors.length) throw new ProgressError(draw.errors.join(" "), 400);
  if (draw.grossCents <= 0) throw new ProgressError("Nothing to bill: no line moved since the last draw.", 400);

  const db = getSupabaseAdmin();
  const { data: job } = await db.from("jobs").select("name,address,number_prefix").eq("id", billingJobId).maybeSingle();
  const j = (job ?? {}) as { name?: string; address?: string | null; number_prefix?: string | null };
  const number = nextNumber(j.number_prefix ?? "", await usedNumbers("invoice", billingJobId));
  const doc = await createDraft({
    kind: "invoice",
    jobId: billingJobId,
    clientId: state.clientId,
    number,
    title: `Progress draw: ${draw.lines.filter((l) => l.thisPeriodCents).length} line(s) moved`,
    snapshot: {
      job: { name: j.name ?? state.jobName, address: j.address ?? undefined },
      date: localDay(),
      lines: drawInvoiceLines(draw),
      note: `Billed to date ${(draw.billedToDateCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })} of ${(draw.contractCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })}.${draw.retainageCents ? ` Retainage held this draw: ${(draw.retainageCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })}.` : ""}`,
    },
    createdBy: by,
  });

  const rows = draw.lines
    .filter((l) => l.thisPeriodCents !== 0)
    .map((l) => ({ job_id: billingJobId, document_id: doc.id, line_key: l.key, description: l.description, scheduled_cents: l.scheduledCents, pct_to_date: l.pct, amount_cents: l.thisPeriodCents, created_by: by }));
  const { error } = await db.from("sov_progress").insert(rows);
  if (error) throw new Error(`sov_progress insert: ${error.message}`);

  // A signed change order that this draw takes to 100% is billed.
  const done = draw.lines.filter((l) => l.kind === "co" && l.pct >= 100 && l.thisPeriodCents > 0).map((l) => Number(l.key.slice(3)));
  if (done.length) await db.from("change_orders").update({ status: "billed", billed_document_id: doc.id }).in("id", done).eq("status", "signed");

  return { documentId: doc.id, number: doc.number, draw };
}
