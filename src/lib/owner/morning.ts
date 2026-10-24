import type { BotCrewLateItem, BotPeople } from "@/lib/bot/types";
import { addDays, dayShort, clockText, weekdayOf } from "@/lib/crew/time";
import { pmDecides } from "@/lib/crew/requestRules";
import { inScope, scopeFrom, type JobScope } from "@/lib/crew/scope";
import { SETTING_DEFAULTS } from "@/lib/crew/settings";
import { firstNameOf, isReportedDone, type CrewJob, type CrewJobPerson, type CrewLang, type CrewPerson, type CrewReport, type CrewRequest, type CrewScheduleItem, type CrewTask } from "@/lib/crew/types";
import type { JobRef } from "@/lib/jobs/hub";
import type { Person, Seat } from "@/lib/roles/seats";
import { feedForSeat, isMine, type FeedItem } from "@/lib/tasks/feed";
import { lanesOf, type LaneSeats } from "./lanes";
import type { WaitingItem } from "./waiting";

// The 7 AM "Your day" push, one per person (Marco's seat plan, step 4, and the
// Wednesday demo). An owner gets what is waiting on them; the supervisor gets
// the day's crew; a worker gets where they are going; anyone else holding a
// seat (finance) gets their tasks. What is theirs to do comes from the one task
// feed (tasks/feed.ts), the same list Tasks shows them, and each push leads with
// what is overdue, due today and moved up to them, and the oldest of it. Pure,
// so it is tested without a database or a phone; the cron route reads and sends
// (src/app/api/cron/morning/route.ts).

export type MorningNote = { email: string; title: string; body: string; url: string; tag: string };

export type MorningInput = {
  day: string;
  /** The bot's seats: owners by email. */
  owners: BotPeople;
  /** Who holds each lane (role seats, 0032); the decided defaults without it. */
  laneSeats?: LaneSeats;
  people: Pick<CrewPerson, "email" | "name" | "lang" | "active" | "perms">[];
  schedule: CrewScheduleItem[];
  tasks: CrewTask[];
  reports: CrewReport[];
  waiting: WaitingItem[];
  /** Bids the bot is tracking (the sales lane). */
  bids: number;
  /** Who is on each job (0018): a project manager (projects.mine) hears only about theirs. */
  jobPeople?: CrewJobPerson[];
  /** Late from the field, as the Mac reports it (bot_state crewLate): yesterday's is folded in. */
  late?: BotCrewLateItem[];
  /** The jobs by id and name, to tell whose a late item is (it names the job, not the id). */
  jobs?: Pick<CrewJob, "id" | "name">[];
  /** Material requests (0023) still open: a PM hears how many wait on them; the owners' are already in `waiting`. */
  requests?: CrewRequest[];
  pmLimitCents?: number;
  /** The one task feed, unfiltered (loadFeed); each person gets the part Tasks shows them. A worker's list is theirs from it. */
  feed?: FeedItem[];
  /** Who holds each role (role_seats), and the people the seats name: whose a feed item is. */
  seats?: Seat[];
  seatPeople?: Person[];
  /** The jobs by URL key, to narrow a project manager's feed to their jobs. */
  refs?: Pick<JobRef, "key" | "crewId">[];
};

// ---- the feed, per person ---------------------------------------------------------

/**
 * This person's part of the feed, as Tasks shows it under Mine: an owner's from
 * the whole feed (their part of Waiting on you as `waiting` routes it), anyone
 * else's narrowed to the jobs they see (feedForSeat).
 */
function feedFor(input: MorningInput, email: string, who: { owner: true; waiting: WaitingItem[] } | { owner: false; scope: JobScope }): FeedItem[] {
  const feed = input.feed ?? [];
  if (!feed.length) return [];
  const seats = input.seats ?? [];
  const people = input.seatPeople ?? [];
  const mine = (i: FeedItem) => isMine(i, email, seats, people);
  if (who.owner) {
    const keys = new Set(who.waiting.map((i) => `q${i.key}`));
    return feed.filter((i) => (i.source === "waiting" ? keys.has(i.id) : mine(i)));
  }
  const { scope } = who;
  const jobs = new Set((input.refs ?? []).filter((r) => scope === null || (!!r.crewId && scope.includes(r.crewId))).map((r) => r.key));
  return feedForSeat(feed, jobs, mine).filter(mine);
}

type Lead = { overdue: number; dueToday: number; movedUp: number; oldest: FeedItem | null };

/** Overdue first by days late, then what falls due soonest, then what has waited longest. */
function byAge(a: FeedItem, b: FeedItem): number {
  return b.overdueDays - a.overdueDays || (a.dueOn ?? "9").localeCompare(b.dueOn ?? "9") || (a.since ?? "9").localeCompare(b.since ?? "9");
}

function leadOf(items: FeedItem[], day: string): Lead {
  return {
    overdue: items.filter((i) => !!i.dueOn && i.dueOn < day).length,
    dueToday: items.filter((i) => i.dueOn === day).length,
    movedUp: items.filter((i) => i.escalated).length,
    oldest: [...items].sort(byAge)[0] ?? null,
  };
}

/** "2 overdue, 1 due today, 1 moved up to you" */
function leadCounts(lead: Lead): string[] {
  return [lead.overdue ? `${lead.overdue} overdue` : "", lead.dueToday ? `${lead.dueToday} due today` : "", lead.movedUp ? `${lead.movedUp} moved up to you` : ""].filter(Boolean);
}

/** "Oldest: Approve Desert Plumbing 1042 (12729 W Keim Dr), 4 days late" */
function oldestClause(lead: Lead): string {
  const o = lead.oldest;
  if (!o) return "";
  return `Oldest: ${o.title}${o.job ? ` (${o.job})` : ""}${o.overdueDays ? `, ${plural(o.overdueDays, "day", "days")} late` : ""}`;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function clip(text: string, max: number): string {
  const one = text.replace(/\s+/g, " ").trim();
  return one.length > max ? `${one.slice(0, max - 1)}…` : one;
}

function isOpen(t: CrewTask): boolean {
  return t.status === "open" || t.status === "doing" || t.status === "blocked";
}

function crewLine(day: string, schedule: CrewScheduleItem[]): string {
  const today = schedule.filter((s) => s.day === day);
  if (!today.length) return "Nobody is on the schedule today.";
  const people = new Set(today.map((s) => s.email)).size;
  const jobs = new Set(today.map((s) => s.jobId)).size;
  return `${plural(people, "person", "people")} on ${plural(jobs, "job", "jobs")} today.`;
}

/**
 * What came in late from the field over the two days before `day` (yesterday,
 * or Saturday and Sunday for a Monday), narrowed to the jobs in `scope`. A late
 * item names its job; the id is looked up by that name, or taken as given.
 */
function recentLate(input: MorningInput, scope: JobScope): BotCrewLateItem[] {
  const { day } = input;
  const from = addDays(day, -2);
  const idOf = (name: string) => input.jobs?.find((j) => j.name.toLowerCase() === name.trim().toLowerCase())?.id ?? name;
  return (input.late ?? []).filter((l) => l.day >= from && l.day < day && (scope === null || inScope(scope, idOf(l.job))));
}

/** "Late from the field: Arnold · 12729 W Keim Dr: no clock-in by 7:30 (+1 more)" */
function lateClause(items: BotCrewLateItem[]): string {
  if (!items.length) return "";
  const [first] = items;
  const head = `Late from the field: ${[first.who, first.job].filter(Boolean).join(" · ")}: ${first.text}`.replace(/:\s*$/, "");
  return items.length > 1 ? `${head} (+${items.length - 1} more)` : head;
}

export function buildMorning(input: MorningInput): MorningNote[] {
  const { day } = input;
  if (weekdayOf(day) === 0) return []; // the crew is off on Sunday
  const tag = `morning-${day}`;
  const notes: MorningNote[] = [];
  // Supervisors (they check the crew's work) get their own morning line. Whose plan is missing is
  // whoever sends the nightly plan (plan.send), the same people Waiting on you asks it of.
  const supervisors = input.people.filter((p) => p.active && p.perms.includes("tasks.verify"));
  const planSenders = input.people.filter((p) => p.active && p.perms.includes("plan.send"));

  // ---- owners: what is waiting on them, in the order Home shows it ----------------
  const ownerNamesAll = new Set(Object.values(input.owners).filter((p) => p.role === "owner").map((p) => p.name));
  for (const [email, seat] of Object.entries(input.owners)) {
    if (seat.role !== "owner") continue;
    const lanes = lanesOf(email, input.owners, input.laneSeats);
    const mine = input.waiting.filter((i) => (i.who && ownerNamesAll.has(i.who) ? i.who === seat.name : lanes.includes(i.lane)));
    const lead = leadOf(feedFor(input, email, { owner: true, waiting: mine }), day);
    const decisions = mine.filter((i) => i.kind === "decision");
    const signals = mine.filter((i) => i.kind === "signal");
    const handoffs = mine.filter((i) => i.kind === "handoff");
    const bids = lanes.includes("sales") ? input.bids : 0;
    const counts = [
      ...leadCounts(lead),
      decisions.length ? plural(decisions.length, "decision", "decisions") : "",
      signals.length ? `${signals.length} to watch` : "",
      handoffs.length ? plural(handoffs.length, "hand-off out", "hand-offs out") : "",
      bids ? plural(bids, "bid", "bids") : "",
    ].filter(Boolean);
    const top = [...decisions, ...signals].map((i) => i.title).filter((t) => t !== lead.oldest?.title).slice(0, lead.oldest ? 2 : 3);
    const parts = [oldestClause(lead), top.join("; "), crewLine(day, input.schedule)];
    if (planSenders.length && lanes.includes("decisions") && !input.reports.some((r) => r.day === day)) {
      parts.push(`No plan from ${planSenders.length === 1 ? firstNameOf(planSenders[0].name) : "the supervisor"} for today.`);
    }
    parts.push(lateClause(recentLate(input, null)));
    notes.push({
      email,
      title: counts.length ? `Your day: ${counts.join(", ")}` : "Your day: nothing waiting on you",
      body: clip(parts.filter(Boolean).join(" · "), 240),
      url: "/app",
      tag,
    });
  }

  // ---- the supervisor: the day's crew, and what is theirs to check -----------------
  const today = input.schedule.filter((s) => s.day === day);
  const supervisorEmails = new Set(supervisors.map((p) => p.email));
  for (const p of supervisors) {
    const scope = scopeFrom({ role: "member", email: p.email, perms: p.perms }, input.jobPeople ?? []);
    const theirs = today.filter((s) => inScope(scope, s.jobId));
    const tasks = input.tasks.filter((t) => inScope(scope, t.jobId));
    const unconfirmed = new Set(theirs.filter((s) => s.ack === "" && s.email !== p.email).map((s) => s.email)).size;
    const cant = theirs.filter((s) => s.ack === "cant").length;
    const toCheck = tasks.filter((t) => isReportedDone(t) && t.email !== p.email).length;
    const dueToday = tasks.filter((t) => isOpen(t) && t.due === day && !supervisorEmails.has(t.email)).length;
    // Their own work (hand-offs to them, the PM's seat, the field's once it moved up) comes from the feed.
    const lead = leadOf(feedFor(input, p.email, { owner: false, scope }), day);
    const yours = leadCounts(lead);
    // Material requests (0023) waiting on this PM: on their jobs, not their own, within their limit.
    const pmLimit = input.pmLimitCents ?? SETTING_DEFAULTS["requests.pmLimitCents"];
    const requests = p.perms.includes("requests.approve") ? (input.requests ?? []).filter((r) => inScope(scope, r.jobId) && pmDecides(r, p.email, pmLimit)).length : 0;
    const lines = [
      yours.length ? `Yours: ${yours.join(", ")}` : "",
      oldestClause(lead),
      crewLine(day, theirs),
      cant ? `${plural(cant, "person", "people")} can't make it` : "",
      unconfirmed ? `${unconfirmed} not confirmed yet` : "",
      toCheck ? `${plural(toCheck, "task", "tasks")} to check` : "",
      dueToday ? `${plural(dueToday, "crew task", "crew tasks")} due today` : "",
      requests ? `${plural(requests, "material request", "material requests")} waiting` : "",
      lateClause(recentLate(input, scope)),
    ].filter(Boolean);
    notes.push(crewNote(p, { en: "Your day", es: "Tu día" }, { en: lines.join(" · "), es: lines.join(" · ") }, "/app/crew", tag));
  }

  // ---- workers: where they are going, and what is on their list ---------------------
  const notified = new Set(notes.map((n) => n.email));
  for (const p of input.people) {
    if (!p.active || supervisorEmails.has(p.email)) continue;
    const mine = today.filter((s) => s.email === p.email).sort((a, b) => (a.startTime || "99").localeCompare(b.startTime || "99"));
    if (!mine.length) continue; // not working today: no buzz
    notified.add(p.email);
    const where = mine.map((s) => `${s.jobName}${s.startTime ? ` ${p.lang === "es" ? "a las" : "at"} ${clockText(s.startTime)}` : ""}`).join(", ");
    const tasks = feedFor(input, p.email, { owner: false, scope: scopeFrom({ role: "member", email: p.email, perms: p.perms }, input.jobPeople ?? []) }).sort(byAge);
    const lead = leadOf(tasks, day);
    const first = tasks[0];
    const late = { en: [lead.overdue ? `${lead.overdue} overdue` : "", lead.dueToday ? `${lead.dueToday} due today` : ""].filter(Boolean), es: [lead.overdue ? `${lead.overdue} ${lead.overdue === 1 ? "atrasada" : "atrasadas"}` : "", lead.dueToday ? `${lead.dueToday} para hoy` : ""].filter(Boolean) };
    const en = [`${where}.`, tasks.length ? `${plural(tasks.length, "task", "tasks")}${late.en.length ? ` (${late.en.join(", ")})` : ""}${first ? `, first: ${first.title}` : ""}.` : ""];
    const es = [`${where}.`, tasks.length ? `${tasks.length} ${tasks.length === 1 ? "tarea" : "tareas"}${late.es.length ? ` (${late.es.join(", ")})` : ""}${first ? `, primero: ${first.title}` : ""}.` : ""];
    notes.push(
      crewNote(p, { en: `Your day, ${dayShort(day, "en")}`, es: `Tu día, ${dayShort(day, "es")}` }, { en: en.filter(Boolean).join(" "), es: es.filter(Boolean).join(" ") }, "/app", tag),
    );
  }

  // ---- anyone else holding a seat (finance): their tasks, when they have any --------
  for (const n of notes) notified.add(n.email);
  for (const person of input.seatPeople ?? []) {
    if (person.owner || notified.has(person.email)) continue;
    notified.add(person.email);
    const crew = input.people.find((c) => c.email === person.email);
    if (crew && !crew.active) continue;
    const scope = crew ? scopeFrom({ role: "member", email: crew.email, perms: crew.perms }, input.jobPeople ?? []) : null;
    const items = feedFor(input, person.email, { owner: false, scope });
    if (!items.length) continue; // nothing on their list: no buzz
    const lead = leadOf(items, day);
    const counts = leadCounts(lead);
    notes.push({
      email: person.email,
      title: `Your day: ${counts.length ? counts.join(", ") : plural(items.length, "task", "tasks")}`,
      body: clip([oldestClause(lead), counts.length ? plural(items.length, "task", "tasks") + " open in all" : ""].filter(Boolean).join(" · "), 240),
      url: "/app/tasks",
      tag,
    });
  }
  return notes;
}

function crewNote(p: { email: string; lang: CrewLang }, title: { en: string; es: string }, body: { en: string; es: string }, url: string, tag: string): MorningNote {
  const es = p.lang === "es";
  return { email: p.email, title: es ? title.es : title.en, body: clip(es ? body.es : body.en, 240), url, tag };
}
