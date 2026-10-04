import type { BotDraft, BotHome } from "./types";

// Small pure helpers for the app's screens. Client-safe: nothing here may
// import the server-only modules (queries, push).

export function ago(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 36) return `${h} hr ago`;
  return `${Math.round(h / 24)} days ago`;
}

export function elapsed(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const m = Math.max(0, Math.floor((now - t) / 60000));
  if (m < 1) return "under a minute";
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} hr ${m % 60} min`;
}

export function dayTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (sameDay) return time;
  return `${d.toLocaleDateString(undefined, { weekday: "short", month: "numeric", day: "numeric" })}, ${time}`;
}

export function shortDate(isoDate: string | null | undefined): string {
  if (!isoDate) return "";
  // A bare date (2026-10-09) is a calendar day, not midnight UTC.
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(isoDate);
  if (Number.isNaN(d.getTime())) return isoDate;
  const thisYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(thisYear ? {} : { year: "numeric" }),
  });
}

export function money(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function firstName(name: string | null | undefined): string {
  return (name ?? "").trim().split(/\s+/)[0] ?? "";
}

/** The person behind an address: their first name if they have a seat, else the mailbox name. */
export function personFor(email: string, names: Record<string, string>): string {
  if (!email) return "";
  return firstName(names[email]) || email.split("@")[0];
}

export function greeting(now: Date = new Date()): string {
  const h = now.getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

/** A draft this person can send right now. */
export function canApprove(draft: BotDraft, name: string | null): boolean {
  return !!name && !draft.held && !draft.blocked && draft.status === "open" && draft.approvers.includes(name);
}

/** How many things on Home are waiting on this person. Drives the tab badge. */
export function needsYouCount(home: BotHome | null): number {
  if (!home?.me.name) return 0;
  const drafts = home.sections.drafts.filter((d) => canApprove(d, home.me.name)).length;
  return drafts + home.sections.payments.length + home.sections.bids.length;
}

/** One line on what is wrong, or null when the bot is healthy. */
export function healthLine(home: BotHome): { tone: "ok" | "warn" | "bad"; label: string } {
  if (!home.bridge.seenAt) return { tone: "bad", label: "Not connected" };
  if (!home.bridge.online) return { tone: "bad", label: "Offline" };
  if (Object.keys(home.sections.health.problems).length) return { tone: "warn", label: "Needs attention" };
  return { tone: "ok", label: "Online" };
}

export const ACTION_LABELS: Record<string, string> = {
  "draft.approve": "approved a draft",
  "draft.schedule": "scheduled a draft",
  "draft.cancel": "cancelled a draft",
  "payment.confirm": "answered a payment",
  "bid.ack": "cleared a bid invite",
  "task.add": "added a to-do",
  "task.done": "finished a to-do",
  "task.drop": "dropped a to-do",
  "task.snooze": "snoozed a to-do",
  "ledger.close": "closed a waiting item",
  "duty.add": "gave the bot a duty",
  "duty.pause": "paused a duty",
  "duty.resume": "resumed a duty",
  "duty.delete": "removed a duty",
  "duty.run": "ran a duty now",
  "autosend.off": "stopped automatic sending",
};
