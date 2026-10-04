import { signDownload } from "@/lib/bot/queries";
import { getAccountingState } from "@/lib/expenses/store";
import {
  getEntry,
  listEntries,
  listJobs,
  listOpenShifts,
  listPeople,
  listQuestions,
  listSchedule,
  listShifts,
  listTasks,
  listUnfiledEntries,
  listUnseenAnswers,
  openShift,
  type CrewPersonRow,
  type CrewShiftRow,
} from "./queries";
import { addDays, isDay, localDay, weekStart } from "./time";
import type { CrewAdminHome, CrewEntry, CrewFeed, CrewHome, CrewPerson, CrewQuestion, CrewShift } from "./types";

// What each side gets in one read. A crew member gets only what is theirs; an
// owner gets everyone's; the Mac gets the last few days plus whatever it has
// not filed yet.

const DAY_MS = 24 * 3600_000;

function publicShift(s: CrewShiftRow): CrewShift {
  const { clientIn: _in, clientOut: _out, ...rest } = s;
  void _in;
  void _out;
  return rest;
}

function publicPerson(p: CrewPersonRow): CrewPerson {
  const { authId: _id, ...rest } = p;
  void _id;
  return rest;
}

function byId<T extends { id: number }>(rows: T[]): T[] {
  const seen = new Map<number, T>();
  for (const r of rows) seen.set(r.id, r);
  return [...seen.values()];
}

export async function crewHome(person: CrewPersonRow, push: CrewHome["push"], now = new Date()): Promise<CrewHome> {
  const day = localDay(now);
  const email = person.email;
  const [jobs, shifts, open, schedule, tasks, questions, entries] = await Promise.all([
    listJobs(),
    listShifts({ email, fromDay: addDays(weekStart(day), -7) }),
    openShift(email),
    listSchedule({ email, fromDay: day, toDay: addDays(day, 7) }),
    listTasks({ email, closedSince: new Date(now.getTime() - 2 * DAY_MS).toISOString() }),
    listQuestions({ email, since: now.toISOString() }),
    listEntries({ email, fromDay: addDays(day, -7), limit: 60 }),
  ]);

  // A job's note can hold a gate code. Only the people headed there see it.
  const mine = new Set([...schedule.map((s) => s.jobId), ...(open ? [open.jobId] : [])]);

  return {
    ok: true,
    now: now.toISOString(),
    day,
    me: { email, name: person.name, lang: person.lang },
    jobs: jobs.filter((j) => j.active).map((j) => (mine.has(j.id) ? j : { ...j, note: "" })),
    shift: open ? publicShift(open) : null,
    // A shift left open since before last week still has to show.
    shifts: byId([...(open ? [open] : []), ...shifts])
      .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
      .map(publicShift),
    schedule,
    tasks,
    // A question nobody answered in four days is no longer worth a card at the
    // top of the screen. Who asked is "the bot" or "the office", never an address.
    questions: questions
      .filter((q) => q.status === "open" && now.getTime() - Date.parse(q.createdAt) < 4 * DAY_MS)
      .map((q) => ({ ...q, askedBy: q.askedBy === "bot" ? "bot" : "office" })),
    entries,
    push,
  };
}

export async function adminHome(weekParam: string | null, now = new Date()): Promise<CrewAdminHome> {
  const day = localDay(now);
  const week = weekParam && isDay(weekParam) ? weekStart(weekParam) : weekStart(day);
  const weekAgo = new Date(now.getTime() - 7 * DAY_MS).toISOString();
  const [people, jobs, weekShifts, recentShifts, open, entries, schedule, tasks, questions, suggested] = await Promise.all([
    listPeople(),
    listJobs(),
    listShifts({ fromDay: week, toDay: addDays(week, 6), includeVoid: true }),
    listShifts({ fromDay: addDays(day, -1), includeVoid: true }),
    listOpenShifts(),
    listEntries({ fromDay: addDays(day, -7), limit: 250 }),
    listSchedule({ fromDay: addDays(day, -1), toDay: addDays(day, 13) }),
    listTasks({ closedSince: weekAgo }),
    listQuestions({ since: weekAgo }),
    suggestedJobs(),
  ]);
  const names = new Set(jobs.map((j) => j.name.toLowerCase()));
  return {
    ok: true,
    now: now.toISOString(),
    day,
    week,
    people: people.map(publicPerson),
    jobs,
    suggestedJobs: suggested.filter((n) => !names.has(n.toLowerCase())),
    shifts: byId([...weekShifts, ...recentShifts, ...open])
      .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
      .map(publicShift),
    entries,
    schedule,
    tasks,
    questions,
  };
}

/** Project names the expense tracker already files receipts under. */
async function suggestedJobs(): Promise<string[]> {
  try {
    const state = await getAccountingState();
    return (state.activeProjects ?? []).filter((n): n is string => typeof n === "string" && n.trim().length >= 2).slice(0, 12);
  } catch {
    return [];
  }
}

export async function crewFeed(now = new Date()): Promise<CrewFeed> {
  const day = localDay(now);
  const since = new Date(now.getTime() - 3 * DAY_MS).toISOString();
  const [people, jobs, shifts, open, recent, unfiled, schedule, tasks, questions, unseen] = await Promise.all([
    listPeople(),
    listJobs(),
    listShifts({ fromDay: addDays(day, -3) }),
    listOpenShifts(),
    listEntries({ fromDay: addDays(day, -3), limit: 400 }),
    listUnfiledEntries(),
    listSchedule({ fromDay: addDays(day, -1), toDay: addDays(day, 7) }),
    listTasks({ closedSince: since }),
    listQuestions({ since }),
    listUnseenAnswers(),
  ]);

  // An answer can arrive days after the receipt it is about ("what was the
  // total?"). The Mac needs that receipt in the same feed to act on the answer.
  const have = new Set([...recent, ...unfiled].map((e) => e.id));
  const referenced: CrewEntry[] = [];
  for (const q of unseen) {
    const id = typeof q.ref.entry === "number" ? q.ref.entry : 0;
    if (!id || have.has(id)) continue;
    have.add(id);
    const entry = await getEntry(id).catch(() => null);
    if (entry) referenced.push(entry);
  }

  const entries: CrewFeed["entries"] = [];
  for (const e of byId<CrewEntry>([...recent, ...unfiled, ...referenced]).sort((a, b) => a.id - b.id)) {
    const urls: (string | null)[] = [];
    for (const f of e.files) {
      // Only what the Mac still has to fetch. A file that never reached
      // storage is handed over without a URL, and the Mac says so.
      urls.push(e.botAt ? null : await signDownload(f.path, 30 * 60).catch(() => null));
    }
    entries.push({ ...e, urls });
  }

  return {
    ok: true,
    now: now.toISOString(),
    day,
    people: people.map(publicPerson),
    jobs,
    shifts: byId([...shifts, ...open])
      .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
      .map(publicShift),
    entries,
    schedule,
    tasks,
    questions: byId<CrewQuestion>([...questions, ...unseen]).sort((a, b) => a.id - b.id),
  };
}
