import { readState } from "@/lib/bot/queries";
import { getLeadsState } from "@/lib/leads/store";
import type { LeadItem } from "@/lib/leads/types";
import { listSubmissions, type Submission } from "@/lib/webforms/store";

// What is waiting to come into the pipeline: the website's contact form,
// callers on the Mac's call list (bot/leads.py, GoHighLevel + the KB's phone
// index) and bid invites nobody has answered (bot/bid_followup.py). One tap tracks it; the external ref
// keeps the same caller or invite from being tracked twice.
//
// The call list is the one the old /internal/leads page showed: its fresh
// callers first, then the backlog. A caller marked called or texted stays
// (with the mark) until it is tracked; dismissed ones drop out.
//
// A website lead has the fuller story, so it wins over the same phone on the
// call list, and its newest submission speaks for the person: dismissing it
// hides their older ones and the call list's row too. What the others said
// stays readable in its summary.

export type InboxItem = {
  ref: string;
  from: "call" | "bid" | "web";
  title: string;
  who: string;
  phone?: string;
  email?: string;
  detail: string;
  ageDays: number;
  dialUrl?: string;
  /** A caller someone already called or texted back (from the call list). */
  status?: "called" | "texted";
  /** A website lead: its web_submissions row, and the company on a builder's bid request. */
  webId?: number;
  company?: string;
  /** A website lead: everything they sent, shown when the row opens and noted on Track. */
  summary?: string;
};

export const INBOX_MAX = 30;

function addSummary(item: InboxItem, text: string): void {
  if (!text || item.summary?.includes(text)) return;
  item.summary = item.summary ? `${item.summary}\n\n${text}` : text;
}

export function phoneRef(phone: string): string {
  return `phone:${phone.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "")}`;
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

export function bidRef(project: string, gc: string): string {
  return `bid:${slug(project)}|${slug(gc)}`;
}

export function leadToInbox(l: LeadItem): InboxItem {
  const name = l.name?.trim() || (l.named ? l.display : "");
  return {
    ref: phoneRef(l.phone),
    from: "call",
    title: name ? `${name}` : l.display,
    who: name || l.display,
    phone: l.phone,
    email: l.email,
    detail: [l.tags.slice(0, 2).join(", "), l.snippet].filter(Boolean).join(" · ").slice(0, 200),
    ageDays: l.age_days,
    dialUrl: l.dial_url,
    ...(l.callback_status === "called" || l.callback_status === "texted" ? { status: l.callback_status } : {}),
  };
}

export function webToInbox(s: Submission, now = Date.now()): InboxItem {
  const hasPhone = s.phone.replace(/\D/g, "").length >= 7;
  const who = s.name || s.company || s.email;
  return {
    ref: hasPhone ? phoneRef(s.phone) : `email:${s.email.toLowerCase()}`,
    from: "web",
    title: s.company || who,
    who,
    ...(hasPhone ? { phone: s.phone } : {}),
    email: s.email,
    detail: ["Website", s.about].filter(Boolean).join(" · ").slice(0, 200),
    ageDays: Math.max(0, Math.floor((now - Date.parse(s.createdAt)) / 86_400_000)),
    webId: s.id,
    ...(s.company ? { company: s.company } : {}),
    ...(s.summary ? { summary: s.summary } : {}),
    ...(s.status === "called" || s.status === "texted" ? { status: s.status } : {}),
  };
}

export async function loadInbox(tracked: Set<string>): Promise<{ items: InboxItem[]; syncedAt: string | null }> {
  const out: InboxItem[] = [];
  let syncedAt: string | null = null;
  const seen = new Set<string>();
  const web = new Map<string, InboxItem>();
  try {
    for (const s of await listSubmissions(["contact"])) {
      const item = webToInbox(s);
      if (seen.has(item.ref)) {
        const newest = web.get(item.ref);
        if (newest) addSummary(newest, s.summary);
        continue;
      }
      seen.add(item.ref);
      if (s.status !== "dismissed" && !tracked.has(item.ref)) {
        out.push(item);
        web.set(item.ref, item);
      }
    }
  } catch (err) {
    console.error("sales inbox, website:", err);
  }
  try {
    const leads = await getLeadsState();
    syncedAt = leads.state.generated || leads.syncedAt;
    for (const l of [...(leads.state.fresh_list ?? []), ...(leads.state.backlog_list ?? [])]) {
      if (l.callback_status === "dismissed" || !l.phone) continue;
      const item = leadToInbox(l);
      if (tracked.has(item.ref)) continue;
      if (seen.has(item.ref)) {
        const site = web.get(item.ref);
        if (site && item.detail) addSummary(site, `Call list: ${item.detail}`);
        web.delete(item.ref); // the fresh row only, as for any caller on both lists
        continue;
      }
      seen.add(item.ref);
      out.push(item);
    }
  } catch (err) {
    console.error("sales inbox, leads:", err);
  }
  try {
    const { sections } = await readState();
    for (const b of sections.bids ?? []) {
      const ref = bidRef(b.project, b.gc);
      if (tracked.has(ref)) continue;
      out.push({ ref, from: "bid", title: b.project, who: b.gc, detail: `Bid invite from ${b.gc}, unanswered`, ageDays: b.ageDays });
    }
  } catch (err) {
    console.error("sales inbox, bids:", err);
  }
  return { items: out.sort((a, b) => a.ageDays - b.ageDays).slice(0, INBOX_MAX), syncedAt };
}
