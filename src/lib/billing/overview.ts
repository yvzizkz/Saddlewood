import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { localDay } from "@/lib/crew/time";
import { addBusinessDays, dayOf, isPayWhenPaid, ladderClock, nextStep, VIEW_WITHIN_BUSINESS_DAYS, type NextStep } from "./ladder";
import { paidByDocument } from "./payments";
import { summarizeProof, type ProofSummary } from "./proof";
import type { BillingDocument, BillingProfile, DocumentEvent } from "./types";

// Marco's and Ilene's one screen: who owes what, how late, what was seen,
// what the system did, what is waiting on them.

export type OpenDocument = {
  doc: BillingDocument;
  clientName: string;
  paidCents: number;
  balanceCents: number;
  proof: ProofSummary;
  /** Sent, not viewed, and the window to confirm receipt has passed. */
  unconfirmed: boolean;
  /** The client (or the job) is paid when their own client pays: no ladder until an owner sets a due date. */
  payWhenPaid: boolean;
  next: NextStep;
};

export type Overview = {
  today: string;
  totalOpenCents: number;
  clients: { id: string | null; name: string; openCents: number; documents: OpenDocument[] }[];
};

export type DocRow = Record<string, unknown> & { id: string; client_id: string | null };

function toDocument(r: Record<string, unknown>): BillingDocument {
  return {
    id: r.id as string,
    kind: r.kind as BillingDocument["kind"],
    jobId: (r.job_id as string | null) ?? null,
    clientId: (r.client_id as string | null) ?? null,
    number: r.number as string,
    title: (r.title as string) ?? "",
    status: r.status as BillingDocument["status"],
    revision: Number(r.revision ?? 1),
    supersedes: (r.supersedes as string | null) ?? null,
    snapshot: (r.snapshot as BillingDocument["snapshot"]) ?? {},
    totalCents: Number(r.total_cents ?? 0),
    dueDate: (r.due_date as string | null) ?? null,
    token: (r.token as string | null) ?? null,
    issuedAt: (r.issued_at as string | null) ?? null,
    issuedBy: (r.issued_by as string) ?? "",
    voidReason: (r.void_reason as string) ?? "",
    createdAt: r.created_at as string,
  };
}

export type OverviewInput = {
  today: string;
  /** Issued documents (rows as stored). */
  rows: DocRow[];
  paid: Map<string, { total: number }>;
  events: Map<string, DocumentEvent[]>;
  clients: Map<string, { name: string; billing: BillingProfile }>;
  /** Billing profile of each job a document points at. */
  jobs: Map<string, BillingProfile>;
};

export function buildOverview(input: OverviewInput): Overview {
  const { today } = input;
  const open: OpenDocument[] = [];
  for (const r of input.rows) {
    const doc = toDocument(r);
    const paidCents = input.paid.get(doc.id)?.total ?? 0;
    const balanceCents = doc.totalCents - paidCents;
    if (balanceCents <= 0) continue;
    const proof = summarizeProof(input.events.get(doc.id) ?? []);
    const firstSent = proof.firstSentAt ? dayOf(proof.firstSentAt) : null;
    const unconfirmed = Boolean(firstSent) && proof.views.length === 0 && addBusinessDays(firstSent!, VIEW_WITHIN_BUSINESS_DAYS) <= today;
    const client = doc.clientId ? input.clients.get(doc.clientId) : undefined;
    const payWhenPaid = isPayWhenPaid(client?.billing, doc.jobId ? input.jobs.get(doc.jobId) : null);
    const clock = ladderClock(doc.dueDate, firstSent, payWhenPaid);
    open.push({
      doc,
      clientName: client?.name || "No client",
      paidCents,
      balanceCents,
      proof,
      unconfirmed,
      payWhenPaid,
      next: clock ? nextStep(clock, today) : null,
    });
  }

  const groups = new Map<string | null, OpenDocument[]>();
  for (const o of open) {
    const list = groups.get(o.doc.clientId) ?? [];
    list.push(o);
    groups.set(o.doc.clientId, list);
  }
  const out: Overview["clients"] = [...groups.entries()]
    .map(([id, documents]) => ({
      id,
      name: documents[0].clientName,
      openCents: documents.reduce((s, d) => s + d.balanceCents, 0),
      documents,
    }))
    .sort((a, b) => b.openCents - a.openCents);
  return { today, totalOpenCents: open.reduce((s, d) => s + d.balanceCents, 0), clients: out };
}

export async function moneyOverview(today: string = localDay()): Promise<Overview> {
  const db = getSupabaseAdmin();
  const { data: docs, error } = await db
    .from("documents")
    .select("*")
    .eq("status", "issued")
    .in("kind", ["invoice", "statement", "change_order"])
    .order("issued_at", { ascending: true });
  if (error) throw new Error(`overview failed: ${error.message}`);
  const rows = (docs ?? []) as DocRow[];
  const ids = rows.map((r) => r.id);
  const jobIds = [...new Set(rows.map((r) => r.job_id as string | null).filter((j): j is string => Boolean(j)))];

  const [paid, events, clients, jobs] = await Promise.all([
    paidByDocument(ids),
    ids.length ? db.from("document_events").select("*").in("document_id", ids).order("at", { ascending: true }) : Promise.resolve({ data: [], error: null }),
    db.from("clients").select("id, name, billing"),
    jobIds.length ? db.from("jobs").select("id, billing").in("id", jobIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (events.error) throw new Error(`overview failed: ${events.error.message}`);
  if (clients.error) throw new Error(`overview failed: ${clients.error.message}`);
  if (jobs.error) throw new Error(`overview failed: ${jobs.error.message}`);

  const byDoc = new Map<string, DocumentEvent[]>();
  for (const e of (events.data ?? []) as Record<string, unknown>[]) {
    const id = e.document_id as string;
    const list = byDoc.get(id) ?? [];
    list.push({
      id: Number(e.id),
      documentId: id,
      kind: e.kind as DocumentEvent["kind"],
      at: e.at as string,
      actor: (e.actor as string) ?? "",
      automatic: Boolean(e.automatic),
      emailId: (e.email_id as string | null) ?? null,
      detail: (e.detail as Record<string, unknown>) ?? {},
    });
    byDoc.set(id, list);
  }

  return buildOverview({
    today,
    rows,
    paid,
    events: byDoc,
    clients: new Map(
      ((clients.data ?? []) as { id: string; name: string; billing: BillingProfile | null }[]).map((c) => [c.id, { name: c.name, billing: c.billing ?? {} }]),
    ),
    jobs: new Map(((jobs.data ?? []) as { id: string; billing: BillingProfile | null }[]).map((j) => [j.id, j.billing ?? {}])),
  });
}
