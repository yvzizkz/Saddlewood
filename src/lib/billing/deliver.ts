import { Resend } from "resend";

import { clientContactEmails, recordEvent } from "./documents";
import {
  BILLING_FROM,
  BILLING_REPLY_TO,
  buildMessage,
  checkAttachments,
  checkLinks,
  checkRecipients,
  documentLink,
  internalLink,
  splitInternal,
} from "./send";
import type { BillingDocument, DocumentKind } from "./types";

// One way out for billing mail, with or without a document behind it.
//
// Two steps on purpose: without "confirm": true the answer is the exact
// message that would go out and nothing is sent.
//
// When a document goes to a client and our own people are on the message too,
// they get a separate copy whose link does not count as a viewing. Otherwise
// Marco opening his copy would look, in the proof record, like the client
// reading the invoice.

const SITE_URL = "https://saddlewoodcontracting.com";

const VIEW_LABEL: Record<DocumentKind, string> = {
  estimate: "View estimate",
  change_order: "View change order",
  invoice: "View invoice",
  statement: "View statement",
  notice: "View notice",
};

export type DeliverResult = { status: number; body: Record<string, unknown> };

const refuse = (status: number, error: string): DeliverResult => ({ status, body: { ok: false, error } });

export async function deliver(actor: string, doc: BillingDocument | null, input: Record<string, unknown>): Promise<DeliverResult> {
  if (doc && (doc.status !== "issued" || !doc.token)) return refuse(409, "only an issued document can be sent");

  const contacts = doc?.clientId ? await clientContactEmails(doc.clientId) : [];
  const checked = checkRecipients(input.to, input.cc, contacts);
  if (!checked.ok) return refuse(400, checked.error);
  const links = checkLinks(input.links);
  if (!links.ok) return refuse(400, links.error);
  const attached = checkAttachments(input.attachments);
  if (!attached.ok) return refuse(400, attached.error);

  const link = doc?.token ? documentLink(process.env.NEXT_PUBLIC_SITE_URL || SITE_URL, doc.token) : null;
  const label = doc ? VIEW_LABEL[doc.kind] : "";
  const { outside, inside } = splitInternal(checked.recipients);
  const hasOutside = outside.to.length + outside.cc.length > 0;
  // A plain note, or a document going only to our own people, is one message.
  const split = Boolean(doc) && hasOutside && inside.length > 0;

  const main = buildMessage({
    subject: input.subject,
    body: input.body,
    document: link ? { link: hasOutside ? link : internalLink(link), label } : null,
    links: links.links,
  });
  if ("error" in main) return refuse(400, main.error);

  const mainTo = split ? (outside.to.length ? outside.to : outside.cc) : checked.recipients.to;
  const mainCc = split ? (outside.to.length ? outside.cc : []) : checked.recipients.cc;

  const copy = split
    ? buildMessage({
        subject: input.subject,
        body: `Copy for our records. This went to ${[...mainTo, ...mainCc].join(", ")}.\n\n${String(input.body)}`,
        document: { link: internalLink(link!), label },
        links: links.links,
      })
    : null;
  if (copy && "error" in copy) return refuse(400, copy.error);

  const preview = {
    from: BILLING_FROM,
    replyTo: BILLING_REPLY_TO,
    to: mainTo,
    cc: mainCc,
    subject: main.subject,
    body: main.text,
    attachments: attached.files.map((f) => ({ filename: f.filename, bytes: f.content.length })),
    document: doc ? { number: doc.number, kind: doc.kind, link } : null,
    internalCopy: split ? { to: inside, note: "separate copy; its link is not counted as a viewing" } : null,
  };
  if (input.confirm !== true) return { status: 200, body: { ok: true, sent: false, preview } };

  const key = process.env.RESEND_API_KEY;
  if (!key) return refuse(503, "mail service is not set up");
  const resend = new Resend(key);
  const files = attached.files.length ? { attachments: attached.files } : {};

  const { data, error } = await resend.emails.send({
    from: BILLING_FROM,
    replyTo: BILLING_REPLY_TO,
    to: mainTo,
    ...(mainCc.length ? { cc: mainCc } : {}),
    subject: main.subject,
    text: main.text,
    html: main.html,
    ...files,
  });
  if (error || !data?.id) {
    console.error("billing send:", error);
    return refuse(502, "the mail service refused the message; nothing was sent");
  }

  // The client's message is gone. Nothing after this may turn the answer into
  // a failure: a retry would mail the client twice.
  let copySent: boolean | null = null;
  if (copy && !("error" in copy)) {
    try {
      const res = await resend.emails.send({
        from: BILLING_FROM,
        replyTo: BILLING_REPLY_TO,
        to: inside,
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

  let recorded: boolean | null = null;
  if (doc) {
    try {
      await recordEvent({
        documentId: doc.id,
        kind: "sent",
        actor,
        emailId: data.id,
        dedupe: `sent:${data.id}`,
        detail: {
          from: BILLING_REPLY_TO,
          to: mainTo,
          cc: mainCc,
          subject: main.subject,
          via: "mail service",
          ...(attached.files.length ? { attachments: attached.files.map((f) => f.filename) } : {}),
          ...(links.links.length ? { links: links.links.map((l) => l.label) } : {}),
          ...(split ? { internalCopy: inside } : {}),
        },
      });
      recorded = true;
    } catch (err) {
      recorded = false;
      console.error("billing send: sent but not recorded:", err);
    }
  }
  return { status: 200, body: { ok: true, sent: true, emailId: data.id, recorded, copySent, preview } };
}
