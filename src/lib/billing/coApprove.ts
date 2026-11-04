// The client approves a change order on its link, /d/<token> (T256): typed
// name, a signature and the consent box, the same as the job's agreement.
// That one answer moves the register to signed, keeps the signature in the
// document's proof record (tied to the frozen change order by its SHA-256),
// puts a line on the timeline and queues the Joist copy. Server only.

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { localDay } from "@/lib/crew/time";
import { signaturesOf, snapshotHash, type Signature, type SignatureInput, type SignatureRecord } from "@/lib/sales/signing";
import { coEventsAfter } from "./coEvents";
import { DocumentError, listEvents, recordEvent } from "./documents";
import { addFileExhibit, removeExhibit } from "./exhibits";
import { queueJoist } from "./joistSyncStore";
import type { MailAttachment } from "./send";
import type { BillingDocument } from "./types";

/** What the client agrees to by signing (kept word for word in the signature record). */
export const CO_CONSENT =
  "By signing, I approve this change order: the work and the price above are added to our contract. I agree that this electronic signature is as binding as a handwritten one.";

/** Register steps a change order can be approved from: sent to the client, or issued from Billing after pricing. */
const OPEN = ["sent", "priced"];

export type CoForLink = { id: number; status: string; amountCents: number | null; signedOn: string | null };

/** The change order whose current document this is (null: none, or a newer document replaced it). */
export async function coForDocument(documentId: string): Promise<CoForLink | null> {
  const { data, error } = await getSupabaseAdmin().from("change_orders").select("id,status,amount_cents,signed_on").eq("document_id", documentId).maybeSingle();
  if (error) throw new Error(`change_orders read: ${error.message}`);
  const r = data as { id: number; status: string; amount_cents: number | null; signed_on: string | null } | null;
  return r ? { id: r.id, status: r.status, amountCents: r.amount_cents, signedOn: r.signed_on } : null;
}

/** The client's signature on this change order's document, if there is one. */
export async function coClientSignature(documentId: string): Promise<Signature | null> {
  return signaturesOf(await listEvents(documentId)).find((s) => s.role === "client") ?? null;
}

/** Whether the link still takes an approval, and if not, the words that say why. */
export function approvalBlock(doc: Pick<BillingDocument, "status">, co: Pick<CoForLink, "status"> | null): string | null {
  if (doc.status === "void" || !co) return "This change order was withdrawn or replaced. Ask us for the current one.";
  if (co.status === "signed" || co.status === "billed") return "This change order is already approved.";
  if (!OPEN.includes(co.status) || doc.status !== "issued") return "This change order is not open for approval. Please call us.";
  return null;
}

export async function approveChangeOrder(
  doc: BillingDocument,
  sig: SignatureInput,
  meta: { ip: string; ua: string; today?: string },
): Promise<{ changeOrderId: number; signature: Signature; signedOn: string }> {
  if (doc.kind !== "change_order") throw new DocumentError("This link does not open a change order.", 404);
  const co = await coForDocument(doc.id);
  const blocked = approvalBlock(doc, co);
  if (blocked) throw new DocumentError(blocked, 409);
  const signedOn = meta.today ?? localDay();
  // The signature first: a change order never reads signed without its proof. If the
  // move below fails, the client's retry lands here again and the dedupe keeps one signature.
  const record: SignatureRecord = {
    role: "client",
    name: sig.name.trim().replace(/\s+/g, " "),
    email: sig.email ?? "",
    title: "",
    method: sig.method,
    typed: sig.method === "type" ? (sig.typed ?? "") : "",
    font: sig.method === "type" ? (sig.font ?? "") : "",
    image: sig.image,
    consent: CO_CONSENT,
    snapshotSha256: snapshotHash(doc.snapshot),
    ip: meta.ip.slice(0, 64),
    ua: meta.ua.slice(0, 300),
    totalCents: doc.totalCents,
  };
  await recordEvent({ documentId: doc.id, kind: "signed", actor: "client link", dedupe: `signed:client:${doc.id}`, detail: record });
  const db = getSupabaseAdmin();
  // Guarded: an owner voiding it, or a second tap, in the same moment loses here.
  const { data: moved, error } = await db
    .from("change_orders")
    .update({ status: "signed", signed_on: signedOn })
    .eq("id", co!.id)
    .eq("document_id", doc.id)
    .in("status", OPEN)
    .select("id");
  if (error) throw new Error(`change_orders approve: ${error.message}`);
  if (!(moved ?? []).length) throw new DocumentError(approvalBlock(doc, await coForDocument(doc.id)) ?? "This change order changed a moment ago. Load the page again.", 409);

  const signature = await coClientSignature(doc.id);
  if (!signature) throw new Error("change order: the signature was recorded but could not be read back");
  await coEventsAfter([co!.id], "signed", "client link", { signedOn, amountCents: co!.amountCents ?? doc.totalCents, name: record.name, via: "link" });
  await queueJoist(co!.id, "signed");
  return { changeOrderId: co!.id, signature, signedOn };
}

export type MarkInput = {
  /** Who approved it, as the client would sign: "Chris Turner". */
  name: string;
  /** The day they signed or said yes (YYYY-MM-DD, not in the future). */
  signedOn: string;
  /** Where the yes came from, in a few words ("reply to the CO email, Nov 1"). */
  note?: string;
  /** The signed copy or the approval email, as a PDF, PNG or JPG. */
  file?: MailAttachment | null;
};

/**
 * An owner records an approval that came back outside the link (signed on
 * paper, a signed PDF, a "yes" by email), with the proof when there is one:
 * the file goes on the change order's document (so the client's page shows
 * their signed copy), the register moves to signed with that day, one line on
 * the timeline, and the Joist copy is queued. Once, and only from sent or
 * priced. A file put up for an approval that loses the race is taken down.
 */
export async function markChangeOrderApproved(id: number, input: MarkInput, actor: string, today = localDay()): Promise<{ signedOn: string; exhibitId: string | null }> {
  const name = input.name.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 120) throw new DocumentError("Say who approved it.", 400);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.signedOn) || Number.isNaN(Date.parse(`${input.signedOn}T12:00:00Z`))) throw new DocumentError("The day it was approved is not a date.", 400);
  if (input.signedOn > today) throw new DocumentError("The day it was approved cannot be in the future.", 400);
  const note = (input.note ?? "").trim().slice(0, 300);
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("change_orders").select("id,status,amount_cents,document_id").eq("id", id).maybeSingle();
  if (error) throw new Error(`change_orders read: ${error.message}`);
  const co = data as { id: number; status: string; amount_cents: number | null; document_id: string | null } | null;
  if (!co) throw new DocumentError("No such change order.", 404);
  if (co.status === "signed" || co.status === "billed") throw new DocumentError("This change order is already approved.", 409);
  if (!OPEN.includes(co.status)) throw new DocumentError(`A ${co.status} change order cannot be approved; open it again first.`, 409);
  if (co.amount_cents === null) throw new DocumentError("Price it first.", 409);
  if (input.file && !co.document_id) throw new DocumentError("This change order has no document to keep the signed copy on. Open it to price first.", 409);

  let exhibitId: string | null = null;
  if (input.file && co.document_id) {
    const label = input.file.contentType === "application/pdf" ? "Signed copy" : "Approval";
    exhibitId = (await addFileExhibit({ documentId: co.document_id, lineIndex: null, label, filename: input.file.filename, content: input.file.content, contentType: input.file.contentType, addedBy: actor })).id;
  }
  const { data: moved, error: upErr } = await db.from("change_orders").update({ status: "signed", signed_on: input.signedOn }).eq("id", id).in("status", OPEN).select("id");
  if (upErr || !(moved ?? []).length) {
    if (exhibitId && co.document_id) await removeExhibit(exhibitId, co.document_id, "the approval was not recorded").catch(() => false);
    if (upErr) throw new Error(`change_orders approve: ${upErr.message}`);
    throw new DocumentError("This change order changed a moment ago. Load the page again.", 409);
  }
  await coEventsAfter([id], "signed", actor, { signedOn: input.signedOn, amountCents: co.amount_cents, name, via: "mark", proof: exhibitId, ...(note ? { note } : {}) });
  await queueJoist(id, "signed");
  return { signedOn: input.signedOn, exhibitId };
}
