import { createDraft, DocumentError, listEvents, newToken, recordEvent, toDocument, type DocumentRow } from "@/lib/billing/documents";
import type { BillingDocument } from "@/lib/billing/types";
import { localDay } from "@/lib/crew/time";
import { loadPolicies } from "@/lib/policies/store";
import type { AwardRecord } from "@/lib/sales/award";
import { signaturesOf, snapshotHash, type Signature, type SignatureInput, type SignatureRecord } from "@/lib/sales/signing";
import { proposalFromDocument } from "@/lib/sales/store";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

import { planAgreement, type AgreementChoices, type AgreementSource } from "./draft";

// The job's agreement, read and drafted (draft.ts is the plan). One agreement
// per job at a time: drafting again rewrites the open draft from the current
// proposal and Company policies; an issued one is never rewritten (void it
// first, and the redraft is its next revision). Drafting makes no link a
// client can open: a draft has only its own preview, and nothing here sends.
// Issuing freezes it and gives it the client's link (/d/<token>), which staff
// pass on themselves; the client signs it there (T130), once.

export type JobAgreement = {
  /** The latest agreement on the job that is not void, else the latest void one. */
  document: BillingDocument | null;
  /** Why a draft can't be made now, when it can't. */
  blocked: string | null;
};

async function source(jobId: string): Promise<(AgreementSource & { clientId: string | null }) | null> {
  const db = getSupabaseAdmin();
  const { data: job, error } = await db.from("jobs").select("id, name, address, client_id, number_prefix, billing, contract_cents").eq("id", jobId).maybeSingle();
  if (error) throw new Error(`agreement: read job failed: ${error.message}`);
  if (!job) return null;
  const j = job as { id: string; name: string; address: string | null; client_id: string | null; number_prefix: string | null; billing: { award?: AwardRecord } | null; contract_cents: number | string | null };
  const award = j.billing?.award ?? null;
  const [client, proposalDoc] = await Promise.all([
    j.client_id ? db.from("clients").select("name, kind").eq("id", j.client_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    award?.documentId ? db.from("documents").select("*").eq("id", award.documentId).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  if (client.error) throw new Error(`agreement: read client failed: ${client.error.message}`);
  if (proposalDoc.error) throw new Error(`agreement: read proposal failed: ${proposalDoc.error.message}`);
  const doc = proposalDoc.data ? toDocument(proposalDoc.data as DocumentRow) : null;
  const snapshot = doc ? proposalFromDocument(doc) : null;
  return {
    clientId: j.client_id,
    job: { id: j.id, name: j.name, address: j.address, numberPrefix: j.number_prefix, contractCents: j.contract_cents === null ? null : Number(j.contract_cents) },
    client: (client.data as { name: string; kind: string } | null) ?? null,
    award,
    proposal: doc && snapshot ? { number: doc.number, revision: doc.revision, snapshot } : null,
  };
}

async function agreementsOf(jobId: string): Promise<BillingDocument[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("documents")
    .select("*")
    .eq("kind", "agreement")
    .eq("job_id", jobId)
    .order("revision", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(`agreement: read agreements failed: ${error.message}`);
  return ((data ?? []) as DocumentRow[]).map(toDocument);
}

/** The agreement to show on the job, and whether one can be drafted. */
export async function loadJobAgreement(jobId: string): Promise<JobAgreement> {
  const [docs, src] = await Promise.all([agreementsOf(jobId), source(jobId)]);
  const document = docs.find((d) => d.status !== "void") ?? docs[0] ?? null;
  let blocked: string | null = null;
  if (!src) blocked = "No such job.";
  else if (document?.status === "issued") blocked = "The agreement is issued. Void it to draft it again.";
  else {
    const plan = planAgreement(src, {}, localDay());
    if (!plan.ok) blocked = plan.error;
  }
  return { document, blocked };
}

/** Draft the job's agreement, or rewrite its open draft, from the accepted proposal and Company policies. */
export async function draftAgreement(jobId: string, choices: AgreementChoices, actor: string, now: Date = new Date()): Promise<BillingDocument> {
  const src = await source(jobId);
  if (!src) throw new DocumentError("no such job", 404);
  const docs = await agreementsOf(jobId);
  const live = docs.find((d) => d.status !== "void");
  if (live?.status === "issued") throw new DocumentError("the agreement is issued; void it to draft it again", 409);
  const plan = planAgreement(src, (await loadPolicies()).values, localDay(now), choices);
  if (!plan.ok) throw new DocumentError(plan.error, 409);
  if (live) {
    const { data, error } = await getSupabaseAdmin()
      .from("documents")
      .update({ number: plan.number, title: plan.title, snapshot: plan.snapshot, total_cents: plan.totalCents, client_id: src.clientId })
      .eq("id", live.id)
      .eq("status", "draft")
      .select("*")
      .maybeSingle();
    if (error) throw new Error(`agreement: redraft failed: ${error.message}`);
    if (!data) throw new DocumentError("the agreement changed while it was being drafted; try again", 409);
    return toDocument(data as DocumentRow);
  }
  const voided = docs.find((d) => d.status === "void" && d.number === plan.number);
  return createDraft({
    kind: "agreement",
    jobId,
    clientId: src.clientId,
    number: plan.number,
    title: plan.title,
    snapshot: plan.snapshot,
    supersedes: voided ? { id: voided.id, revision: voided.revision } : null,
    createdBy: actor,
  });
}

/** Issue the job's draft agreement: frozen from here on, with its client link. Nothing is sent. */
export async function issueAgreement(jobId: string, actor: string, now: Date = new Date()): Promise<BillingDocument> {
  const live = (await agreementsOf(jobId)).find((d) => d.status !== "void");
  if (!live) throw new DocumentError("draft the agreement first", 409);
  if (live.status === "issued") throw new DocumentError("the agreement is already issued", 409);
  const { data, error } = await getSupabaseAdmin()
    .from("documents")
    .update({ status: "issued", token: newToken(), issued_at: now.toISOString(), issued_by: actor })
    .eq("id", live.id)
    .eq("kind", "agreement")
    .eq("status", "draft")
    .select("*")
    .maybeSingle();
  if (error) throw new Error(`agreement: issue failed: ${error.message}`);
  if (!data) throw new DocumentError("the agreement changed while it was being issued; try again", 409);
  return toDocument(data as DocumentRow);
}

/** What the client agrees to by signing (kept word for word in the signature record). */
export const AGREEMENT_CONSENT =
  "By signing, I agree to this agreement and its terms, and I agree that this electronic signature is as binding as a handwritten one.";

/** The client's signature on an agreement, if there is one. */
export async function clientSignature(documentId: string): Promise<Signature | null> {
  return signaturesOf(await listEvents(documentId)).find((s) => s.role === "client") ?? null;
}

/**
 * The client signs the issued agreement on its link. One client signature per
 * agreement: the proof record's dedupe key refuses a second. The record
 * carries a SHA-256 of the frozen agreement, so the signature is tied to
 * these words and this price.
 */
export async function signAgreement(doc: BillingDocument, sig: SignatureInput, meta: { ip: string; ua: string }): Promise<Signature> {
  if (doc.kind !== "agreement") throw new DocumentError("This link does not open an agreement.", 404);
  if (doc.status !== "issued") throw new DocumentError("This agreement is no longer open for signing.", 409);
  if (await clientSignature(doc.id)) throw new DocumentError("This agreement is already signed.", 409);
  const record: SignatureRecord = {
    role: "client",
    name: sig.name.trim().replace(/\s+/g, " "),
    email: sig.email ?? "",
    title: "",
    method: sig.method,
    typed: sig.method === "type" ? (sig.typed ?? "") : "",
    font: sig.method === "type" ? (sig.font ?? "") : "",
    image: sig.image,
    consent: AGREEMENT_CONSENT,
    snapshotSha256: snapshotHash(doc.snapshot),
    ip: meta.ip.slice(0, 64),
    ua: meta.ua.slice(0, 300),
    totalCents: doc.totalCents,
  };
  const recorded = await recordEvent({ documentId: doc.id, kind: "signed", actor: "client link", dedupe: `signed:client:${doc.id}`, detail: record });
  if (!recorded) throw new DocumentError("This agreement is already signed.", 409);
  const mine = await clientSignature(doc.id);
  if (!mine) throw new Error("agreement: the signature was recorded but could not be read back");
  return mine;
}
