import { signDownload } from "@/lib/bot/queries";
import { getAccountingState } from "@/lib/expenses/store";
import {
  getEntry,
  listEntries,
  listBillingJobs,
  listJobPeople,
  listJobs,
  listOpenShifts,
  listPeople,
  listGroups,
  listPickups,
  listQuestions,
  listReports,
  listSchedule,
  listShifts,
  listTasks,
  listUnfiledEntries,
  listUnseenAnswers,
  openShift,
  withJobDistance,
  type CrewPersonRow,
  type CrewShiftRow,
} from "./queries";
import type { Manager } from "./auth";
import { listUnmatchedPurchases, loadPurchasesToday } from "./purchaseQueries";
import type { PurchasesToday, UnmatchedPurchase } from "./purchases";
import { inScope, visibleCrewJobs } from "./scope";
import { addDays, isDay, localDay, weekStart } from "./time";
import type { BillingJobRef, Capability, CrewAdminHome, CrewJobPerson, CrewEntry, CrewFeed, CrewHome, CrewPerson, CrewQuestion, CrewShift, OwnShift } from "./types";

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

/** A shift for the person who worked it: how far the punch was from the job is the owners' to see, never theirs. */
function ownShift(s: CrewShiftRow): OwnShift {
  const { fromJobM: _far, ...rest } = publicShift(s);
  void _far;
  return rest;
}

/** A seat as a screen sees it: never the sign-in id, and the pay rate only for owners. */
function publicPerson(p: CrewPersonRow, showPay = false): CrewPerson {
  const { authId: _id, ...rest } = p;
  void _id;
  return showPay ? rest : { ...rest, payRate: null };
}

function byId<T extends { id: number }>(rows: T[]): T[] {
  const seen = new Map<number, T>();
  for (const r of rows) seen.set(r.id, r);
  return [...seen.values()];
}

export async function crewHome(person: CrewPersonRow, push: CrewHome["push"], now = new Date()): Promise<CrewHome> {
  const day = localDay(now);
  const email = person.email;
  const [jobs, shifts, open, schedule, tasks, questions, entries, pickups] = await Promise.all([
    listJobs(),
    listShifts({ email, fromDay: addDays(weekStart(day), -7) }),
    openShift(email),
    listSchedule({ email, fromDay: day, toDay: addDays(day, 7) }),
    listTasks({ email, closedSince: new Date(now.getTime() - 2 * DAY_MS).toISOString() }),
    listQuestions({ email, since: now.toISOString() }),
    listEntries({ email, fromDay: addDays(day, -7), limit: 60 }),
    listPickups({ fromDay: addDays(day, -1), email }),
  ]);

  // A job's note can hold a gate code. Only the people headed there see it.
  const mine = new Set([...schedule.map((s) => s.jobId), ...(open ? [open.jobId] : [])]);

  return {
    ok: true,
    now: now.toISOString(),
    day,
    me: { email, name: person.name, lang: person.lang, group: person.group, perms: person.perms },
    jobs: jobs.filter((j) => j.active).map((j) => (mine.has(j.id) ? j : { ...j, note: "" })),
    shift: open ? ownShift(open) : null,
    // A shift left open since before last week still has to show.
    shifts: byId([...(open ? [open] : []), ...shifts])
      .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
      .map(ownShift),
    schedule,
    tasks,
    // A question nobody answered in four days is no longer worth a card at the
    // top of the screen. Who asked is "the bot" or "the office", never an address.
    questions: questions
      .filter((q) => q.status === "open" && now.getTime() - Date.parse(q.createdAt) < 4 * DAY_MS)
      .map((q) => ({ ...q, askedBy: q.askedBy === "bot" ? "bot" : "office" })),
    entries,
    // A pickup that names nobody is for the runners; one that names someone is theirs.
    pickups: pickups.filter((p) => p.email === email || person.perms.includes("pickups.run")),
    push,
  };
}

/**
 * The Crew screens' read. An owner gets everything. A member gets what their
 * group's switches open: always who is on the clock today, what came in, the
 * schedule, tasks, pickups and the plans; the week's timesheet only with
 * hours.view; time-fix requests and where a punch was made only with
 * hours.edit; the expense tracker's project list only with jobs.manage.
 */
export async function adminHome(viewer: Manager, weekParam: string | null, now = new Date()): Promise<CrewAdminHome> {
  const can = (p: Capability) => viewer.perms.includes(p);
  const hours = can("hours.view");
  const fixes = can("hours.edit");
  const day = localDay(now);
  const week = weekParam && isDay(weekParam) ? weekStart(weekParam) : weekStart(day);
  const weekAgo = new Date(now.getTime() - 7 * DAY_MS).toISOString();
  const scope = await visibleCrewJobs(viewer);
  const [people, allJobs, weekShifts, recentShifts, open, allEntries, allSchedule, allTasks, questions, suggested, allPickups, allReports, groups, jobPeople, billingJobs, unmatchedPurchases] = await Promise.all([
    listPeople(),
    listJobs(),
    hours ? listShifts({ fromDay: week, toDay: addDays(week, 6), includeVoid: fixes }) : Promise.resolve([] as CrewShiftRow[]),
    listShifts({ fromDay: addDays(day, -1), includeVoid: fixes }),
    listOpenShifts(),
    listEntries({ fromDay: addDays(day, -7), limit: 250 }),
    listSchedule({ fromDay: addDays(day, -1), toDay: addDays(day, 13) }),
    listTasks({ closedSince: weekAgo }),
    listQuestions({ since: weekAgo }),
    can("jobs.manage") ? suggestedJobs() : Promise.resolve([] as string[]),
    listPickups({ fromDay: addDays(day, -7) }),
    listReports(addDays(day, -35)),
    viewer.role === "owner" ? listGroups() : Promise.resolve([]),
    listJobPeople().catch(() => [] as CrewJobPerson[]),
    viewer.role === "owner" ? listBillingJobs().catch(() => [] as BillingJobRef[]) : Promise.resolve([] as BillingJobRef[]),
    // Which job is this? (0022): for anyone who sees money. The tab must open before the migration is applied, so a missing table is an empty list.
    can("money.view") ? listUnmatchedPurchases().catch(() => [] as UnmatchedPurchase[]) : Promise.resolve([] as UnmatchedPurchase[]),
  ]);
  // A project manager sees only the jobs they are on, and the plans they sent.
  const mine = <T extends { jobId: string }>(rows: T[]) => rows.filter((r) => inScope(scope, r.jobId));
  const jobs = allJobs.filter((j) => inScope(scope, j.id));
  const [entries, schedule, tasks, pickups] = [mine(allEntries), mine(allSchedule), mine(allTasks), mine(allPickups)];
  const reports = scope === null ? allReports : allReports.filter((r) => r.sentBy === viewer.email);
  const names = new Set(jobs.map((j) => j.name.toLowerCase()));
  return {
    ok: true,
    now: now.toISOString(),
    day,
    viewer: { role: viewer.role, email: viewer.email, name: viewer.name, perms: viewer.perms },
    groups,
    week,
    people: people.map((p) => publicPerson(p, viewer.role === "owner")),
    jobs,
    suggestedJobs: suggested.filter((n) => !names.has(n.toLowerCase())),
    // Where a punch was made is hours.edit; how far it was from the job is for everyone with the tab.
    shifts: withJobDistance(mine(byId([...weekShifts, ...recentShifts, ...open])), allJobs)
      .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
      .map((s) => (fixes ? publicShift(s) : { ...publicShift(s), startGeo: null, endGeo: null, edits: [] })),
    entries: fixes ? entries : entries.filter((e) => e.kind !== "timefix"),
    schedule,
    tasks,
    questions,
    pickups,
    reports,
    jobPeople: jobPeople.filter((a) => inScope(scope, a.jobId)),
    billingJobs,
    narrowed: scope !== null,
    unmatchedPurchases,
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
  // Today's Home Depot trips per job (0022). The feed must not fail over a missing purchases table.
  const purchasesToday: PurchasesToday[] = await loadPurchasesToday(day, jobs).catch(() => []);

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
    people: people.map((p) => publicPerson(p)),
    jobs,
    shifts: withJobDistance(byId([...shifts, ...open]), jobs)
      .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
      .map(publicShift),
    entries,
    schedule,
    tasks,
    questions: byId<CrewQuestion>([...questions, ...unseen]).sort((a, b) => a.id - b.id),
    purchasesToday,
  };
}
