import type { BotCrewLateItem, BotPeople } from "@/lib/bot/types";
import { addDays, dayShort, clockText, weekdayOf } from "@/lib/crew/time";
import { inScope, scopeFrom, type JobScope } from "@/lib/crew/scope";
import { firstNameOf, isReportedDone, type CrewJob, type CrewJobPerson, type CrewLang, type CrewPerson, type CrewReport, type CrewScheduleItem, type CrewTask } from "@/lib/crew/types";
import { lanesOf } from "./lanes";
import type { WaitingItem } from "./waiting";

// The 7 AM "Your day" push, one per person (Marco's seat plan, step 4, and the
// Wednesday demo). An owner gets what is waiting on them; the supervisor gets
// the day's crew; a worker gets where they are going. Pure, so it is tested
// without a database or a phone; the cron route reads and sends
// (src/app/api/cron/morning/route.ts).

export type MorningNote = { email: string; title: string; body: string; url: string; tag: string };

export type MorningInput = {
  day: string;
  /** The bot's seats: owners by email. */
  owners: BotPeople;
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
};

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
  const supervisors = input.people.filter((p) => p.active && p.perms.includes("tasks.verify"));

  // ---- owners: what is waiting on them, in the order Home shows it ----------------
  const ownerNamesAll = new Set(Object.values(input.owners).filter((p) => p.role === "owner").map((p) => p.name));
  for (const [email, seat] of Object.entries(input.owners)) {
    if (seat.role !== "owner") continue;
    const lanes = lanesOf(email, input.owners);
    const mine = input.waiting.filter((i) => (i.who && ownerNamesAll.has(i.who) ? i.who === seat.name : lanes.includes(i.lane)));
    const decisions = mine.filter((i) => i.kind === "decision");
    const signals = mine.filter((i) => i.kind === "signal");
    const handoffs = mine.filter((i) => i.kind === "handoff");
    const bids = lanes.includes("sales") ? input.bids : 0;
    const counts = [
      decisions.length ? plural(decisions.length, "decision", "decisions") : "",
      signals.length ? `${signals.length} to watch` : "",
      handoffs.length ? plural(handoffs.length, "hand-off out", "hand-offs out") : "",
      bids ? plural(bids, "bid", "bids") : "",
    ].filter(Boolean);
    const top = [...decisions, ...signals].slice(0, 3).map((i) => i.title);
    const parts = [top.join("; "), crewLine(day, input.schedule)];
    if (supervisors.length && lanes.includes("decisions") && !input.reports.some((r) => r.day === day)) {
      parts.push(`No plan from ${supervisors.length === 1 ? firstNameOf(supervisors[0].name) : "the supervisor"} for today.`);
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
    const mineToday = input.tasks.filter((t) => isOpen(t) && t.email === p.email && !!t.due && t.due <= day).length;
    const lines = [
      crewLine(day, theirs),
      cant ? `${plural(cant, "person", "people")} can't make it` : "",
      unconfirmed ? `${unconfirmed} not confirmed yet` : "",
      toCheck ? `${plural(toCheck, "task", "tasks")} to check` : "",
      dueToday ? `${plural(dueToday, "task", "tasks")} due today` : "",
      mineToday ? `${plural(mineToday, "hand-off", "hand-offs")} due from you` : "",
      lateClause(recentLate(input, scope)),
    ].filter(Boolean);
    notes.push(crewNote(p, { en: "Your day", es: "Tu día" }, { en: lines.join(" · "), es: lines.join(" · ") }, "/app/crew", tag));
  }

  // ---- workers: where they are going, and what is on their list ---------------------
  for (const p of input.people) {
    if (!p.active || supervisorEmails.has(p.email)) continue;
    const mine = today.filter((s) => s.email === p.email).sort((a, b) => (a.startTime || "99").localeCompare(b.startTime || "99"));
    if (!mine.length) continue; // not working today: no buzz
    const where = mine.map((s) => `${s.jobName}${s.startTime ? ` ${p.lang === "es" ? "a las" : "at"} ${clockText(s.startTime)}` : ""}`).join(", ");
    const tasks = input.tasks.filter((t) => t.email === p.email && isOpen(t));
    const first = tasks.sort((a, b) => (a.due ?? "9").localeCompare(b.due ?? "9"))[0];
    const en = [`${where}.`, tasks.length ? `${plural(tasks.length, "task", "tasks")}${first ? `, first: ${first.title}` : ""}.` : ""];
    const es = [`${where}.`, tasks.length ? `${tasks.length} ${tasks.length === 1 ? "tarea" : "tareas"}${first ? `, primero: ${first.title}` : ""}.` : ""];
    notes.push(
      crewNote(p, { en: `Your day, ${dayShort(day, "en")}`, es: `Tu día, ${dayShort(day, "es")}` }, { en: en.filter(Boolean).join(" "), es: es.filter(Boolean).join(" ") }, "/app", tag),
    );
  }
  return notes;
}

function crewNote(p: { email: string; lang: CrewLang }, title: { en: string; es: string }, body: { en: string; es: string }, url: string, tag: string): MorningNote {
  const es = p.lang === "es";
  return { email: p.email, title: es ? title.es : title.en, body: clip(es ? body.es : body.en, 240), url, tag };
}
