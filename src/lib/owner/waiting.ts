import type { Overview } from "@/lib/billing/overview";
import { addDays, dayShort, localClock, localDay, localInstant, weekdayOf } from "@/lib/crew/time";
import { firstNameOf, isReportedDone, type CrewJob, type CrewPerson, type CrewReport, type CrewTask } from "@/lib/crew/types";
import type { Lane } from "./lanes";

// "Waiting on you": the owners' one list, pulled from what the app already
// holds. Each item belongs to a lane (lanes.ts); the screen shows an owner
// their own lanes first and the rest under "Waiting on <name>".
//
// Two kinds. A decision is something only an owner can say yes or no to. A
// signal is something going wrong that an owner should know about now. What a
// rule already handles (small purchases, early collection notices, a worker's
// own day) is never here. Pure and client-safe, so it is tested without a
// database and the screen and the server agree.

export type WaitingItem = {
  key: string;
  lane: Lane;
  kind: "decision" | "signal";
  title: string;
  detail: string;
  /** Where it is acted on. Always a screen of the app. */
  href: string;
  /** When it started waiting, if known. */
  at: string | null;
};

export type WaitingInput = {
  now: Date;
  people: Pick<CrewPerson, "email" | "name" | "active" | "perms">[];
  reports: CrewReport[];
  /** Live tasks plus the ones reported done and not checked (listTasks). */
  tasks: CrewTask[];
  jobs: CrewJob[];
  /** Worker time fixes not yet handled, and shifts flagged for review. */
  timefixes: number;
  reviews: number;
  money: Overview | null;
};

/** The plan is due the evening before, by 6 PM (the 30-day routine). */
export const PLAN_DUE = "18:00";
/** A promise this close, with work still open on the job, is a signal. */
export const PROMISE_WINDOW_DAYS = 3;
/** Marco calls at 14 days past due; Ilene at 7 (the ladder, billing/ladder.ts). */
export const MARCO_CALLS_AT = 14;
export const ILENE_CALLS_AT = 7;

const NEED_HEADING = "NEED FROM MARCO\n";

/** What the supervisor asked the owners for in a plan, or "". */
export function planAsk(body: string): string {
  const at = body.indexOf(NEED_HEADING);
  return at < 0 ? "" : body.slice(at + NEED_HEADING.length).trim();
}

function daysFrom(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
}

/** The crew works Monday to Saturday: the next working day after `day`. */
function nextWorkday(day: string): string {
  const next = addDays(day, 1);
  return weekdayOf(next) === 0 ? addDays(next, 1) : next;
}

function dollars(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString("en-US")}`;
}

function clip(text: string, max = 160): string {
  const one = text.replace(/\s+/g, " ").trim();
  return one.length > max ? `${one.slice(0, max - 1)}…` : one;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function isOpen(t: CrewTask): boolean {
  return t.status === "open" || t.status === "doing" || t.status === "blocked" || isReportedDone(t);
}

export function buildWaiting(input: WaitingInput): WaitingItem[] {
  const { now } = input;
  const today = localDay(now);
  const tomorrow = addDays(today, 1);
  const items: WaitingItem[] = [];

  // ---- the supervisor's plan ----------------------------------------------------
  const senders = input.people.filter((p) => p.active && p.perms.includes("plan.send"));
  const latest = new Map<string, CrewReport>();
  for (const r of [...input.reports].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))) {
    if (!latest.has(r.day)) latest.set(r.day, r);
  }
  for (const r of latest.values()) {
    if (r.day < today) continue;
    const ask = planAsk(r.body);
    if (!ask) continue;
    const who = firstNameOf(r.sentName) || r.sentBy.split("@")[0];
    items.push({
      key: `plan-ask-${r.id}`,
      lane: "decisions",
      kind: "decision",
      title: `${who} asks you`,
      detail: clip(ask),
      href: "/app/crew?view=plan",
      at: r.createdAt,
    });
  }
  if (senders.length && weekdayOf(tomorrow) !== 0 && !latest.has(tomorrow) && localClock(now) >= PLAN_DUE) {
    const who = senders.length === 1 ? firstNameOf(senders[0].name) : "The supervisor";
    items.push({
      key: `plan-late-${tomorrow}`,
      lane: "decisions",
      kind: "signal",
      title: `${who}'s plan for tomorrow is not in`,
      detail: "It was due by 6 PM.",
      href: "/app/crew?view=plan",
      at: localInstant(today, PLAN_DUE).toISOString(),
    });
  }

  // ---- work reported done and not checked -----------------------------------------
  const stale = input.tasks.filter((t) => {
    if (!isReportedDone(t)) return false;
    const said = t.reportedAt ?? t.closedAt;
    if (!said) return false;
    const due = localInstant(nextWorkday(localDay(said)), localClock(said));
    return now.getTime() > due.getTime();
  });
  if (stale.length) {
    const oldest = stale.map((t) => t.reportedAt ?? t.closedAt ?? "").sort()[0] || null;
    items.push({
      key: "tasks-unchecked",
      lane: "decisions",
      kind: "signal",
      title: `${plural(stale.length, "task", "tasks")} reported done, not checked for over a day`,
      detail: clip(stale.slice(0, 3).map((t) => [t.title, t.jobName].filter(Boolean).join(" · ")).join("; ")),
      href: "/app/crew",
      at: oldest,
    });
  }

  // ---- promises to clients ---------------------------------------------------------
  for (const job of input.jobs) {
    if (!job.active || !job.promised) continue;
    const days = daysFrom(today, job.promised);
    if (days > PROMISE_WINDOW_DAYS) continue;
    const open = input.tasks.filter((t) => t.jobId === job.id && isOpen(t)).length;
    if (!open) continue;
    const when = days < 0 ? `was due ${plural(-days, "day", "days")} ago` : days === 0 ? "is today" : days === 1 ? "is tomorrow" : `is in ${days} days`;
    items.push({
      key: `promise-${job.id}`,
      lane: "decisions",
      kind: "signal",
      title: `${job.name}: the promise ${when}`,
      detail: clip(`${job.promiseNote || "Promised to the client"} · ${plural(open, "task", "tasks")} still open`),
      href: "/app/crew?view=schedule",
      at: null,
    });
  }

  // ---- hours ----------------------------------------------------------------------
  const hours = input.timefixes + input.reviews;
  if (hours) {
    const parts = [
      input.timefixes ? plural(input.timefixes, "time fix", "time fixes") : "",
      input.reviews ? plural(input.reviews, "shift to review", "shifts to review") : "",
    ].filter(Boolean);
    items.push({
      key: "hours",
      lane: "money",
      kind: "decision",
      title: `Hours: ${parts.join(", ")}`,
      detail: "Fix them before payroll.",
      href: "/app/crew",
      at: null,
    });
  }

  // ---- money: the calls the ladder gives to people -----------------------------------
  for (const client of input.money?.clients ?? []) {
    for (const d of client.documents) {
      const late = d.next?.daysLate ?? 0;
      if (d.balanceCents <= 0 || late < ILENE_CALLS_AT) continue;
      const marco = late >= MARCO_CALLS_AT;
      items.push({
        key: `late-${d.doc.id}`,
        lane: marco ? "decisions" : "money",
        kind: "decision",
        title: `Call ${client.name}: ${d.doc.number} is ${late} days late`,
        detail: `${dollars(d.balanceCents)} open${d.next ? ` · next step ${dayShort(d.next.on)}: ${d.next.label}` : ""}`,
        href: `/app/money/${d.doc.id}`,
        at: d.doc.dueDate,
      });
    }
  }

  const rank = (i: WaitingItem) => (i.kind === "decision" ? 0 : 1);
  return items.sort((a, b) => rank(a) - rank(b) || (a.at ?? "9").localeCompare(b.at ?? "9"));
}
