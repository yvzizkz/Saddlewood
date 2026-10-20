import {
  firstNameOf,
  isReportedDone,
  type CrewJob,
  type CrewJobPerson,
  type CrewJobPhase,
  type CrewJobRole,
  type CrewJobStaged,
  type CrewPerson,
  type CrewReport,
  type CrewScheduleItem,
  type CrewTask,
  type JobStage,
} from "./types";
import { inScope, type JobScope } from "./scope";

// The Projects screen (projects.view, 0018): one card per job with the field
// half of the picture. Status, the promise, what is stuck, what was checked
// and what was sent back, who is on it, and the latest plans. The money half
// is a separate card (ProjectMoneySlot) with its own route and switch; nothing
// here carries a dollar. Pure, so it is tested without a database.

/** Verified and sent back are counted over this many days. */
export const PROJECT_WINDOW_DAYS = 14;
/** A promise this close, with work still open, turns the card amber. */
export const PROMISE_SOON_DAYS = 3;

export type ProjectTone = "bad" | "warn" | "ok";

export type ProjectCard = {
  id: string;
  name: string;
  address: string;
  active: boolean;
  promised: string | null;
  promiseNote: string;
  /** Days from today to the promise; negative when it has passed. */
  promiseIn: number | null;
  tone: ProjectTone;
  /** One line on why the card has its colour. */
  headline: string;
  people: { email: string; name: string; role: CrewJobRole }[];
  /** First names on the schedule here today, and on the next day with anyone. */
  today: string[];
  next: { day: string; names: string[] } | null;
  open: number;
  started: number;
  stuck: { id: number; title: string; who: string; note: string }[];
  toCheck: { id: number; title: string; who: string }[];
  verified: number;
  sentBack: number;
  /** Someone said they cannot make it, today or later. */
  cant: { day: string; who: string; note: string }[];
  /** The billing job this is (jobs.crew_job_id), for the money card. Never its amounts. */
  billingJobId: string | null;
  /** The job's phases in order, and where it is (0024). */
  phases: CrewJobPhase[];
  stage: JobStage | null;
};

export type ProjectsView = {
  ok: true;
  day: string;
  narrowed: boolean;
  /** Whether the viewer may see the money card (money.view). */
  money: boolean;
  /** What the viewer may do to a job's phases: check one off, set the list, plan dates. */
  can: { verify: boolean; phases: boolean; plan: boolean };
  projects: ProjectCard[];
  /** The newest plans, newest first. */
  plans: CrewReport[];
};

export type ProjectsInput = {
  day: string;
  now: Date;
  scope: JobScope;
  /** With `phases` and `stage` when the route read them (stageJobs); plain jobs read as having none. */
  jobs: (CrewJob & Partial<Pick<CrewJobStaged, "phases" | "stage">>)[];
  people: Pick<CrewPerson, "email" | "name">[];
  jobPeople: CrewJobPerson[];
  schedule: CrewScheduleItem[];
  tasks: CrewTask[];
  reports: CrewReport[];
  /** crew job id -> billing job id */
  billing: Record<string, string>;
};

function daysFrom(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
}

const isLive = (t: CrewTask) => t.status === "open" || t.status === "doing" || t.status === "blocked";

export function buildProjects(input: ProjectsInput): Omit<ProjectsView, "ok" | "narrowed" | "money" | "can"> {
  const { day } = input;
  const since = new Date(input.now.getTime() - PROJECT_WINDOW_DAYS * 86_400_000).toISOString();
  const nameOf = (email: string) => firstNameOf(input.people.find((p) => p.email === email)?.name ?? "") || email.split("@")[0];
  const fullName = (email: string) => input.people.find((p) => p.email === email)?.name || email.split("@")[0];

  const cards = input.jobs
    .filter((j) => j.active && inScope(input.scope, j.id))
    .map((job): ProjectCard => {
      const tasks = input.tasks.filter((t) => t.jobId === job.id);
      const live = tasks.filter(isLive);
      const stuck = live.filter((t) => t.status === "blocked").map((t) => ({ id: t.id, title: t.title, who: nameOf(t.email), note: t.doneNote }));
      const toCheck = tasks.filter(isReportedDone).map((t) => ({ id: t.id, title: t.title, who: nameOf(t.email) }));
      const verified = tasks.filter((t) => t.status === "done" && t.verifiedAt && t.verifiedAt >= since).length;
      const sentBack = tasks.filter((t) => t.sentBack > 0 && (isLive(t) || (t.verifiedAt ?? "") >= since)).length;
      const slots = input.schedule.filter((s) => s.jobId === job.id && s.day >= day).sort((a, b) => a.day.localeCompare(b.day));
      const today = [...new Set(slots.filter((s) => s.day === day).map((s) => nameOf(s.email)))];
      const later = slots.find((s) => s.day > day);
      const next = later ? { day: later.day, names: [...new Set(slots.filter((s) => s.day === later.day).map((s) => nameOf(s.email)))] } : null;
      const cant = slots.filter((s) => s.ack === "cant").map((s) => ({ day: s.day, who: nameOf(s.email), note: s.ackNote }));
      const promiseIn = job.promised ? daysFrom(day, job.promised) : null;
      const openWork = live.length + toCheck.length;
      const stage = job.stage ?? null;

      let tone: ProjectTone = "ok";
      let headline = live.length ? `${live.length} open` : "Nothing open";
      if (promiseIn !== null && promiseIn < 0 && openWork) {
        tone = "bad";
        headline = `Promise passed ${-promiseIn} ${promiseIn === -1 ? "day" : "days"} ago with work open`;
      } else if (stuck.length) {
        tone = "bad";
        headline = `${stuck.length} stuck`;
      } else if (cant.length) {
        tone = "warn";
        headline = `${cant[0].who} cannot make it`;
      } else if (promiseIn !== null && promiseIn <= PROMISE_SOON_DAYS && openWork) {
        tone = "warn";
        headline = promiseIn === 0 ? "Promise is today" : promiseIn === 1 ? "Promise is tomorrow" : `Promise in ${promiseIn} days`;
      } else if (stage?.behind) {
        tone = "warn";
        headline = `${stage.name} is behind its plan`;
      } else if (toCheck.length) {
        tone = "warn";
        headline = `${toCheck.length} to check`;
      }

      return {
        id: job.id,
        name: job.name,
        address: job.address,
        active: job.active,
        promised: job.promised,
        promiseNote: job.promiseNote,
        promiseIn,
        tone,
        headline,
        people: input.jobPeople.filter((a) => a.jobId === job.id).map((a) => ({ email: a.email, name: fullName(a.email), role: a.role })),
        today,
        next,
        open: live.length,
        started: live.filter((t) => t.status === "doing").length,
        stuck,
        toCheck,
        verified,
        sentBack,
        cant,
        billingJobId: input.billing[job.id] ?? null,
        phases: job.phases ?? [],
        stage,
      };
    });

  const rank = (t: ProjectTone) => (t === "bad" ? 0 : t === "warn" ? 1 : 2);
  cards.sort((a, b) => rank(a.tone) - rank(b.tone) || (a.promised ?? "9999").localeCompare(b.promised ?? "9999") || a.name.localeCompare(b.name));
  const plans = [...input.reports].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 3);
  return { day, projects: cards, plans };
}
