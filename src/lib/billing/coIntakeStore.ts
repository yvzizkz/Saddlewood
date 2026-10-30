// Change-order intake, the database part (0059). For each change a client
// asked for: a register row (source 'client', awaiting price) and a $0 draft
// change order linked to it, numbered when it is made so the app, the PDF and
// the email agree from the start. Running the same request again finds the
// same rows: it rewrites a draft that nobody has touched since, and leaves
// alone one an owner has edited, priced or sent. Server only.

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getJobRef } from "@/lib/jobs/hub";
import { createDraft, DocumentError, getDocument, updateDraft, usedNumbers } from "./documents";
import { draftHash, snapshotFor, type DraftContext, type Intake, type IntakeItem } from "./coIntake";
import { nextChangeOrderNumber } from "./numbering";
import type { BillingDocument } from "./types";

const UNIQUE_VIOLATION = "23505";

export class IntakeError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409,
  ) {
    super(message);
  }
}

export type IntakeOutcome = {
  key: string;
  changeOrderId: number;
  number: string;
  documentId: string | null;
  /** created: new row and draft; updated: the untouched draft rewritten; unchanged: nothing new; kept: an owner has it now. */
  action: "created" | "updated" | "unchanged" | "kept";
  reason?: string;
};

type CoRow = { id: number; number: string; status: string; title: string; document_id: string | null; intake_hash: string };

/** The next change-order number on a billing job: past every register row and change-order document it has. */
export async function nextChangeOrderNumberFor(jobId: string, prefix: string): Promise<string> {
  const { data, error } = await getSupabaseAdmin().from("change_orders").select("number").eq("job_id", jobId);
  if (error) throw new Error(`change_orders numbers: ${error.message}`);
  const reg = ((data ?? []) as { number: string }[]).map((r) => r.number).filter(Boolean);
  return nextChangeOrderNumber([...reg, ...(await usedNumbers("change_order", jobId))], prefix);
}

async function event(changeOrderId: number, kind: string, actor: string, detail: Record<string, unknown>): Promise<void> {
  const { error } = await getSupabaseAdmin().from("change_order_events").insert({ change_order_id: changeOrderId, kind, actor, detail });
  if (error) throw new Error(`change_order_events insert: ${error.message}`);
}

async function findRow(sourceRef: string, key: string): Promise<CoRow | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("change_orders")
    .select("id,number,status,title,document_id,intake_hash")
    .eq("source_ref", sourceRef)
    .eq("source_key", key)
    .maybeSingle();
  if (error) throw new Error(`change_orders read: ${error.message}`);
  return (data as CoRow | null) ?? null;
}

type Job = { billingId: string; crewId: string | null; prefix: string; clientId: string | null; ctx: Omit<DraftContext, "requestedBy" | "requestedOn" | "subject" | "terms"> };

async function loadJob(key: string): Promise<Job> {
  const ref = await getJobRef(key);
  if (!ref) throw new IntakeError(`no job "${key}"`, 404);
  if (!ref.billingId) throw new IntakeError(`${ref.name} has no billing record yet, so it cannot have change orders`, 409);
  const db = getSupabaseAdmin();
  const { data: job, error } = await db.from("jobs").select("name,address,number_prefix,client_id").eq("id", ref.billingId).maybeSingle();
  if (error) throw new Error(`jobs read: ${error.message}`);
  const j = (job ?? {}) as { name?: string; address?: string | null; number_prefix?: string | null; client_id?: string | null };
  let client: string | undefined;
  if (j.client_id) {
    const { data: c, error: cErr } = await db.from("clients").select("name").eq("id", j.client_id).maybeSingle();
    if (cErr) throw new Error(`clients read: ${cErr.message}`);
    client = (c as { name?: string } | null)?.name || undefined;
  }
  return {
    billingId: ref.billingId,
    crewId: ref.crewId,
    prefix: j.number_prefix ?? "",
    clientId: j.client_id ?? null,
    ctx: { jobName: j.name || ref.name, jobAddress: j.address || ref.address || undefined, client },
  };
}

/** A new row and its draft. A number taken a moment ago by someone else is taken again, up to three times. */
async function create(job: Job, input: Intake, it: IntakeItem, ctx: DraftContext, actor: string): Promise<IntakeOutcome> {
  const snapshot = snapshotFor(it, ctx);
  const hash = draftHash(it.title, snapshot);
  let doc: BillingDocument | null = null;
  for (let attempt = 0; !doc; attempt++) {
    const number = await nextChangeOrderNumberFor(job.billingId, job.prefix);
    try {
      doc = await createDraft({ kind: "change_order", jobId: job.billingId, clientId: job.clientId, number, title: it.title, snapshot, createdBy: actor });
    } catch (err) {
      if (!(err instanceof DocumentError && err.status === 409 && attempt < 2)) throw err;
    }
  }
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("change_orders")
    .insert({
      job_id: job.billingId,
      crew_job_id: job.crewId,
      number: doc.number,
      title: it.title,
      detail: it.detail ?? "",
      source: "client",
      status: "requested",
      requested_on: input.requestedOn,
      requested_by: input.requestedBy,
      document_id: doc.id,
      source_ref: input.sourceRef,
      source_key: it.key,
      intake_hash: hash,
    })
    .select("id")
    .single();
  if (error) {
    // Without its row the draft would be a stray CO with no register entry: take it back out.
    await db.from("documents").delete().eq("id", doc.id).eq("status", "draft");
    if (error.code === UNIQUE_VIOLATION) throw new IntakeError(`${it.key} is being taken in by another run right now; try again`, 409);
    throw new Error(`change_orders insert: ${error.message}`);
  }
  const id = (data as { id: number }).id;
  await event(id, "requested", input.requestedBy, { sourceRef: input.sourceRef, subject: input.subject ?? "" });
  await event(id, "drafted", actor, { documentId: doc.id, number: doc.number });
  return { key: it.key, changeOrderId: id, number: doc.number, documentId: doc.id, action: "created" };
}

/** The same request again: rewrite the draft only while it is still what intake wrote. */
async function refresh(row: CoRow, it: IntakeItem, ctx: DraftContext, actor: string): Promise<IntakeOutcome> {
  const base = { key: it.key, changeOrderId: row.id, number: row.number, documentId: row.document_id };
  if (row.status !== "requested") return { ...base, action: "kept", reason: `it is ${row.status} now` };
  const doc = row.document_id ? await getDocument(row.document_id) : null;
  if (!doc || doc.status !== "draft") return { ...base, action: "kept", reason: "its draft is gone or issued" };
  if (draftHash(doc.title, doc.snapshot) !== row.intake_hash) return { ...base, action: "kept", reason: "an owner has changed the draft" };
  const snapshot = snapshotFor(it, ctx);
  const hash = draftHash(it.title, snapshot);
  if (hash === row.intake_hash) return { ...base, action: "unchanged" };
  try {
    await updateDraft(doc.id, { title: it.title, snapshot });
  } catch (err) {
    if (err instanceof DocumentError && err.status === 409) return { ...base, action: "kept", reason: err.message };
    throw err;
  }
  const { error } = await getSupabaseAdmin()
    .from("change_orders")
    .update({ title: it.title, detail: it.detail ?? "", intake_hash: hash })
    .eq("id", row.id)
    .eq("status", "requested");
  if (error) throw new Error(`change_orders update: ${error.message}`);
  await event(row.id, "updated", actor, { documentId: doc.id });
  return { ...base, action: "updated" };
}

/** Take in one request: every change it asks for, each once. */
export async function runIntake(input: Intake, actor: string): Promise<IntakeOutcome[]> {
  const job = await loadJob(input.job);
  const out: IntakeOutcome[] = [];
  for (const it of input.items) {
    const ctx: DraftContext = { ...job.ctx, requestedBy: input.requestedBy, requestedOn: input.requestedOn, subject: input.subject, terms: input.terms };
    const row = await findRow(input.sourceRef, it.key);
    out.push(row ? await refresh(row, it, ctx, actor) : await create(job, input, it, ctx, actor));
  }
  return out;
}
