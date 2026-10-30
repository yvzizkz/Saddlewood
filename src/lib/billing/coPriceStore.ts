// "Price it", the database part: open a change order with its draft, save the
// owner's prices, and send it in one action (price → issue → email), moving
// the register requested → priced → sent with a line on its timeline for
// each step. Owners only, checked by the routes. Server only.

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { coEvent, coEventsAfter, loadTimelines } from "./coEvents";
import type { TimelineLine } from "./coTimeline";
import { jobKeyOf, listJobRefs } from "@/lib/jobs/hub";
import { deliver, type DeliverResult } from "./deliver";
import { createDraft, ensurePreviewToken, getDocument, totalOf, updateDraft } from "./documents";
import { listExhibits, type Exhibit } from "./exhibits";
import { applyPrices, coEmail, defaultTo, sendBlockers, type Contact, type PriceEdit } from "./coPrice";
import { nextChangeOrderNumberFor } from "./coIntakeStore";
import type { BillingDocument } from "./types";

export class PriceError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409,
    readonly blockers: string[] = [],
  ) {
    super(message);
  }
}

type Row = {
  id: number;
  job_id: string | null;
  crew_job_id: string | null;
  number: string;
  title: string;
  detail: string;
  status: string;
  amount_cents: number | null;
  requested_on: string;
  requested_by: string;
  priced_at: string | null;
  document_id: string | null;
};

export type PriceIt = {
  id: number;
  number: string;
  title: string;
  detail: string;
  status: string;
  requestedBy: string;
  requestedOn: string;
  jobKey: string | null;
  job: string;
  doc: BillingDocument;
  exhibits: Exhibit[];
  contacts: Contact[];
  to: string[];
  email: { subject: string; body: string };
  timeline: TimelineLine[];
};

async function readRow(id: number): Promise<Row> {
  const { data, error } = await getSupabaseAdmin()
    .from("change_orders")
    .select("id,job_id,crew_job_id,number,title,detail,status,amount_cents,requested_on,requested_by,priced_at,document_id")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`change_orders read: ${error.message}`);
  if (!data) throw new PriceError("No such change order.", 404);
  return data as Row;
}

/**
 * A change order recorded by hand (or from a directive) has no draft yet: it
 * gets one the first time it is opened to price, with its number and one line
 * per what was asked, so every CO is priced the same way.
 */
async function draftFor(row: Row, actor: string): Promise<BillingDocument> {
  if (row.document_id) {
    const doc = await getDocument(row.document_id);
    if (doc) return ensurePreviewToken(doc);
  }
  // Only one still waiting for its price gets a draft; opening an old or settled one changes nothing.
  if (row.status !== "requested" && row.status !== "priced") throw new PriceError(`It is ${row.status} and has no document here; see it on the job's Changes tab.`, 409);
  if (!row.job_id) throw new PriceError("This change order has no billing job, so it cannot have a document. Link the job first.", 409);
  const db = getSupabaseAdmin();
  const { data: job, error } = await db.from("jobs").select("name,address,number_prefix,client_id").eq("id", row.job_id).maybeSingle();
  if (error) throw new Error(`jobs read: ${error.message}`);
  const j = (job ?? {}) as { name?: string; address?: string | null; number_prefix?: string | null; client_id?: string | null };
  const number = row.number || (await nextChangeOrderNumberFor(row.job_id, j.number_prefix ?? ""));
  const doc = await createDraft({
    kind: "change_order",
    jobId: row.job_id,
    clientId: j.client_id ?? null,
    number,
    title: row.title,
    snapshot: {
      job: { name: j.name ?? "", ...(j.address ? { address: j.address } : {}) },
      date: row.requested_on,
      lines: [{ description: row.title, amountCents: 0, ...(row.detail ? { note: row.detail } : {}) }],
    },
    createdBy: actor,
  });
  const { error: upErr } = await db.from("change_orders").update({ document_id: doc.id, number }).eq("id", row.id).is("document_id", null);
  if (upErr) throw new Error(`change_orders link: ${upErr.message}`);
  await coEvent(row.id, "drafted", actor, { documentId: doc.id, number });
  return doc;
}

async function contactsOf(clientId: string | null): Promise<Contact[]> {
  if (!clientId) return [];
  const { data, error } = await getSupabaseAdmin().from("client_contacts").select("name,email,role").eq("client_id", clientId).eq("active", true).order("name");
  if (error) throw new Error(`client_contacts read: ${error.message}`);
  return ((data ?? []) as { name: string | null; email: string; role: string | null }[]).map((c) => ({ name: c.name ?? "", email: c.email.trim().toLowerCase(), role: c.role ?? "" }));
}

/** Everything the screen needs to price and send one change order. */
export async function loadPriceIt(id: number, actor: string): Promise<PriceIt> {
  const row = await readRow(id);
  const doc = await draftFor(row, actor);
  const [exhibits, contacts, refs, timelines] = await Promise.all([listExhibits(doc.id), contactsOf(doc.clientId), listJobRefs(), loadTimelines([{ id: row.id, documentId: doc.id }])]);
  const jobKey = jobKeyOf({ billingId: row.job_id, crewId: row.crew_job_id }, refs);
  const job = (jobKey ? refs.find((r) => r.key === jobKey)?.name : null) ?? doc.snapshot.job?.name ?? "";
  const to = defaultTo(contacts, row.requested_by);
  return {
    id: row.id,
    number: doc.number,
    title: doc.title || row.title,
    detail: row.detail,
    status: row.status,
    requestedBy: row.requested_by,
    requestedOn: row.requested_on,
    jobKey,
    job,
    doc,
    exhibits,
    contacts,
    to,
    email: coEmail({ number: doc.number, title: doc.title || row.title, job, totalCents: doc.totalCents, to: contacts.find((c) => c.email === to[0]) ?? null }),
    timeline: timelines.get(row.id) ?? [],
  };
}

/** Save the owner's prices and words on the draft; the register keeps the running total. */
export async function savePrices(id: number, edit: PriceEdit, actor: string): Promise<BillingDocument> {
  const row = await readRow(id);
  if (row.status !== "requested" && row.status !== "priced") throw new PriceError(`It is ${row.status} now; a sent change order is changed with a new revision.`, 409);
  const doc = await draftFor(row, actor);
  if (doc.status !== "draft") throw new PriceError("Its document was already issued.", 409);
  if (edit.lines.length !== (doc.snapshot.lines ?? []).length) throw new PriceError("The lines changed under you; reload and price again.", 409);
  const snapshot = applyPrices(doc.snapshot, edit);
  const saved = await updateDraft(doc.id, { title: edit.title, snapshot });
  const total = totalOf(snapshot);
  const priced = snapshot.lines?.some((l) => l.amountCents > 0 || l.noCharge) ?? false;
  const { error } = await getSupabaseAdmin()
    .from("change_orders")
    .update({ title: edit.title, amount_cents: priced ? total : null })
    .eq("id", id)
    .in("status", ["requested", "priced"]);
  if (error) throw new Error(`change_orders update: ${error.message}`);
  return saved;
}

/**
 * Send it: the blockers first (a $0 line not marked no charge, a blank left
 * in the words), then the billing send path (the client's contacts and the
 * owner's allowlist; without confirm, the exact message and nothing sent).
 * Once it has gone, the register is priced and sent, with who and when.
 */
export async function sendChangeOrder(id: number, input: Record<string, unknown>, actor: string): Promise<DeliverResult> {
  const row = await readRow(id);
  if (row.status !== "requested" && row.status !== "priced") throw new PriceError(`It is ${row.status} already.`, 409);
  const doc = await draftFor(row, actor);
  if (doc.status !== "draft") throw new PriceError("Its document was already issued.", 409);
  const blockers = sendBlockers(doc.title, doc.snapshot);
  if (blockers.length) throw new PriceError("Not ready to send.", 409, blockers);

  const wasRequested = row.status === "requested";
  const result = await deliver(actor, doc, input);
  if (input.confirm !== true || result.body.sent !== true) return result;

  const now = new Date().toISOString();
  const db = getSupabaseAdmin();
  const { error } = await db
    .from("change_orders")
    .update({ status: "sent", amount_cents: doc.totalCents, number: doc.number, ...(row.priced_at ? {} : { priced_at: now, priced_by: actor }) })
    .eq("id", id)
    .in("status", ["requested", "priced"]);
  if (error) {
    // It went out; the register is behind. Say so rather than pretend.
    console.error("change order sent but register not moved:", id, error.message);
    return { status: 200, body: { ...result.body, warning: "sent, but the register still shows it unsent; mark it sent on the job's Changes tab" } };
  }
  // It went out: a lost timeline line must not turn that into an error.
  if (wasRequested) await coEventsAfter([id], "priced", actor, { amountCents: doc.totalCents });
  await coEventsAfter([id], "sent", actor, { documentId: doc.id, emailId: result.body.emailId ?? null, to: input.to ?? [] });
  return result;
}

/** For the push and Waiting on you: where an owner prices this one. */
export function priceItHref(id: number): string {
  return `/app/changes/${id}`;
}
