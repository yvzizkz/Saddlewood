import { escapeHtml } from "@/lib/emailTemplate";

// The message that carries a document to a client.
//
// Billing mail leaves from accounting@ through the mail service, not from a
// person's mailbox: the service reports delivery back to us
// (/api/billing/mail-events) and the address is the same whoever pressed send.
// The message is short and always carries the document's own link, because
// opening that link is what the proof record counts as "viewed".

export const BILLING_FROM = "Saddlewood Contracting Accounting <accounting@saddlewoodcontracting.com>";
export const BILLING_REPLY_TO = "accounting@saddlewoodcontracting.com";
export const INTERNAL_DOMAIN = "@saddlewoodcontracting.com";

const EMAIL = /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/;

export function cleanAddress(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  return v.length <= 254 && EMAIL.test(v) ? v : null;
}

export type Recipients = { to: string[]; cc: string[] };

/**
 * Who a document may be mailed to: the contacts on file for its client, and
 * people inside the company. Anyone else is refused by name, so a typo or a
 * guessed address cannot receive a client's billing.
 */
export function checkRecipients(
  to: unknown,
  cc: unknown,
  clientContacts: string[],
): { ok: true; recipients: Recipients } | { ok: false; error: string } {
  const known = new Set(clientContacts.map((c) => c.trim().toLowerCase()));
  const read = (raw: unknown, field: string): string[] | string => {
    if (raw === undefined || raw === null) return [];
    if (!Array.isArray(raw)) return `${field} must be a list of addresses`;
    const out: string[] = [];
    for (const item of raw) {
      const addr = cleanAddress(item);
      if (!addr) return `${field} has an address that is not valid`;
      if (!addr.endsWith(INTERNAL_DOMAIN) && !known.has(addr)) {
        return `${addr} is not a contact on file for this client`;
      }
      if (!out.includes(addr)) out.push(addr);
    }
    return out;
  };
  const toList = read(to, "to");
  if (typeof toList === "string") return { ok: false, error: toList };
  const ccList = read(cc, "cc");
  if (typeof ccList === "string") return { ok: false, error: ccList };
  if (toList.length === 0) return { ok: false, error: "to needs at least one address" };
  if (toList.length + ccList.length > 10) return { ok: false, error: "too many recipients" };
  return { ok: true, recipients: { to: toList, cc: ccList.filter((a) => !toList.includes(a)) } };
}

export function documentLink(siteUrl: string, token: string): string {
  return `${siteUrl.replace(/\/+$/, "")}/d/${token}`;
}

/**
 * The link our own people get on their copy. Opening it shows the same
 * document and writes nothing to the proof record, so a "viewed" line always
 * means someone outside the company.
 */
export function internalLink(link: string): string {
  return `${link}?copy=1`;
}

/** Split recipients into the client's side and ours. */
export function splitInternal(r: Recipients): { outside: Recipients; inside: string[] } {
  const isIn = (a: string) => a.endsWith(INTERNAL_DOMAIN);
  return {
    outside: { to: r.to.filter((a) => !isIn(a)), cc: r.cc.filter((a) => !isIn(a)) },
    inside: [...r.to, ...r.cc].filter(isIn),
  };
}

// ---------------------------------------------------------------------------
// Extra links, shown as buttons (a Joist invoice, for example)
// ---------------------------------------------------------------------------

export type MailLink = { label: string; url: string };

/** Hosts a billing message may link to besides our own document page. */
const LINK_HOSTS = ["joistapp.com", "saddlewoodcontracting.com"];

export function checkLinks(raw: unknown): { ok: true; links: MailLink[] } | { ok: false; error: string } {
  if (raw === undefined || raw === null) return { ok: true, links: [] };
  if (!Array.isArray(raw)) return { ok: false, error: "links must be a list" };
  if (raw.length > 8) return { ok: false, error: "too many links" };
  const links: MailLink[] = [];
  for (const item of raw) {
    const label = typeof item?.label === "string" ? item.label.replace(/\s+/g, " ").trim() : "";
    const href = typeof item?.url === "string" ? item.url.trim() : "";
    if (!label || label.length > 60) return { ok: false, error: "each link needs a label of 60 characters or fewer" };
    let url: URL;
    try {
      url = new URL(href);
    } catch {
      return { ok: false, error: `the link for "${label}" is not a valid address` };
    }
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || url.username || url.password) {
      return { ok: false, error: `the link for "${label}" must be a plain https address` };
    }
    if (!LINK_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) {
      return { ok: false, error: `the link for "${label}" goes to ${host}, which is not an approved site` };
    }
    links.push({ label, url: url.toString() });
  }
  return { ok: true, links };
}

// ---------------------------------------------------------------------------
// Attachments
// ---------------------------------------------------------------------------

export type MailAttachment = { filename: string; content: Buffer; contentType: string };

const ATTACHMENT_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};
export const MAX_ATTACHMENTS = 6;
/** The host accepts about 4.5 MB per request, and base64 adds a third. */
export const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024;

export function checkAttachments(raw: unknown): { ok: true; files: MailAttachment[] } | { ok: false; error: string } {
  if (raw === undefined || raw === null) return { ok: true, files: [] };
  if (!Array.isArray(raw)) return { ok: false, error: "attachments must be a list" };
  if (raw.length > MAX_ATTACHMENTS) return { ok: false, error: "too many attachments" };
  const files: MailAttachment[] = [];
  let total = 0;
  for (const item of raw) {
    // The last part of whatever path came with it, without characters a mail client may choke on.
    const given = typeof item?.filename === "string" ? (item.filename.split(/[\\/]/).pop() ?? "") : "";
    const name = given.replace(/[\x00-\x1f"<>|:*?]+/g, " ").replace(/\s+/g, " ").trim();
    const b64 = typeof item?.content === "string" ? item.content : "";
    const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
    if (!name || name.length > 120 || name.startsWith(".")) return { ok: false, error: "each attachment needs a file name" };
    if (!Object.prototype.hasOwnProperty.call(ATTACHMENT_TYPES, ext)) {
      return { ok: false, error: `${name}: only PDF, PNG, JPG and XLSX files can be attached` };
    }
    if (!b64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return { ok: false, error: `${name}: the file content is not readable` };
    const content = Buffer.from(b64, "base64");
    if (content.length === 0) return { ok: false, error: `${name}: the file is empty` };
    total += content.length;
    if (total > MAX_ATTACHMENT_BYTES) return { ok: false, error: "the attachments are too large to send together (3 MB limit)" };
    if (files.some((f) => f.filename.toLowerCase() === name.toLowerCase())) return { ok: false, error: `${name} is attached twice` };
    files.push({ filename: name, content, contentType: ATTACHMENT_TYPES[ext] });
  }
  return { ok: true, files };
}

// ---------------------------------------------------------------------------
// The message
// ---------------------------------------------------------------------------

export type BillingMessage = { subject: string; text: string; html: string };

export type MessageParts = {
  subject: unknown;
  body: unknown;
  /** The document's link and what its button says ("View statement"). Absent for a plain note. */
  document?: { link: string; label: string } | null;
  links?: MailLink[];
};

const BUTTON =
  "display:inline-block;background:#1f2937;color:#ffffff;text-decoration:none;font-weight:600;" +
  "font-size:14px;line-height:20px;padding:10px 18px;border-radius:6px";

function button(link: MailLink): string {
  return `<a href="${escapeHtml(link.url)}" style="${BUTTON}">${escapeHtml(link.label)}</a>`;
}

/**
 * The words are the sender's; the links are ours. In the body, "{link}" marks
 * where the document's button goes and "{links}" where the extra buttons go.
 * A body without the marker gets them at the end, so a document can never go
 * out without its link. The plain-text copy spells every address out.
 */
export function buildMessage(parts: MessageParts): BillingMessage | { error: string } {
  const s = typeof parts.subject === "string" ? parts.subject.replace(/[\r\n]+/g, " ").trim() : "";
  let b = typeof parts.body === "string" ? parts.body.replace(/\r\n/g, "\n").trim() : "";
  if (!s) return { error: "subject is required" };
  if (s.length > 200) return { error: "subject is too long" };
  if (!b) return { error: "body is required" };
  if (b.length > 5000) return { error: "body is too long" };

  const doc = parts.document ?? null;
  const links = parts.links ?? [];
  if (doc && !b.includes("{link}")) b += "\n\n{link}";
  if (!doc) b = b.split("{link}").join("").trim();
  if (links.length && !b.includes("{links}")) b += "\n\n{links}";
  if (!links.length) b = b.split("{links}").join("").trim();
  b = b.replace(/\n{3,}/g, "\n\n");

  const text = b
    .split("{links}")
    .join(links.map((l) => `${l.label}: ${l.url}`).join("\n"))
    .split("{link}")
    .join(doc ? `${doc.label}: ${doc.link}` : "");

  const para = (p: string): string => {
    const only = p.trim();
    if (only === "{link}" && doc) return `<p style="margin:4px 0 16px">${button({ label: doc.label, url: doc.link })}</p>`;
    if (only === "{links}") {
      return links.map((l) => `<p style="margin:4px 0 12px">${button(l)}</p>`).join("");
    }
    let h = escapeHtml(p).replace(/\n/g, "<br>");
    if (doc) h = h.split("{link}").join(`<a href="${escapeHtml(doc.link)}">${escapeHtml(doc.label)}</a>`);
    h = h.split("{links}").join(links.map((l) => `<a href="${escapeHtml(l.url)}">${escapeHtml(l.label)}</a>`).join(" · "));
    return `<p style="margin:0 0 12px">${h}</p>`;
  };
  const html =
    '<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;color:#111;max-width:640px">' +
    // A marker alone on its line becomes a button, wherever the line sits.
    b
      .replace(/^[ \t]*(\{links?\})[ \t]*$/gm, "\n\n$1\n\n")
      .split(/\n{2,}/)
      .filter((p) => p.trim())
      .map(para)
      .join("") +
    "</div>";
  return { subject: s, text, html };
}
