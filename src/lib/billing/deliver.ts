import { Resend } from "resend";

import { readState } from "@/lib/bot/queries";
import { claimForSend, clientContactEmails, DocumentError, getDocument, issueDocument, recordEvent, releaseClaim } from "./documents";
import { listExhibits, readExhibitFile } from "./exhibits";
import {
  BILLING_FROM,
  BILLING_REPLY_TO,
  buildMessage,
  checkAttachments,
  checkLinks,
  checkRecipients,
  copyLinks,
  documentLink,
  internalLink,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS,
  RECORDS_COPY,
  splitInternal,
  type AllowMirror,
  type BillingMessage,
  type MailAttachment,
  type MailLink,
  type Recipients,
} from "./send";
import type { BillingDocument, DocumentKind, SendGroup } from "./types";

// One way out for billing mail, with or without a document behind it.
//
// Two steps on purpose: without "confirm": true the answer is the exact
// message that would go out and nothing is sent.
//
// When a document goes to a client and our own people are on the message too,
// they get a separate copy whose link does not count as a viewing. Otherwise
// Marco opening his copy would look, in the proof record, like the client
// reading the invoice.
//
// Sending issues it (Saddlewood-KB docs/BILLING-ISSUE-PLAN-2026-10-12.md): a
// draft is locked at the moment it goes out, not before, so it can be
// previewed and changed as often as needed. The order is what keeps that
// honest, because an issued document can never go back to being a draft:
//   1. hold each draft (documents.claimForSend): it gets the token its link
//      will carry, and no one can change it or send it twice meanwhile;
//   2. send the message;
//   3. only then issue each draft, with the token its message carries.
// If the mail service refuses, the holds are let go and every draft is a
// draft again, exactly as it was.
//
// A send group (several documents, one email) is the same message with one
// button per document and one "sent" line on each document's proof record.

const SITE_URL = "https://saddlewoodcontracting.com";

const VIEW_LABEL: Record<DocumentKind, string> = {
  estimate: "View estimate",
  change_order: "View change order",
  invoice: "View invoice",
  statement: "View statement",
  notice: "View notice",
  agreement: "View agreement",
};

/** Shown in a dry run where a draft's link will go: it is made at the moment it is sent. */
const LINK_MADE_WHEN_SENT = "(made when sent)";

export type DeliverResult = { status: number; body: Record<string, unknown> };

const refuse = (status: number, error: string): DeliverResult => ({ status, body: { ok: false, error } });

/** A single document, or a plain note (doc = null). */
export async function deliver(actor: string, doc: BillingDocument | null, input: Record<string, unknown>): Promise<DeliverResult> {
  return deliverDocuments(actor, doc ? [doc] : [], input, null);
}

/** Every document in a send group, in one message. */
export async function deliverGroup(
  actor: string,
  group: SendGroup,
  docs: BillingDocument[],
  input: Record<string, unknown>,
): Promise<DeliverResult> {
  if (docs.length === 0) return refuse(409, "this send group has no documents");
  if (docs.length > 8) return refuse(400, "too many documents for one message (8 at most)");
  return deliverDocuments(actor, docs, input, group);
}

/** Per-document button names for a group: { "<id or number>": "Invoice 8009-13" }. */
function readLabels(raw: unknown): Record<string, string> | string {
  if (raw === undefined || raw === null) return {};
  if (typeof raw !== "object" || Array.isArray(raw)) return "linkLabels must name each document's button by its id or number";
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v !== "string") return "each button name must be text";
    const label = v.replace(/\s+/g, " ").trim().slice(0, 60);
    if (label) out[k] = label;
  }
  return out;
}

/** The owner's allowlist as the Mac last reported it; null when it has not, or the state cannot be read (then no outside address passes). */
export async function allowMirror(): Promise<AllowMirror | null> {
  try {
    const { sections } = await readState();
    return sections.outboundAllow ?? null;
  } catch (err) {
    console.error("billing send: could not read the allowlist mirror:", err);
    return null;
  }
}

const ATTACH_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

/**
 * The files on the documents' own pages (the Joist PDF, the signed waiver the
 * Mac put there), ready to ride on the message. The phone never uploads them.
 */
export async function exhibitAttachments(docs: BillingDocument[]): Promise<{ ok: true; files: MailAttachment[] } | { ok: false; error: string }> {
  const files: MailAttachment[] = [];
  for (const d of docs) {
    const exhibits = (await listExhibits(d.id)).filter((x) => x.kind === "file" && x.storagePath);
    for (const x of exhibits) {
      const ext = (x.storagePath!.split(".").pop() ?? "").toLowerCase();
      if (!Object.prototype.hasOwnProperty.call(ATTACH_TYPES, ext)) continue; // an image type the page shows but mail does not carry
      const base = x.label.replace(/[\x00-\x1f"<>|:*?/\\]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || d.number;
      let name = `${base}.${ext}`;
      if (files.some((f) => f.filename.toLowerCase() === name.toLowerCase())) name = `${d.number} ${base}.${ext}`;
      const content = await readExhibitFile(x.storagePath!);
      files.push({ filename: name, content, contentType: x.contentType || ATTACH_TYPES[ext] });
    }
  }
  return { ok: true, files };
}

/** Files given with the request plus the pages' own, under the one limit that applies to the message. */
export function mergeAttachments(given: MailAttachment[], fromPages: MailAttachment[]): { ok: true; files: MailAttachment[] } | { ok: false; error: string } {
  const files = [...given];
  for (const f of fromPages) {
    if (!files.some((g) => g.filename.toLowerCase() === f.filename.toLowerCase())) files.push(f);
  }
  if (files.length > MAX_ATTACHMENTS) return { ok: false, error: `too many attachments (${files.length}; ${MAX_ATTACHMENTS} at most). Take an exhibit down or send without the pages' files.` };
  const total = files.reduce((s, f) => s + f.content.length, 0);
  if (total > MAX_ATTACHMENT_BYTES) {
    return { ok: false, error: `the attachments come to ${(total / 1024 / 1024).toFixed(1)} MB; the limit is ${MAX_ATTACHMENT_BYTES / 1024 / 1024} MB together. Take an exhibit down or send without the pages' files.` };
  }
  return { ok: true, files };
}

type Composed = {
  main: BillingMessage;
  copy: BillingMessage | null;
  mainTo: string[];
  mainCc: string[];
  bcc: string[];
  inside: string[];
  split: boolean;
  preview: Record<string, unknown>;
};

async function deliverDocuments(
  actor: string,
  docs: BillingDocument[],
  input: Record<string, unknown>,
  group: SendGroup | null,
): Promise<DeliverResult> {
  const name = (d: BillingDocument, msg: string) => (group ? `${d.number}: ${msg}` : msg);
  for (const d of docs) {
    if (d.status === "void") return refuse(409, name(d, "a void document cannot be sent"));
    if (d.status === "issued" && !d.token) return refuse(409, name(d, "this document has no link"));
  }

  // One client per message: its contacts on file are who may receive it.
  const clients = [...new Set(docs.map((d) => d.clientId))];
  if (clients.length > 1) return refuse(409, "the documents in this group are for different clients");
  const clientId = clients[0] ?? null;
  if (group && group.clientId && docs.some((d) => d.clientId !== group.clientId)) {
    return refuse(409, "a document in this group is for a different client than the group");
  }

  const contacts = clientId ? await clientContactEmails(clientId) : [];
  const checked = checkRecipients(input.to, input.cc, contacts, await allowMirror());
  if (!checked.ok) return refuse(400, checked.error);
  const links = checkLinks(input.links);
  if (!links.ok) return refuse(400, links.error);
  const attached = checkAttachments(input.attachments);
  if (!attached.ok) return refuse(400, attached.error);
  // "attachExhibits": the files on the documents' pages ride along (the Bill screen's send).
  let mailFiles: MailAttachment[] = attached.files;
  if (input.attachExhibits === true && docs.length) {
    const fromPages = await exhibitAttachments(docs);
    if (!fromPages.ok) return refuse(400, fromPages.error);
    const merged = mergeAttachments(attached.files, fromPages.files);
    if (!merged.ok) return refuse(400, merged.error);
    mailFiles = merged.files;
  }
  const named = typeof input.linkLabel === "string" ? input.linkLabel.replace(/\s+/g, " ").trim().slice(0, 60) : "";
  const labels = readLabels(input.linkLabels);
  if (typeof labels === "string") return refuse(400, labels);

  const site = process.env.NEXT_PUBLIC_SITE_URL || SITE_URL;
  // The document's button reads "View invoice" unless the sender names it (e.g.
  // "Invoice 8009-13"). In a group each button says which document it opens.
  const labelOf = (d: BillingDocument): string =>
    group ? labels[d.id] || labels[d.number] || `${VIEW_LABEL[d.kind]} ${d.number}` : named || VIEW_LABEL[d.kind];

  const parts = splitInternal(checked.recipients);
  const { outside } = parts;
  const hasOutside = outside.to.length + outside.cc.length > 0;
  // The office (info@) sees everything accounting@ sends: on a client message
  // it is on our own copy; otherwise it is a bcc.
  const inside = parts.inside.includes(RECORDS_COPY) ? parts.inside : [...parts.inside, RECORDS_COPY];

  function compose(tokens: Map<string, string | null>): Composed | { error: string } {
    const linkOf = (d: BillingDocument) => {
      const t = tokens.get(d.id);
      return t ? documentLink(site, t) : null;
    };
    const shown = (d: BillingDocument) => linkOf(d) ?? documentLink(site, LINK_MADE_WHEN_SENT);
    const hasDocs = docs.length > 0;
    // A plain note, or a document going only to our own people, is one message.
    const split = hasDocs && hasOutside;
    const all: Recipients = checked.ok ? checked.recipients : { to: [], cc: [] };
    const allRecipients = [...all.to, ...all.cc];
    const bcc = !split && !allRecipients.includes(RECORDS_COPY) ? [RECORDS_COPY] : [];

    const main = buildMessage({
      subject: input.subject,
      body: input.body,
      documents: docs.map((d) => ({ link: hasOutside ? shown(d) : internalLink(shown(d)), label: labelOf(d) })),
      links: links.ok ? links.links : [],
    });
    if ("error" in main) return main;

    const mainTo = split ? (outside.to.length ? outside.to : outside.cc) : all.to;
    const mainCc = split ? (outside.to.length ? outside.cc : []) : all.cc;

    const copy = split
      ? buildMessage({
          subject: input.subject,
          body: `Copy for our records. This went to ${[...mainTo, ...mainCc].join(", ")}.\n\n${String(input.body)}`,
          documents: docs.map((d) => ({ link: internalLink(shown(d)), label: labelOf(d) })),
          links: copyLinks(links.ok ? links.links : ([] as MailLink[])),
        })
      : null;
    if (copy && "error" in copy) return copy;

    const describe = (d: BillingDocument) => ({
      number: d.number,
      kind: d.kind,
      link: linkOf(d),
      ...(d.status === "draft" ? { issuesOnSend: true } : {}),
    });
    const preview: Record<string, unknown> = {
      from: BILLING_FROM,
      replyTo: BILLING_REPLY_TO,
      to: mainTo,
      cc: mainCc,
      subject: main.subject,
      body: main.text,
      attachments: mailFiles.map((f) => ({ filename: f.filename, bytes: f.content.length })),
      ...(group
        ? { group: { id: group.id, name: group.name }, documents: docs.map((d) => ({ id: d.id, ...describe(d) })) }
        : { document: docs[0] ? describe(docs[0]) : null }),
      internalCopy: split ? { to: inside, note: "separate copy; its link is not counted as a viewing" } : null,
      bcc,
    };
    return { main, copy, mainTo, mainCc, bcc, inside, split, preview };
  }

  const known = new Map<string, string | null>(docs.map((d) => [d.id, d.status === "issued" ? d.token : null]));
  const dry = compose(known);
  if ("error" in dry) return refuse(400, dry.error);
  if (input.confirm !== true) return { status: 200, body: { ok: true, sent: false, preview: dry.preview } };

  const key = process.env.RESEND_API_KEY;
  if (!key) return refuse(503, "mail service is not set up");

  // 1. Hold the drafts. Nothing is issued yet.
  const held = new Map<string, string>();
  const letGo = async () => {
    for (const [id, token] of held) {
      try {
        await releaseClaim(id, token);
      } catch (err) {
        console.error("billing send: could not let a draft go:", id, err);
      }
    }
  };
  for (const d of docs) {
    if (d.status !== "draft") continue;
    try {
      held.set(d.id, await claimForSend(d.id));
    } catch (err) {
      await letGo();
      if (err instanceof DocumentError) return refuse(err.status, name(d, err.message));
      throw err;
    }
  }

  const tokens = new Map(known);
  for (const [id, token] of held) tokens.set(id, token);
  const out = compose(tokens);
  if ("error" in out) {
    await letGo();
    return refuse(400, out.error);
  }
  const { main, copy, mainTo, mainCc, bcc, split } = out;

  // 2. Send.
  const resend = new Resend(key);
  const files = mailFiles.length ? { attachments: mailFiles } : {};
  let data: { id: string } | null = null;
  let error: unknown = null;
  try {
    ({ data, error } = await resend.emails.send({
      from: BILLING_FROM,
      replyTo: BILLING_REPLY_TO,
      to: mainTo,
      ...(mainCc.length ? { cc: mainCc } : {}),
      ...(bcc.length ? { bcc } : {}),
      subject: main.subject,
      text: main.text,
      html: main.html,
      ...files,
    }));
  } catch (err) {
    if (held.size === 0) throw err;
    error = err;
  }
  if (error || !data?.id) {
    console.error("billing send:", error);
    await letGo();
    return refuse(
      502,
      held.size ? "the mail service refused the message; nothing was sent, and the drafts are still drafts" : "the mail service refused the message; nothing was sent",
    );
  }
  const emailId = data.id;

  // The client's message is gone. Nothing after this may turn the answer into
  // a failure: a retry would mail the client twice.
  let copySent: boolean | null = null;
  if (copy) {
    try {
      const res = await resend.emails.send({
        from: BILLING_FROM,
        replyTo: BILLING_REPLY_TO,
        to: out.inside,
        subject: copy.subject,
        text: copy.text,
        html: copy.html,
        ...files,
      });
      copySent = !res.error;
    } catch (err) {
      copySent = false;
      console.error("billing send: internal copy failed:", err);
    }
  }

  // 3. Issue what went out as a draft, with the token its message carries.
  const issued: string[] = [];
  const notIssued: string[] = [];
  const now = new Date();
  for (const [id, token] of held) {
    try {
      await issueDocument(id, actor, now, { token });
      issued.push(id);
    } catch (err) {
      // Someone pressed Issue meanwhile: the same token, so the same link.
      const current = await getDocument(id).catch(() => null);
      if (current?.status === "issued" && current.token === token) {
        issued.push(id);
      } else {
        notIssued.push(id);
        console.error("billing send: sent but not issued (its link opens once it is issued):", id, err);
      }
    }
  }

  const recordedEach: boolean[] = [];
  for (const d of docs) {
    try {
      await recordEvent({
        documentId: d.id,
        kind: "sent",
        actor,
        emailId,
        // One message, several documents: one line each.
        dedupe: group ? `sent:${emailId}:${d.id}` : `sent:${emailId}`,
        detail: {
          from: BILLING_REPLY_TO,
          to: mainTo,
          cc: mainCc,
          subject: main.subject,
          via: "mail service",
          ...(mailFiles.length ? { attachments: mailFiles.map((f) => f.filename) } : {}),
          ...(links.links.length ? { links: links.links.map((l) => l.label) } : {}),
          ...(split ? { internalCopy: out.inside } : {}),
          ...(held.has(d.id) ? { issued: true } : {}),
          ...(group ? { group: { id: group.id, name: group.name, documents: docs.map((x) => x.number) } } : {}),
        },
      });
      recordedEach.push(true);
    } catch (err) {
      recordedEach.push(false);
      console.error("billing send: sent but not recorded:", d.id, err);
    }
  }
  const recorded = docs.length ? recordedEach.every(Boolean) : null;

  return {
    status: 200,
    body: {
      ok: true,
      sent: true,
      emailId,
      recorded,
      copySent,
      preview: out.preview,
      ...(held.size ? { issued, notIssued } : {}),
      ...(notIssued.length ? { warning: "sent, but not every draft could be issued; issue it now so its link opens" } : {}),
    },
  };
}
