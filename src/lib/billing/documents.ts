import { randomBytes } from "crypto";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { normalizeNumber } from "./numbering";
import type {
  BillingDocument,
  DocumentEvent,
  DocumentEventKind,
  DocumentKind,
  DocumentSnapshot,
  DocumentStatus,
} from "./types";

// Every read and write of documents and their proof record. Service-role
// client only, after the route has decided who is asking. The database holds
// the two rules that matter (an issued document cannot be edited; an event
// cannot be changed), so nothing here has to be trusted to keep them.

const UNIQUE_VIOLATION = "23505";

function fail(what: string, message: string): never {
  throw new Error(`${what} failed: ${message}`);
}

type DocumentRow = {
  id: string;
  kind: DocumentKind;
  job_id: string | null;
  client_id: string | null;
  number: string;
  title: string;
  status: DocumentStatus;
  revision: number;
  supersedes: string | null;
  snapshot: DocumentSnapshot | null;
  total_cents: number | string;
  due_date: string | null;
  token: string | null;
  issued_at: string | null;
  issued_by: string;
  void_reason: string;
  created_at: string;
};

function toDocument(r: DocumentRow): BillingDocument {
  return {
    id: r.id,
    kind: r.kind,
    jobId: r.job_id,
    clientId: r.client_id,
    number: r.number,
    title: r.title,
    status: r.status,
    revision: r.revision,
    supersedes: r.supersedes,
    snapshot: r.snapshot ?? {},
    totalCents: Number(r.total_cents),
    dueDate: r.due_date,
    token: r.token,
    issuedAt: r.issued_at,
    issuedBy: r.issued_by,
    voidReason: r.void_reason,
    createdAt: r.created_at,
  };
}

type EventRow = {
  id: number;
  document_id: string;
  kind: DocumentEventKind;
  at: string;
  actor: string;
  automatic: boolean;
  email_id: string | null;
  detail: Record<string, unknown> | null;
};

function toEvent(r: EventRow): DocumentEvent {
  return {
    id: r.id,
    documentId: r.document_id,
    kind: r.kind,
    at: r.at,
    actor: r.actor,
    automatic: r.automatic,
    emailId: r.email_id,
    detail: r.detail ?? {},
  };
}

/** The total a snapshot adds up to, in whole cents. The lines are the truth; the column is their sum. */
export function totalOf(snapshot: DocumentSnapshot): number {
  let total = 0;
  for (const line of snapshot.lines ?? []) {
    if (!Number.isInteger(line.amountCents)) throw new Error("a line amount must be whole cents");
    total += line.amountCents;
  }
  return total;
}

export type DraftInput = {
  kind: DocumentKind;
  jobId: string | null;
  clientId: string | null;
  number: string;
  title?: string;
  snapshot: DocumentSnapshot;
  dueDate?: string | null;
  supersedes?: { id: string; revision: number } | null;
  createdBy: string;
};

export async function createDraft(input: DraftInput): Promise<BillingDocument> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("documents")
    .insert({
      kind: input.kind,
      job_id: input.jobId,
      client_id: input.clientId,
      number: normalizeNumber(input.number),
      title: input.title ?? "",
      snapshot: input.snapshot,
      total_cents: totalOf(input.snapshot),
      due_date: input.dueDate ?? null,
      supersedes: input.supersedes?.id ?? null,
      revision: input.supersedes ? input.supersedes.revision + 1 : 1,
      created_by: input.createdBy,
    })
    .select("*")
    .single();
  if (error) {
    if (error.code === UNIQUE_VIOLATION) throw new Error(`number ${normalizeNumber(input.number)} is already in use on this job`);
    fail("create draft", error.message);
  }
  return toDocument(data as DocumentRow);
}

/**
 * Issue a draft: give it its link token and freeze it. Only a draft can be
 * issued, and only once: the update is conditional on the row still being a
 * draft, so two people pressing the button get one issue between them.
 */
export async function issueDocument(id: string, issuedBy: string, now: Date = new Date()): Promise<BillingDocument> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("documents")
    .update({
      status: "issued",
      token: randomBytes(16).toString("hex"),
      issued_at: now.toISOString(),
      issued_by: issuedBy,
    })
    .eq("id", id)
    .eq("status", "draft")
    .select("*")
    .maybeSingle();
  if (error) fail("issue document", error.message);
  if (!data) throw new Error("this document is not a draft, so it cannot be issued");
  return toDocument(data as DocumentRow);
}

export async function voidDocument(id: string, reason: string, now: Date = new Date()): Promise<BillingDocument> {
  const why = reason.trim();
  if (!why) throw new Error("voiding a document needs a reason");
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("documents")
    .update({ status: "void", void_reason: why, voided_at: now.toISOString() })
    .eq("id", id)
    .eq("status", "issued")
    .select("*")
    .maybeSingle();
  if (error) fail("void document", error.message);
  if (!data) throw new Error("only an issued document can be voided");
  return toDocument(data as DocumentRow);
}

export async function getDocument(id: string): Promise<BillingDocument | null> {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("documents").select("*").eq("id", id).maybeSingle();
  if (error) fail("get document", error.message);
  return data ? toDocument(data as DocumentRow) : null;
}

/** The document behind a client's link. Drafts have no token; a void one still opens, marked void. */
export async function getDocumentByToken(token: string): Promise<BillingDocument | null> {
  const clean = token.trim().toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(clean)) return null;
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("documents").select("*").eq("token", clean).maybeSingle();
  if (error) fail("get document by token", error.message);
  return data ? toDocument(data as DocumentRow) : null;
}

export async function usedNumbers(kind: DocumentKind, jobId: string): Promise<string[]> {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("documents").select("number").eq("kind", kind).eq("job_id", jobId);
  if (error) fail("list numbers", error.message);
  return (data ?? []).map((r) => (r as { number: string }).number);
}

export type EventInput = {
  documentId: string;
  kind: DocumentEventKind;
  at?: Date | string;
  actor?: string;
  automatic?: boolean;
  emailId?: string | null;
  /** The same report arriving twice is recorded once. */
  dedupe?: string | null;
  detail?: Record<string, unknown>;
};

/** Add a line to a document's proof record. Returns false when it was already there (same dedupe). */
export async function recordEvent(input: EventInput): Promise<boolean> {
  const db = getSupabaseAdmin();
  const at = input.at instanceof Date ? input.at.toISOString() : input.at;
  const { error } = await db.from("document_events").insert({
    document_id: input.documentId,
    kind: input.kind,
    ...(at ? { at } : {}),
    actor: input.actor ?? "",
    automatic: input.automatic ?? false,
    email_id: input.emailId ?? null,
    dedupe: input.dedupe ?? null,
    detail: input.detail ?? {},
  });
  if (error) {
    if (error.code === UNIQUE_VIOLATION) return false;
    fail("record event", error.message);
  }
  return true;
}

export async function listEvents(documentId: string): Promise<DocumentEvent[]> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("document_events")
    .select("*")
    .eq("document_id", documentId)
    .order("at", { ascending: true })
    .order("id", { ascending: true });
  if (error) fail("list events", error.message);
  return (data ?? []).map((r) => toEvent(r as EventRow));
}

/** Which document a send belongs to, from the mail service's id for it. */
export async function documentForEmail(emailId: string): Promise<string | null> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("document_events")
    .select("document_id")
    .eq("email_id", emailId)
    .eq("kind", "sent")
    .limit(1)
    .maybeSingle();
  if (error) fail("find document for email", error.message);
  return data ? (data as { document_id: string }).document_id : null;
}
