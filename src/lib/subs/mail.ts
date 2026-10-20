import { allowMirror } from "@/lib/billing/deliver";
import { siteUrl } from "@/lib/billing/http";
import { buildMessage } from "@/lib/billing/send";
import { screenRecipients, sendMail, type Outgoing } from "@/lib/sales/mail";
import { loadSettings } from "@/lib/sales/settingsStore";
import { SubsError } from "./access";
import { markSent, packageDetail, recordBidEvent, type PackageDetail } from "./store";
import type { BidInvite } from "./types";

// Mail to subs: the invite (each sub's own link), an addendum notice, and the
// thank-you to the ones not chosen. Each is sent by a person after a preview,
// one message per sub so no sub sees another. Who may receive it follows the
// Sales setting for mail a person sends (email.recipients, "addressed" by
// default): the address on the directory, named in the preview when it is
// not on the owner's allowlist. The bot's automated mail never comes here.

export type SubMailKind = "invite" | "addendum" | "thanks";

export function bidLink(token: string): string {
  return `${siteUrl().replace(/\/+$/, "")}/b/${token}`;
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || "there";
}

function dueLine(dueAt: string | null): string {
  if (!dueAt) return "as soon as you can";
  return new Date(dueAt).toLocaleString("en-US", { timeZone: "America/Phoenix", weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** The words each kind starts from; the sender may change them. {first} is the contact's first name, {link} their button. */
export function defaultWords(kind: SubMailKind, d: Pick<PackageDetail, "pkg" | "job" | "addenda">, sender: string): { subject: string; body: string } {
  const where = d.job.address || d.job.name;
  const trade = d.pkg.trade;
  if (kind === "invite") {
    return {
      subject: `Bid invitation: ${trade}, ${d.job.name}`,
      body: `Hi {first},\n\nSaddlewood Contracting is taking bids for ${trade} at ${where}. The scope, the plans and the due date are on your link, and you can send your bid there:\n\n{link}\n\nBids are due ${dueLine(d.pkg.dueAt)} (Phoenix time). Questions: reply to this email.\n\nThank you,\n${sender}\nSaddlewood Contracting`,
    };
  }
  if (kind === "addendum") {
    const last = d.addenda[d.addenda.length - 1];
    return {
      subject: `Addendum ${last?.n ?? ""}: ${trade}, ${d.job.name}`.replace(/\s+/g, " "),
      body: `Hi {first},\n\nThe bid package for ${trade} at ${where} changed:\n\n${last?.text ?? ""}\n\nPlease price your bid against it. Your link has the full package:\n\n{link}\n\nBids are due ${dueLine(d.pkg.dueAt)} (Phoenix time).\n\nThank you,\n${sender}\nSaddlewood Contracting`,
    };
  }
  return {
    subject: `Thank you for your bid: ${trade}, ${d.job.name}`,
    body: `Hi {first},\n\nThank you for bidding ${trade} at ${where}. We went another way on this one. We would like to keep you on our list for the next.\n\nThank you,\n${sender}\nSaddlewood Contracting`,
  };
}

/** Who each kind goes to: invitees not yet sent (invite), every live invitee (addendum), the ones not chosen (thanks). */
export function recipientsFor(kind: SubMailKind, invites: Pick<BidInvite, "id" | "status" | "sentAt">[]): string[] {
  if (kind === "invite") return invites.filter((i) => i.status === "invited" && !i.sentAt).map((i) => i.id);
  if (kind === "addendum") return invites.filter((i) => (i.status === "invited" || i.status === "submitted") && i.sentAt).map((i) => i.id);
  return invites.filter((i) => i.status === "not_awarded").map((i) => i.id);
}

export type SubMailPlan = {
  messages: { inviteId: string; sub: string; to: string; unlisted: boolean; message: Outgoing }[];
  refused: { sub: string; address: string; reason: string }[];
};

export async function planSubMail(packageId: string, kind: SubMailKind, inviteIds: string[], words: { subject: string; body: string }): Promise<{ detail: PackageDetail; plan: SubMailPlan }> {
  const detail = await packageDetail(packageId);
  if (!detail) throw new SubsError("not found", 404);
  if (kind !== "thanks" && (detail.pkg.status === "awarded" || detail.pkg.status === "cancelled")) throw new SubsError(`this package is ${detail.pkg.status}`, 409);
  if (kind !== "thanks" && !detail.pkg.lines.length) throw new SubsError("add the scope lines before it goes out", 400);
  const settings = await loadSettings();
  const allow = await allowMirror();
  const rule = settings.email.recipients ?? "allowlist";
  const plan: SubMailPlan = { messages: [], refused: [] };
  for (const id of inviteIds) {
    const inv = detail.invites.find((i) => i.id === id);
    if (!inv) continue;
    const screened = screenRecipients([inv.contactEmail], allow, rule);
    if (!screened.ok.length) {
      for (const r of screened.refused) plan.refused.push({ sub: inv.sub.name, address: r.address, reason: r.reason });
      continue;
    }
    const body = words.body.split("{first}").join(firstName(inv.contactName));
    const msg = buildMessage({
      subject: words.subject,
      body,
      document: kind === "thanks" ? null : { link: bidLink(inv.token), label: kind === "invite" ? "Open the bid package" : "Open the package" },
    });
    if ("error" in msg) throw new SubsError(msg.error, 400);
    plan.messages.push({
      inviteId: inv.id,
      sub: inv.sub.name,
      to: screened.ok[0],
      unlisted: screened.unlisted.length > 0,
      message: { from: `${settings.email.fromName} <${settings.email.fromAddress}>`, replyTo: settings.email.replyTo, to: screened.ok, cc: [], subject: msg.subject, text: msg.text, html: msg.html, attachments: [] },
    });
  }
  return { detail, plan };
}

/** Send what the preview showed. A message that fails is reported; the others still go. */
export async function sendSubMail(packageId: string, kind: SubMailKind, plan: SubMailPlan, actor: string): Promise<{ sent: string[]; failed: { sub: string; error: string }[] }> {
  const sent: string[] = [];
  const failed: { sub: string; error: string }[] = [];
  for (const m of plan.messages) {
    try {
      const emailId = await sendMail(m.message);
      sent.push(m.inviteId);
      await recordBidEvent(packageId, m.inviteId, kind === "thanks" ? "thanked" : "sent", actor, { to: m.to, subject: m.message.subject, emailId, mail: kind });
    } catch (err) {
      failed.push({ sub: m.sub, error: (err as Error).message });
    }
  }
  if (kind === "invite") await markSent(sent);
  return { sent, failed };
}
