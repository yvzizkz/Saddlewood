// The nightly plan the field supervisor sends the owners: tomorrow's schedule
// in priority order, every open task and where it stands, the pickups, the
// promises coming up, and what changed today. Client-safe and pure, so the
// screen previews exactly what the server sends.

import { addDays, clockText, dayShort } from "./time";
import {
  PRIORITIES,
  firstNameOf,
  isReportedDone,
  type CrewJob,
  type CrewPerson,
  type CrewPickup,
  type CrewScheduleItem,
  type CrewTask,
} from "./types";

export type PlanInput = {
  /** The day the plan is for. */
  day: string;
  /** The day it is written. */
  today: string;
  people: Pick<CrewPerson, "email" | "name">[];
  jobs: CrewJob[];
  schedule: CrewScheduleItem[];
  tasks: CrewTask[];
  pickups: CrewPickup[];
  /** What the supervisor needs from the owners. */
  note?: string;
};

export type Plan = {
  text: string;
  counts: { scheduled: number; unprioritized: number; open: number; toCheck: number; waiting: number; pickups: number };
};

export function priorityLabel(n: number | null | undefined): string {
  return PRIORITIES.find((p) => p.n === n)?.short ?? "";
}

/** The five words: Not started, In progress, Waiting, Reported done, Verified done. */
export function taskStatusWord(t: Pick<CrewTask, "status" | "verifiedAt" | "doneNote">): string {
  if (t.status === "open") return "Not started";
  if (t.status === "doing") return "In progress";
  if (t.status === "blocked") return t.doneNote ? `Waiting: ${t.doneNote}` : "Waiting";
  if (t.status === "dropped") return "Dropped";
  return t.verifiedAt ? "Verified done" : "Reported done, needs checking";
}

const byPriority = (a: { priority: number | null }, b: { priority: number | null }) => (a.priority ?? 9) - (b.priority ?? 9);

export function buildPlan(input: PlanInput): Plan {
  const { day, today } = input;
  const name = (email: string) => {
    const p = input.people.find((x) => x.email === email);
    return p ? firstNameOf(p.name) : email.split("@")[0];
  };
  const lines: string[] = [];

  const sched = input.schedule.filter((s) => s.day === day).sort((a, b) => byPriority(a, b) || a.jobName.localeCompare(b.jobName));
  lines.push(`${day === addDays(today, 1) ? "TOMORROW" : "PLAN"}: ${dayShort(day)}`);
  if (sched.length) {
    sched.forEach((s, i) => {
      const bits = [name(s.email), s.jobName, s.startTime ? clockText(s.startTime) : "", s.priority ? `P${s.priority} ${priorityLabel(s.priority).toLowerCase()}` : "no priority set"];
      lines.push(`${i + 1}. ${bits.filter(Boolean).join(" · ")}`);
      if (s.note) lines.push(`   ${s.note}`);
    });
  } else {
    lines.push("Nobody is scheduled yet.");
  }

  const live = input.tasks.filter((t) => t.status === "open" || t.status === "doing" || t.status === "blocked" || isReportedDone(t)).sort(byPriority);
  lines.push("", "OPEN TASKS");
  if (live.length) {
    for (const t of live) {
      lines.push(`- ${[t.jobName, t.title, name(t.email)].filter(Boolean).join(" · ")}: ${taskStatusWord(t)}${t.due ? ` (due ${dayShort(t.due)})` : ""}`);
    }
  } else {
    lines.push("None.");
  }

  const pickups = input.pickups.filter((p) => (p.status === "staged" || p.status === "picked" || p.status === "problem") && p.day <= day);
  if (pickups.length) {
    lines.push("", "PICKUPS");
    for (const p of pickups) {
      const state = p.status === "problem" ? `problem: ${p.runnerNote}` : p.status === "picked" ? "picked up" : "staged";
      lines.push(`- ${[p.supplier, p.orderRef ? `order ${p.orderRef}` : "", p.jobName, p.email ? name(p.email) : "any runner"].filter(Boolean).join(" · ")}: ${state}`);
    }
  }

  const soon = input.jobs
    .filter((j) => j.active && j.promised && j.promised >= today && j.promised <= addDays(today, 7))
    .sort((a, b) => (a.promised ?? "").localeCompare(b.promised ?? ""));
  if (soon.length) {
    lines.push("", "PROMISED THIS WEEK");
    for (const j of soon) lines.push(`- ${j.name}: ${j.promiseNote || "promised"} by ${dayShort(j.promised as string)}`);
  }

  const cant = input.schedule.filter((s) => s.ack === "cant" && s.day >= today);
  const sentBack = input.tasks.filter((t) => t.sentBack > 0 && (t.status === "open" || t.status === "doing"));
  if (cant.length || sentBack.length) {
    lines.push("", "CHANGED");
    for (const s of cant) lines.push(`- ${name(s.email)} cannot make ${s.jobName} ${dayShort(s.day)}${s.ackNote ? `: ${s.ackNote}` : ""}`);
    for (const t of sentBack) lines.push(`- Sent back: ${t.title} (${name(t.email)})`);
  }

  if (input.note?.trim()) lines.push("", "NEED FROM MARCO", input.note.trim());

  return {
    text: lines.join("\n"),
    counts: {
      scheduled: sched.length,
      unprioritized: sched.filter((s) => !s.priority).length,
      open: live.length,
      toCheck: live.filter(isReportedDone).length,
      waiting: live.filter((t) => t.status === "blocked").length,
      pickups: pickups.length,
    },
  };
}
