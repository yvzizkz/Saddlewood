import type { Overview } from "@/lib/billing/overview";
import { addDays, dayShort, localClock, localDay, localInstant, weekdayOf } from "@/lib/crew/time";
import type { UnmatchedPurchase } from "@/lib/crew/purchases";
import { ownersDecide, requestDetail, requestTitle } from "@/lib/crew/requestRules";
import { SETTING_DEFAULTS, type AnswersFirst } from "@/lib/crew/settings";
import { planDueLabel } from "@/lib/crew/settingsRules";
import { firstNameOf, isReportedDone, type CrewJob, type CrewJobPerson, type CrewPerson, type CrewReport, type CrewRequest, type CrewTask } from "@/lib/crew/types";
import { planAsk } from "@/lib/crew/plan";
import type { Lane } from "./lanes";

export { planAsk };

// "Waiting on you": the owners' one list, pulled from what the app already
// holds. Each item belongs to a lane (lanes.ts); the screen shows an owner
// their own lanes first and the rest under "Waiting on <name>".
//
// Three kinds. A decision is something only an owner can say yes or no to. A
// signal is something going wrong that an owner should know about now. A
// hand-off is work an owner gave a supervisor, open until the owner checks
// it (a supervisor never checks their own work). What a
// rule already handles (small purchases, early collection notices, a worker's
// own day) is never here. Pure and client-safe, so it is tested without a
// database and the screen and the server agree.

export type WaitingItem = {
  key: string;
  lane: Lane;
  /** The owner it belongs to, by name, when that is a person and not a lane (a hand-off they gave). */
  who?: string;
  kind: "decision" | "signal" | "handoff";
  title: string;
  detail: string;
  /** Where it is acted on. Always a screen of the app. */
  href: string;
  /** When it started waiting, if known. */
  at: string | null;
  /** A material request (0023): Home shows Approve / Deny / Talk to me on the card itself, and an amount field when `estCents` is null. */
  request?: { id: number; estCents: number | null; talk: boolean };
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
  /** The owners' names (bot seats), so a hand-off goes back to whoever gave it. */
  owners?: string[];
  /** Home Depot register names with no job yet (0022), biggest spend first: the recent ones (listUnmatchedPurchases). */
  purchases?: UnmatchedPurchase[];
  /** The names older than the card window (0026), summed: one line, never cards. */
  olderPurchases?: { count: number; cents: number };
  /** Material requests (0023) still moving, with who is on each job and the PM limit, so only the owners' ones land here. */
  requests?: CrewRequest[];
  jobPeople?: CrewJobPerson[];
  pmLimitCents?: number;
  /** Whose list a request for the owners lands on (requests.answersFirst); "either" follows the decisions lane. */
  answersFirst?: AnswersFirst;
  /** When the nightly plan is due (crew.planDue, "HH:MM"); PLAN_DUE when not given. */
  planDue?: string;
};

/** How many "Which job is this?" names get their own line; the rest fold into one. */
export const PURCHASE_ITEMS = 5;

/** The plan is due the evening before, by 6 PM (the 30-day routine); owners can move it (crew.planDue). */
export const PLAN_DUE = "18:00";

/** A promise this close, with work still open on the job, is a signal. */
export const PROMISE_WINDOW_DAYS = 3;
/** Marco calls at 14 days past due; Ilene at 7 (the ladder, billing/ladder.ts). */
export const MARCO_CALLS_AT = 14;
export const ILENE_CALLS_AT = 7;

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
    if (r.day < today || r.answer) continue;
    const ask = planAsk(r.body);
    if (!ask) continue;
    const who = firstNameOf(r.sentName) || r.sentBy.split("@")[0];
    items.push({
      key: `plan-ask-${r.id}`,
      lane: "decisions",
      kind: "decision",
      title: `${who} asks you`,
      detail: clip(ask),
      href: `/app/crew?view=plan&day=${r.day}`,
      at: r.createdAt,
    });
  }
  const planDue = input.planDue && /^\d{2}:\d{2}$/.test(input.planDue) ? input.planDue : PLAN_DUE;
  if (senders.length && weekdayOf(tomorrow) !== 0 && !latest.has(tomorrow) && localClock(now) >= planDue) {
    const who = senders.length === 1 ? firstNameOf(senders[0].name) : "The supervisor";
    items.push({
      key: `plan-late-${tomorrow}`,
      lane: "decisions",
      kind: "signal",
      title: `${who}'s plan for tomorrow is not in`,
      detail: `It was due by ${planDueLabel(planDue)}.`,
      href: "/app/crew?view=plan",
      at: localInstant(today, planDue).toISOString(),
    });
  }

  // ---- hand-offs: what an owner gave someone who checks the others' work -------------
  const checkers = new Set(input.people.filter((p) => p.active && p.perms.includes("tasks.verify")).map((p) => p.email));
  const nameOf = (email: string) => firstNameOf(input.people.find((p) => p.email === email)?.name ?? "") || email.split("@")[0];
  const owners = new Set(input.owners ?? []);
  for (const t of input.tasks) {
    if (!checkers.has(t.email) || !isOpen(t)) continue;
    const who = owners.has(t.createdBy) ? t.createdBy : undefined;
    const name = nameOf(t.email);
    if (isReportedDone(t)) {
      items.push({
        key: `handoff-${t.id}`,
        lane: "decisions",
        who,
        kind: "decision",
        title: `${name} says done: ${t.title}`,
        detail: clip([t.jobName, t.doneNote].filter(Boolean).join(" · ") || "Check it, or send it back with what is left."),
        href: "/app/crew",
        at: t.reportedAt ?? t.closedAt,
      });
      continue;
    }
    const late = !!t.due && t.due < today;
    const state =
      t.status === "blocked" ? `stuck${t.doneNote ? `: ${t.doneNote}` : ""}` : late ? `was due ${dayShort(t.due as string)}` : t.due ? `due ${dayShort(t.due)}` : t.status === "doing" ? "started" : "not started";
    items.push({
      key: `handoff-${t.id}`,
      lane: "decisions",
      who,
      kind: late || t.status === "blocked" ? "signal" : "handoff",
      title: `${name} · ${t.title}`,
      detail: clip([state, t.jobName].filter(Boolean).join(" · ")),
      href: "/app/crew",
      at: t.createdAt,
    });
  }

  // ---- work reported done and not checked -----------------------------------------
  const stale = input.tasks.filter((t) => {
    if (!isReportedDone(t) || checkers.has(t.email)) return false;
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

  // ---- material requests the owners decide (0023) ----------------------------------
  // The PM on the job decides up to the PM limit; the owners get what is over
  // it, and anything on a job with no PM. "Talk to me" keeps it here.
  const pmLimit = input.pmLimitCents ?? SETTING_DEFAULTS["requests.pmLimitCents"];
  const first = input.answersFirst ?? "either";
  const askedFirst = first === "marco" ? "Marco" : first === "lando" ? "Lando" : undefined;
  for (const r of input.requests ?? []) {
    if (!ownersDecide(r, input.jobPeople ?? [], pmLimit)) continue;
    const asker = nameOf(r.askedBy);
    items.push({
      key: `request-${r.id}`,
      lane: "decisions",
      who: askedFirst && owners.has(askedFirst) ? askedFirst : undefined,
      kind: "decision",
      title: requestTitle(r, asker),
      detail: clip(`${requestDetail(r)}${r.talk ? ` · ${firstNameOf(r.decidedBy) || "you"} asked to talk` : ""}`),
      href: "/app/crew",
      at: r.askedAt,
      request: { id: r.id, estCents: r.estCents, talk: r.talk },
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

  // ---- Home Depot: which job is this? ------------------------------------------------
  // Tagging expenses is the money lane. The project manager answers the same card
  // for his jobs on the Crew tab; what he answers leaves this list.
  const names = [...(input.purchases ?? [])].sort((a, b) => b.cents - a.cents);
  for (const p of names.slice(0, PURCHASE_ITEMS)) {
    items.push({
      key: `purchase-${p.key}`,
      lane: "money",
      kind: "decision",
      title: `Which job is this? '${p.name || p.key}'`,
      detail: `${plural(p.trips, "trip", "trips")}, ${dollars(p.cents)}, last ${dayShort(p.lastOn).replace(/^\w+, /, "")}`,
      href: "/app/crew?view=today",
      at: null,
    });
  }
  if (names.length > PURCHASE_ITEMS) {
    const rest = names.slice(PURCHASE_ITEMS);
    items.push({
      key: "purchase-more",
      lane: "money",
      kind: "decision",
      title: `${plural(rest.length, "more Home Depot name needs", "more Home Depot names need")} a job`,
      detail: clip(rest.map((p) => `'${p.name || p.key}' ${dollars(p.cents)}`).join(", ")),
      href: "/app/crew?view=today",
      at: null,
    });
  }
  // The history from before the app: hundreds of names nobody will tag one by
  // one. One line says they exist; search on Money finds any of them.
  const older = input.olderPurchases;
  if (older && older.count > 0) {
    items.push({
      key: "purchase-older",
      lane: "money",
      kind: "decision",
      title: `${older.count.toLocaleString("en-US")} older Home Depot name${older.count === 1 ? "" : "s"} from before the app`,
      detail: `${dollars(older.cents)} across them; find them with search.`,
      href: "/app/money",
      at: null,
    });
  }

  const rank = (i: WaitingItem) => (i.kind === "decision" ? 0 : i.kind === "signal" ? 1 : 2);
  return items.sort((a, b) => rank(a) - rank(b) || (a.at ?? "9").localeCompare(b.at ?? "9"));
}
