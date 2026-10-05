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

export type BillingMessage = { subject: string; text: string; html: string };

/**
 * The words are the sender's; the link is ours. "{link}" in the body is
 * replaced with the document's link, and a body without it gets the link on
 * its own line at the end, so no billing message can go out without one.
 */
export function buildMessage(subject: unknown, body: unknown, link: string): BillingMessage | { error: string } {
  const s = typeof subject === "string" ? subject.replace(/[\r\n]+/g, " ").trim() : "";
  const b = typeof body === "string" ? body.replace(/\r\n/g, "\n").trim() : "";
  if (!s) return { error: "subject is required" };
  if (s.length > 200) return { error: "subject is too long" };
  if (!b) return { error: "body is required" };
  if (b.length > 5000) return { error: "body is too long" };

  const text = b.includes("{link}") ? b.split("{link}").join(link) : `${b}\n\n${link}`;
  const html =
    '<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;color:#111;max-width:640px">' +
    text
      .split(/\n{2,}/)
      .map((p) => `<p style="margin:0 0 12px">${linkify(escapeHtml(p), link).replace(/\n/g, "<br>")}</p>`)
      .join("") +
    "</div>";
  return { subject: s, text, html };
}

function linkify(escaped: string, link: string): string {
  const safe = escapeHtml(link);
  return escaped.split(safe).join(`<a href="${safe}">${safe}</a>`);
}
