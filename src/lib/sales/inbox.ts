import { readState } from "@/lib/bot/queries";
import { getLeadsState } from "@/lib/leads/store";
import type { LeadItem } from "@/lib/leads/types";

// What is waiting to come into the pipeline: callers on the Mac's call list
// (bot/leads.py, GoHighLevel + the KB's phone index) and bid invites nobody
// has answered (bot/bid_followup.py). One tap tracks it; the external ref
// keeps the same caller or invite from being tracked twice.

export type InboxItem = {
  ref: string;
  from: "call" | "bid";
  title: string;
  who: string;
  phone?: string;
  email?: string;
  detail: string;
  ageDays: number;
  dialUrl?: string;
};

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
  };
}

export async function loadInbox(tracked: Set<string>): Promise<InboxItem[]> {
  const out: InboxItem[] = [];
  try {
    const { state } = await getLeadsState();
    for (const l of state.fresh_list ?? []) {
      if (l.callback_status === "dismissed") continue;
      const item = leadToInbox(l);
      if (!tracked.has(item.ref)) out.push(item);
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
  return out.sort((a, b) => a.ageDays - b.ageDays).slice(0, 20);
}
