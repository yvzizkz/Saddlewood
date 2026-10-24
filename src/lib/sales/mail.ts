import { Resend } from "resend";

import { recordEvent } from "@/lib/billing/documents";
import { allowMirror } from "@/lib/billing/deliver";
import { siteUrl } from "@/lib/billing/http";
import {
  allowAddCommand,
  allowedByMirror,
  buildMessage,
  cleanAddress,
  documentLink,
  INTERNAL_DOMAIN,
  internalLink,
  mirrorIsFresh,
  type AllowMirror,
} from "@/lib/billing/send";
import type { BillingDocument } from "@/lib/billing/types";
import { laneAddresses } from "@/lib/crew/notify";
import { renderProposalPdf, pdfFileName, type PdfInput } from "./pdf";
import type { ProposalSnapshot } from "./presentation";
import { fillTemplate, SIGNATURE_FONTS, type RecipientRule, type SalesSettings } from "./settings";
import { publicSignature, type Signature } from "./signing";
import { addEvent, type EstimateSnapshot } from "./store";
import { usd } from "@/lib/money";

// Proposal mail: the one an owner sends (link, PDF, or both, after a
// preview), and the notices the signing workflow sends on its own when the
// client signs and when every signature is on (each one an owner turns on or
// off in Sales settings).
//
// Who may receive it is a Sales setting (email.recipients). "addressed", the
// default since 2026-10-19: a proposal goes to whoever the sender puts on it
// (the preview names any address not on the owner's allowlist, so a typo is
// seen before Send), and the client's signing notices go to those addresses
// and to the email the client typed when signing. "allowlist": the billing
// rule, our addresses plus the owner's outbound allowlist only. Either way the
// site never adds anyone to the allowlist; that stays a command on the Mac,
// and it still governs the bot's automated replies and billing mail.
//
// MAIL_DRY_RUN=1 (local testing only) writes every message to the log instead
// of the mail service, so a test can never reach a real inbox.

export type Refused = { address: string; reason: string; addCommand?: string };

export type Outgoing = {
  from: string;
  replyTo: string;
  to: string[];
  cc: string[];
  subject: string;
  text: string;
  html: string;
  attachments: { filename: string; content: Buffer }[];
};

function fromLine(s: SalesSettings): string {
  return `${s.email.fromName} <${s.email.fromAddress}>`;
}

/**
 * Sort addresses into ours, allowed outside, and refused (with why). Under the
 * "addressed" rule an outside address off the allowlist is allowed too, and
 * listed in `unlisted` so the preview can say so.
 */
export function screenRecipients(
  addresses: string[],
  allow: AllowMirror | null,
  rule: RecipientRule = "allowlist",
  now = Date.now(),
): { ok: string[]; refused: Refused[]; unlisted: string[] } {
  const ok: string[] = [];
  const refused: Refused[] = [];
  const unlisted: string[] = [];
  const fresh = mirrorIsFresh(allow, now);
  for (const raw of addresses) {
    const a = cleanAddress(raw);
    if (!a) {
      refused.push({ address: String(raw), reason: "not an email address" });
      continue;
    }
    if (ok.includes(a) || refused.some((r) => r.address === a)) continue;
    if (a.endsWith(INTERNAL_DOMAIN)) ok.push(a);
    else if (fresh && allowedByMirror(a, allow!)) ok.push(a);
    else if (rule === "addressed") {
      ok.push(a);
      unlisted.push(a);
    } else if (!fresh) refused.push({ address: a, reason: "the Mac has not reported the owner's allowlist lately, so no outside address can be sent to right now" });
    else refused.push({ address: a, reason: "not on the owner's outbound allowlist", addCommand: allowAddCommand(a) });
  }
  return { ok, refused, unlisted };
}

export type PdfContext = Omit<PdfInput, "proposal" | "signatures">;

export function pdfMeta(doc: BillingDocument): PdfInput["meta"] {
  const s = doc.snapshot;
  return {
    number: doc.number,
    date: s.date ?? doc.issuedAt,
    preparedFor: { name: s.billTo?.name ?? "", attention: s.billTo?.attention },
    project: { name: s.job?.name ?? doc.title, address: s.job?.address },
  };
}

/** The accepted choice, from the proof record, in the shape the PDF takes. */
export function acceptedFromEvents(events: { kind: string; at: string; detail: Record<string, unknown> }[]): PdfInput["accepted"] {
  const a = events.find((e) => e.kind === "accepted");
  if (!a) return null;
  const d = a.detail;
  return {
    name: String(d.name ?? ""),
    at: a.at,
    packageId: String(d.packageId ?? ""),
    packageName: String(d.packageName ?? ""),
    totalCents: Number(d.totalCents) || 0,
    options: Array.isArray(d.options) ? (d.options as { description: string; priceCents: number }[]).map((o) => ({ description: String(o.description), priceCents: Number(o.priceCents) || 0 })) : [],
  };
}

/** The signature record page of a signed PDF: who, when, how, from where, and the fingerprint. */
export function certificateLines(doc: BillingDocument, sigs: Signature[]): string[] {
  const lines = [`Proposal ${doc.number}, revision ${doc.revision}, issued ${doc.issuedAt ?? ""}`];
  for (const s of sigs) {
    lines.push(
      "",
      `${s.role === "client" ? "Client" : "Saddlewood Contracting"}: ${s.name}${s.email ? ` <${s.email}>` : ""}`,
      `Signed ${s.at} (UTC) by ${s.method === "type" ? `typing their name in the "${SIGNATURE_FONTS.find((f) => f.key === s.font)?.label ?? s.font}" style` : "drawing their signature"}`,
      `From IP ${s.ip || "unknown"}; browser ${s.ua.slice(0, 120) || "unknown"}`,
      `Agreed to: "${s.consent}"`,
      `Proposal fingerprint (SHA-256): ${s.snapshotSha256}`,
    );
  }
  return lines;
}

export async function proposalPdf(doc: BillingDocument, proposal: ProposalSnapshot, sigs: Signature[], events: { kind: string; at: string; detail: Record<string, unknown> }[]) {
  const signed = sigs.length > 0;
  const bytes = await renderProposalPdf({
    proposal,
    meta: pdfMeta(doc),
    signatures: sigs.map(publicSignature),
    accepted: acceptedFromEvents(events),
    certificate: signed ? certificateLines(doc, sigs) : undefined,
    watermark: doc.status === "void" ? "Withdrawn" : undefined,
  });
  return { filename: pdfFileName(doc.number, signed), content: Buffer.from(bytes) };
}

let dryRunCount = 0;

/** Hand one message to the mail service (or to the log, in a dry run). Returns its id. */
export async function sendMail(m: Outgoing): Promise<string> {
  if (process.env.MAIL_DRY_RUN === "1") {
    dryRunCount += 1;
    console.log(
      `[sales mail DRY RUN #${dryRunCount}] from=${m.from} to=${m.to.join(",")} cc=${m.cc.join(",")} subject=${JSON.stringify(m.subject)} attachments=${m.attachments.map((a) => `${a.filename}(${a.content.length}b)`).join(",")}\n${m.text}`,
    );
    return `dryrun-${Date.now()}-${dryRunCount}`;
  }
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("mail is not set up on this site (RESEND_API_KEY)");
  const { data, error } = await new Resend(key).emails.send({
    from: m.from,
    replyTo: m.replyTo,
    to: m.to,
    ...(m.cc.length ? { cc: m.cc } : {}),
    subject: m.subject,
    text: m.text,
    html: m.html,
    ...(m.attachments.length ? { attachments: m.attachments } : {}),
  });
  if (error || !data?.id) throw new Error(`the mail service refused the message: ${error?.message ?? "no id"}`);
  return data.id;
}

// ---- the owner's proposal email -------------------------------------------------

export type ProposalMailInput = { to: string[]; cc: string[]; subject: string; body: string; link: boolean; attachPdf: boolean };

export type PreparedMail =
  | { ok: false; error: string; refused?: Refused[] }
  | { ok: true; client: Outgoing; staffCopy: Outgoing | null; refused: Refused[]; unlisted: string[] };

/**
 * The message as it will leave: who from, to whom, the words with the
 * link's button where {link} sits (or no link), the PDF when asked. The
 * client's message carries the counted link; our people get their own copy
 * with the uncounted one.
 */
export async function prepareProposalMail(
  doc: BillingDocument,
  proposal: ProposalSnapshot,
  sigs: Signature[],
  events: { kind: string; at: string; detail: Record<string, unknown> }[],
  input: ProposalMailInput,
  settings: SalesSettings,
): Promise<PreparedMail> {
  if (!input.link && !input.attachPdf) return { ok: false, error: "send the link, the PDF, or both" };
  if (doc.status !== "issued" || !doc.token) return { ok: false, error: "this proposal was withdrawn" };
  const allow = await allowMirror();
  const rule = settings.email.recipients ?? "allowlist";
  const to = screenRecipients(input.to, allow, rule);
  const cc = screenRecipients(input.cc, allow, rule);
  const refused = [...to.refused, ...cc.refused];
  const unlisted = [...to.unlisted, ...cc.unlisted];
  const outsideTo = to.ok.filter((a) => !a.endsWith(INTERNAL_DOMAIN));
  const outsideCc = cc.ok.filter((a) => !a.endsWith(INTERNAL_DOMAIN));
  const inside = [...to.ok, ...cc.ok].filter((a) => a.endsWith(INTERNAL_DOMAIN));
  if (to.ok.length === 0) return { ok: false, error: refused.length ? "nobody it can go to" : "add who it goes to", refused };
  if (outsideTo.length + outsideCc.length + inside.length > 10) return { ok: false, error: "too many recipients" };

  const link = documentLink(siteUrl(), doc.token);
  const label = proposal.sign?.mode && proposal.sign.mode !== "none" ? "View and sign the proposal" : "View the proposal";
  const make = (url: string) => buildMessage({ subject: input.subject, body: input.body, document: input.link ? { link: url, label } : null });
  const mainMsg = make(link);
  if ("error" in mainMsg) return { ok: false, error: mainMsg.error };
  const copyMsg = make(internalLink(link));
  if ("error" in copyMsg) return { ok: false, error: copyMsg.error };

  const attachments = input.attachPdf ? [await proposalPdf(doc, proposal, sigs, events)] : [];
  const base = { from: fromLine(settings), replyTo: settings.email.replyTo, attachments };
  // Nobody outside: the whole message is our own people's (uncounted links).
  if (outsideTo.length === 0) {
    return { ok: true, client: { ...base, to: inside, cc: [], ...copyMsg }, staffCopy: null, refused, unlisted };
  }
  return {
    ok: true,
    client: { ...base, to: outsideTo, cc: outsideCc, ...mainMsg },
    staffCopy: inside.length ? { ...base, to: inside, cc: [], subject: `[Copy] ${copyMsg.subject}`, text: copyMsg.text, html: copyMsg.html } : null,
    refused,
    unlisted,
  };
}

export function defaultProposalWords(settings: SalesSettings, doc: BillingDocument, proposal: ProposalSnapshot, firstName: string, company: string) {
  const v = { title: proposal.title || doc.title, number: doc.number, company, first: firstName };
  return { subject: fillTemplate(settings.email.subject, v), body: fillTemplate(settings.email.body, v) };
}

/** Send what prepareProposalMail made, and write it to both records. */
export async function sendPrepared(doc: BillingDocument, prepared: Extract<PreparedMail, { ok: true }>, actor: string, input: ProposalMailInput, kind: "proposal" | "notice") {
  const emailId = await sendMail(prepared.client);
  await recordEvent({
    documentId: doc.id,
    kind: "sent",
    actor,
    emailId,
    detail: {
      to: prepared.client.to,
      cc: prepared.client.cc,
      subject: prepared.client.subject,
      link: input.link,
      attachments: prepared.client.attachments.map((a) => a.filename),
      mail: kind,
    },
  });
  if (prepared.staffCopy) {
    try {
      await sendMail(prepared.staffCopy);
    } catch (err) {
      console.error("sales mail: staff copy failed:", err);
    }
  }
  const oppId = (doc.snapshot as Partial<EstimateSnapshot>).opportunityId;
  if (oppId) {
    await addEvent(oppId, "emailed", actor, prepared.client.subject, {
      documentId: doc.id,
      to: prepared.client.to,
      link: input.link,
      attachments: prepared.client.attachments.map((a) => a.filename),
      kind,
    }).catch((err) => console.error("sales mail: timeline line not written:", err));
  }
  return emailId;
}

// ---- the signing workflow's notices -------------------------------------------------


/** The client's addresses for a notice: the email they gave when signing, and every outside address a person sent the proposal to. */
export function clientAddresses(sigs: Signature[], events: { kind: string; detail: Record<string, unknown> }[]): string[] {
  const fromSig = sigs.filter((s) => s.role === "client" && s.email).map((s) => s.email.toLowerCase());
  const sent = events.filter((e) => e.kind === "sent" && e.detail.mail !== "notice");
  const to = sent.flatMap((e) => [
    ...(Array.isArray(e.detail.to) ? (e.detail.to as string[]) : []),
    ...(Array.isArray(e.detail.cc) ? (e.detail.cc as string[]) : []),
  ]);
  return [...new Set([...fromSig, ...to.map((a) => a.toLowerCase())].filter((a) => !a.endsWith(INTERNAL_DOMAIN)))];
}

/**
 * After a signature: tell whoever the settings say. Never throws; what could
 * not be sent is logged and, for a client left out by the allowlist, written
 * to the timeline so the office sees it.
 */
export async function notifyAfterSignature(args: {
  doc: BillingDocument;
  proposal: ProposalSnapshot;
  sigs: Signature[];
  events: { kind: string; at: string; detail: Record<string, unknown> }[];
  settings: SalesSettings;
  who: "client" | "company";
  executed: boolean;
}): Promise<void> {
  const { doc, proposal, sigs, events, settings, who, executed } = args;
  const n = settings.email.notify;
  const oppId = (doc.snapshot as Partial<EstimateSnapshot>).opportunityId ?? null;
  const title = proposal.title || doc.title;
  const client = sigs.find((s) => s.role === "client");
  const accepted = acceptedFromEvents(events);
  const link = doc.token ? documentLink(siteUrl(), doc.token) : "";
  const say = accepted ? `${accepted.packageName ? `${accepted.packageName}, ` : ""}${usd(accepted.totalCents)}` : "";

  let pdf: { filename: string; content: Buffer } | null = null;
  const attach = async () => {
    if (!n.attachPdf) return [];
    try {
      pdf ??= await proposalPdf(doc, proposal, sigs, events);
      return [pdf];
    } catch (err) {
      console.error("sales notice: PDF not made:", err);
      return [];
    }
  };

  const send = async (to: string[], subject: string, body: string, url: string | null, label: string, kind: string) => {
    if (to.length === 0) return;
    const msg = buildMessage({ subject, body, document: url ? { link: url, label } : null });
    if ("error" in msg) return;
    const out: Outgoing = { from: fromLine(settings), replyTo: settings.email.replyTo, to, cc: [], attachments: await attach(), ...msg };
    try {
      const emailId = await sendMail(out);
      await recordEvent({ documentId: doc.id, kind: "sent", actor: "signing workflow", emailId, detail: { to, subject, mail: "notice", notice: kind, attachments: out.attachments.map((a) => a.filename) } });
      if (oppId) await addEvent(oppId, "emailed", "signing workflow", subject, { documentId: doc.id, to, kind, attachments: out.attachments.map((a) => a.filename) });
    } catch (err) {
      console.error(`sales notice (${kind}) not sent:`, err);
    }
  };

  // Ours: the sales lane and the copied addresses, with the uncounted link.
  const company = async () => [...new Set([...(await laneAddresses("sales").catch(() => [] as string[])), ...n.internalCc])].filter((a) => a.endsWith(INTERNAL_DOMAIN));

  // The client's, only to an address the owner allowed.
  const toClient = async (subject: string, body: string, kind: string) => {
    const addresses = clientAddresses(sigs, events);
    if (addresses.length === 0) {
      if (oppId) await addEvent(oppId, "note", "signing workflow", "The client's copy was not emailed: they gave no email when signing and the proposal was never emailed to them. Download the PDF from the proposal and send it.").catch(() => {});
      return;
    }
    const allow = await allowMirror();
    const { ok, refused } = screenRecipients(addresses, allow, settings.email.recipients ?? "allowlist");
    const outside = ok.filter((a) => !a.endsWith(INTERNAL_DOMAIN));
    await send(outside, subject, body, link || null, executed ? "View the signed proposal" : "View what you signed", kind);
    if (refused.length && oppId) {
      await addEvent(
        oppId,
        "note",
        "signing workflow",
        `The client's copy was not emailed: ${refused.map((r) => `${r.address} (${r.reason}${r.addCommand ? `; an owner allows it with: ${r.addCommand}` : ""})`).join("; ")}`,
      ).catch(() => {});
    }
  };

  if (who === "client") {
    if (n.companyOnClientSign) {
      await send(
        await company(),
        `${client ? "Signed" : "Accepted"}: ${title}${client ? ` by ${client.name}` : accepted ? ` by ${accepted.name}` : ""}`,
        `${client?.name ?? accepted?.name ?? "The client"} ${client ? "signed" : "accepted"} ${doc.number}${say ? ` (${say})` : ""}.${proposal.sign.mode === "both" && !executed ? "\n\nIt is waiting for our countersignature in the app (Sales)." : ""}\n\n{link}`,
        link ? internalLink(link) : null,
        "Open the proposal (staff copy)",
        "company_client_signed",
      );
    }
    // A proposal only the client signs is complete now: one message, the signed copy.
    if (executed ? n.clientOnExecuted || n.clientCopyOnSign : n.clientCopyOnSign) {
      await toClient(
        executed ? `Signed: ${title}` : `Your signed proposal: ${title}`,
        `Hi ${(client?.name ?? "").split(" ")[0] || "there"},\n\nThank you. ${executed ? "Your proposal is signed by everyone and in effect." : "We have your signature and will countersign shortly."}${say ? ` You chose ${say}.` : ""} A copy is ${n.attachPdf ? "attached and " : ""}on the page below.\n\n{link}\n\nSaddlewood Contracting`,
        executed ? "client_executed" : "client_copy",
      );
    }
    if (executed && n.companyOnExecuted && !n.companyOnClientSign) {
      await send(await company(), `Fully signed: ${title}`, `${doc.number} is fully signed.\n\n{link}`, link ? internalLink(link) : null, "Open the proposal (staff copy)", "company_executed");
    }
    return;
  }

  // Saddlewood countersigned.
  if (executed && n.clientOnExecuted) {
    await toClient(
      `Fully signed: ${title}`,
      `Hi ${(client?.name ?? "").split(" ")[0] || "there"},\n\nWe have countersigned. Your proposal is signed by both of us and in effect${say ? ` (${say})` : ""}. Your copy is ${n.attachPdf ? "attached and " : ""}on the page below. We will be in touch to schedule.\n\n{link}\n\nSaddlewood Contracting`,
      "client_executed",
    );
  }
  if (executed && n.companyOnExecuted) {
    await send(await company(), `Fully signed: ${title}`, `${doc.number} is now signed by both sides${say ? ` (${say})` : ""}.\n\n{link}`, link ? internalLink(link) : null, "Open the proposal (staff copy)", "company_executed");
  }
}
