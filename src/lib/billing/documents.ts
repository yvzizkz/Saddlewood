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
const FOREIGN_KEY_VIOLATION = "23503";

function fail(what: string, message: string): never {
  throw new Error(`${what} failed: ${message}`);
}

/**
 * A refusal the caller should pass on as it is: the words are for the person
 * asking, and the status is the HTTP answer (400 bad input, 404 no such
 * document, 409 not in a state that allows it).
 */
export class DocumentError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409,
  ) {
    super(message);
    this.name = "DocumentError";
  }
}

/** The unguessable part of a link: /d/<token> for the client, /d/p/<token> for a preview. */
export function newToken(): string {
  return randomBytes(16).toString("hex");
}

export type DocumentRow = {
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
  updated_at?: string;
  preview_token?: string | null;
  send_group_id?: string | null;
};

export function toDocument(r: DocumentRow): BillingDocument {
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
    previewToken: r.preview_token ?? null,
    sendGroupId: r.send_group_id ?? null,
    ...(r.updated_at ? { updatedAt: r.updated_at } : {}),
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
  sendGroupId?: string | null;
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
      // Every draft gets its preview link the moment it exists.
      preview_token: newToken(),
      send_group_id: input.sendGroupId ?? null,
    })
    .select("*")
    .single();
  if (error) {
    if (error.code === UNIQUE_VIOLATION) throw new DocumentError(`number ${normalizeNumber(input.number)} is already in use on this job`, 409);
    if (error.code === FOREIGN_KEY_VIOLATION) throw new DocumentError(`there is no such ${fkName(error.message)}`, 400);
    fail("create draft", error.message);
  }
  return toDocument(data as DocumentRow);
}

/** Which link a foreign-key refusal is about, in words. */
function fkName(message: string): string {
  if (message.includes("send_group")) return "send group";
  if (message.includes("client")) return "client";
  if (message.includes("job")) return "job";
  if (message.includes("supersedes")) return "document to revise";
  return "record";
}

export type DraftChanges = {
  kind?: DocumentKind;
  number?: string;
  title?: string;
  snapshot?: DocumentSnapshot;
  dueDate?: string | null;
  jobId?: string | null;
  clientId?: string | null;
  sendGroupId?: string | null;
};

/** Why a document is not open to a change: gone, issued, or held by a send. */
async function whyLocked(id: string): Promise<DocumentError> {
  const doc = await getDocument(id);
  if (!doc) return new DocumentError("not found", 404);
  if (doc.status !== "draft") {
    return new DocumentError(`this ${doc.kind.replace("_", " ")} was ${doc.status === "void" ? "voided" : "issued"} and cannot be changed; issue a new revision instead`, 409);
  }
  return new DocumentError("this draft is being sent right now; try again in a minute", 409);
}

/**
 * Change a draft, as many times as needed. Refused once it is issued (the
 * database refuses that too, documents_freeze) and while a send holds it: the
 * update is conditional on the row still being an unclaimed draft, so what is
 * mailed is always what was last previewed.
 */
/**
 * A progress draw (0041): its lines and total are what sov_progress says it
 * billed per line, so they can't be edited on the draft, or billed to date
 * would stop matching what the client was billed. Before 0041 there are no draws.
 */
async function isProgressDraw(id: string): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin().from("sov_progress").select("id").eq("document_id", id).limit(1);
  if (error) {
    if (/does not exist|schema cache|could not find the (table|relation)/i.test(error.message)) return false;
    fail("check progress draw", error.message);
  }
  return (data ?? []).length > 0;
}

export async function updateDraft(id: string, changes: DraftChanges): Promise<BillingDocument> {
  if ((changes.snapshot !== undefined || changes.jobId !== undefined || changes.kind !== undefined) && (await isProgressDraw(id))) {
    throw new DocumentError("This is a progress draw: its lines come from the job's percent complete. Discard it on the job's Money tab and make the draw again.", 409);
  }
  const row: Record<string, unknown> = {};
  if (changes.kind !== undefined) row.kind = changes.kind;
  if (changes.number !== undefined) row.number = normalizeNumber(changes.number);
  if (changes.title !== undefined) row.title = changes.title;
  if (changes.snapshot !== undefined) {
    row.snapshot = changes.snapshot;
    row.total_cents = totalOf(changes.snapshot);
  }
  if (changes.dueDate !== undefined) row.due_date = changes.dueDate;
  if (changes.jobId !== undefined) row.job_id = changes.jobId;
  if (changes.clientId !== undefined) row.client_id = changes.clientId;
  if (changes.sendGroupId !== undefined) row.send_group_id = changes.sendGroupId;
  if (Object.keys(row).length === 0) throw new DocumentError("nothing to change", 400);

  const db = getSupabaseAdmin();
  for (let attempt = 0; ; attempt++) {
    const { data, error } = await db
      .from("documents")
      .update(row)
      .eq("id", id)
      .eq("status", "draft")
      .is("token", null)
      .select("*")
      .maybeSingle();
    if (error) {
      if (error.code === UNIQUE_VIOLATION) throw new DocumentError("that number is already in use on this job", 409);
      if (error.code === FOREIGN_KEY_VIOLATION) throw new DocumentError(`there is no such ${fkName(error.message)}`, 400);
      fail("change draft", error.message);
    }
    if (data) return toDocument(data as DocumentRow);
    // A hold left behind by a send that died: the change is what was asked for, so let it go and try once more.
    const doc = await getDocument(id);
    if (attempt === 0 && doc?.status === "draft" && doc.token && isStale(doc)) {
      await releaseClaim(id, doc.token);
      continue;
    }
    throw await whyLocked(id);
  }
}

function isStale(doc: BillingDocument, now: Date = new Date()): boolean {
  if (!doc.updatedAt) return false;
  return now.getTime() - new Date(doc.updatedAt).getTime() >= CLAIM_STALE_MS;
}

/** A draft made before previews existed gets its preview link the first time someone asks for it. */
export async function ensurePreviewToken(doc: BillingDocument): Promise<BillingDocument> {
  if (doc.status !== "draft" || doc.previewToken) return doc;
  const db = getSupabaseAdmin();
  const { error } = await db
    .from("documents")
    .update({ preview_token: newToken() })
    .eq("id", doc.id)
    .eq("status", "draft")
    .is("preview_token", null);
  if (error) fail("make preview link", error.message);
  return (await getDocument(doc.id)) ?? doc;
}

/** How long a send may hold a draft before another send or an issue may take it over. */
export const CLAIM_STALE_MS = 2 * 60 * 1000;

/**
 * Hold a draft for a send, and give it the token its link will have. The draft
 * stays a draft (its client link does not open yet, and it can still be
 * released), but no one can change it while the message is going out, and a
 * second send of the same draft is refused. A hold left behind by a send that
 * died is taken over once it is stale, keeping its token, so a message that
 * did leave before the failure still opens.
 */
export async function claimForSend(id: string, now: Date = new Date()): Promise<string> {
  const db = getSupabaseAdmin();
  const token = newToken();
  const fresh = await db
    .from("documents")
    .update({ token })
    .eq("id", id)
    .eq("status", "draft")
    .is("token", null)
    .select("token")
    .maybeSingle();
  if (fresh.error) fail("hold draft for sending", fresh.error.message);
  if (fresh.data) return token;

  const doc = await getDocument(id);
  if (!doc) throw new DocumentError("not found", 404);
  if (doc.status !== "draft") throw new DocumentError("this document is no longer a draft", 409);
  const held = doc.updatedAt ? new Date(doc.updatedAt).getTime() : now.getTime();
  if (!doc.token || now.getTime() - held < CLAIM_STALE_MS) {
    throw new DocumentError("this draft is being sent right now; try again in a minute", 409);
  }
  const taken = await db
    .from("documents")
    .update({ token: doc.token })
    .eq("id", id)
    .eq("status", "draft")
    .eq("token", doc.token)
    .eq("updated_at", doc.updatedAt!)
    .select("token")
    .maybeSingle();
  if (taken.error) fail("hold draft for sending", taken.error.message);
  if (!taken.data) throw new DocumentError("this draft is being sent right now; try again in a minute", 409);
  return doc.token;
}

/** Let a held draft go again, when its message did not leave. */
export async function releaseClaim(id: string, token: string): Promise<void> {
  const db = getSupabaseAdmin();
  const { error } = await db.from("documents").update({ token: null }).eq("id", id).eq("status", "draft").eq("token", token);
  if (error) fail("release draft", error.message);
}

/**
 * Issue a draft: give it its link token and freeze it. Only a draft can be
 * issued, and only once: the update is conditional on the row still being a
 * draft, so two people pressing the button get one issue between them.
 *
 * A draft a send is holding already has the token its message carries, and
 * keeps it. Pass that token to issue only if it is still the one held.
 */
export async function issueDocument(
  id: string,
  issuedBy: string,
  now: Date = new Date(),
  opts: { token?: string } = {},
): Promise<BillingDocument> {
  const db = getSupabaseAdmin();
  let held = opts.token ?? null;
  if (!held) {
    const current = await getDocument(id);
    if (!current) throw new DocumentError("not found", 404);
    held = current.status === "draft" ? current.token : null;
    // A send that is under way issues it itself; one that died long ago left its token to keep.
    const since = current.updatedAt ? now.getTime() - new Date(current.updatedAt).getTime() : Infinity;
    if (held && since < CLAIM_STALE_MS) throw new DocumentError("this draft is being sent right now; try again in a minute", 409);
  }
  let q = db
    .from("documents")
    .update({
      status: "issued",
      token: held ?? newToken(),
      issued_at: now.toISOString(),
      issued_by: issuedBy,
    })
    .eq("id", id)
    .eq("status", "draft");
  q = held ? q.eq("token", held) : q.is("token", null);
  const { data, error } = await q.select("*").maybeSingle();
  if (error) fail("issue document", error.message);
  if (!data) throw new DocumentError("this document is not a draft, so it cannot be issued", 409);
  return toDocument(data as DocumentRow);
}

export async function voidDocument(id: string, reason: string, now: Date = new Date()): Promise<BillingDocument> {
  const why = reason.trim();
  if (!why) throw new DocumentError("voiding a document needs a reason", 400);
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("documents")
    .update({ status: "void", void_reason: why, voided_at: now.toISOString() })
    .eq("id", id)
    .eq("status", "issued")
    .select("*")
    .maybeSingle();
  if (error) fail("void document", error.message);
  if (!data) throw new DocumentError("only an issued document can be voided", 409);
  // A change order this invoice billed (a draw that took it to 100%, or its own
  // invoice) is owed again: back to signed, so it shows to bill on Changes and the schedule.
  const { error: coError } = await db
    .from("change_orders")
    .update({ status: "signed", billed_document_id: null })
    .eq("billed_document_id", id)
    .eq("status", "billed");
  if (coError) fail("reopen change orders", coError.message);
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

/** The document behind a preview link. Whatever its state: the page decides what an issued one shows. */
export async function getDocumentByPreviewToken(token: string): Promise<BillingDocument | null> {
  const clean = token.trim().toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(clean)) return null;
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("documents").select("*").eq("preview_token", clean).maybeSingle();
  if (error) fail("get document by preview link", error.message);
  return data ? toDocument(data as DocumentRow) : null;
}

/** The documents in a send group, oldest first (the order their buttons go in). */
export async function documentsInGroup(groupId: string): Promise<BillingDocument[]> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("documents")
    .select("*")
    .eq("send_group_id", groupId)
    .order("created_at", { ascending: true })
    .order("number", { ascending: true });
  if (error) fail("list group", error.message);
  return (data ?? []).map((r) => toDocument(r as DocumentRow));
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

/** Every document one message carried: one for a single send, several for a group. */
export async function documentsForEmail(emailId: string): Promise<string[]> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("document_events")
    .select("document_id")
    .eq("email_id", emailId)
    .eq("kind", "sent")
    .order("id", { ascending: true });
  if (error) fail("find documents for email", error.message);
  return [...new Set((data ?? []).map((r) => (r as { document_id: string }).document_id))];
}

/** The addresses on file for a client: the only outside addresses its documents may be mailed to. */
export async function clientContactEmails(clientId: string): Promise<string[]> {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("client_contacts").select("email").eq("client_id", clientId).eq("active", true);
  if (error) fail("list client contacts", error.message);
  return (data ?? []).map((r) => (r as { email: string }).email.trim().toLowerCase()).filter(Boolean);
}
