import { localDay } from "./time";
import type { CrewJob, CrewJobPhase, CrewJobStaged, JobStage } from "./types";

// The stage of a job (0024, Lando 2026-10-19): a list of phases the project
// manager or an owner keeps on the job, each verified by a person. The stage
// is derived from the list every time it is read, never stored: the first
// phase nobody has verified is where the job is. A worker's word never moves
// it. Everything here is pure, so it is tested without a database; the read
// that joins it to the jobs is src/lib/crew/stages.ts.

/**
 * What a job's list starts with. Marco edits a job's phases in the app once
 * they are on it; these are only the starting point.
 */
export const PHASE_TEMPLATES = {
  framing: ["layout", "walls", "roof and ceiling", "backing", "inspection"],
  drywall: ["hang", "tape", "texture", "punch"],
} as const;
export type PhaseTemplate = keyof typeof PHASE_TEMPLATES;
export type PhaseTemplatePick = PhaseTemplate | "both";

/** A phase as the owner's list names it, before it is a row. */
export type PhaseSpec = { name: string; trade: string; plannedFrom: string | null; plannedTo: string | null };

export function templatePhases(pick: PhaseTemplatePick): PhaseSpec[] {
  const trades: PhaseTemplate[] = pick === "both" ? ["framing", "drywall"] : [pick];
  return trades.flatMap((trade) => PHASE_TEMPLATES[trade].map((name) => ({ name, trade, plannedFrom: null, plannedTo: null })));
}

/** One job's phases out of everyone's, in order. */
export function phasesOf(all: CrewJobPhase[], jobId: string): CrewJobPhase[] {
  return all.filter((p) => p.jobId === jobId).sort((a, b) => a.ord - b.ord);
}

/** Calendar days from one YYYY-MM-DD to another; negative when `to` is earlier. */
function daysFrom(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
}

/**
 * Where the job is. The current phase is the first one in order that nobody
 * has verified; "complete" once every one is; null when there are no phases.
 *
 * sinceDay is the Phoenix day the previous phase was verified, or, on the
 * first phase, the day of the job's first shift (passed in), or null. `day`
 * counts calendar days from it with sinceDay as day 1. `behind` is a plan
 * that has run out: planned_to before today and the phase not verified.
 */
export function stageOf(phases: CrewJobPhase[], today: string, firstShiftDay: string | null = null): JobStage | null {
  if (!phases.length) return null;
  const list = [...phases].sort((a, b) => a.ord - b.ord);
  const idx = list.findIndex((p) => !p.verifiedAt);
  if (idx < 0) {
    const last = list[list.length - 1];
    const latest = list.reduce<string | null>((m, p) => (p.verifiedAt && (!m || p.verifiedAt > m) ? p.verifiedAt : m), null);
    return {
      id: null,
      name: "complete",
      trade: last.trade,
      ord: list.length,
      of: list.length,
      sinceDay: latest ? localDay(latest) : null,
      day: null,
      plannedFrom: null,
      plannedTo: null,
      plannedDays: null,
      behind: false,
      complete: true,
    };
  }
  const cur = list[idx];
  const prev = idx > 0 ? list[idx - 1] : null;
  const sinceDay = prev?.verifiedAt ? localDay(prev.verifiedAt) : firstShiftDay;
  return {
    id: cur.id,
    name: cur.name,
    trade: cur.trade,
    ord: idx + 1,
    of: list.length,
    sinceDay,
    day: sinceDay ? Math.max(1, daysFrom(sinceDay, today) + 1) : null,
    plannedFrom: cur.plannedFrom,
    plannedTo: cur.plannedTo,
    plannedDays: cur.plannedFrom && cur.plannedTo ? Math.max(1, daysFrom(cur.plannedFrom, cur.plannedTo) + 1) : null,
    behind: !!cur.plannedTo && cur.plannedTo < today,
    complete: false,
  };
}

/** Whether the stage of this list would fall back to the job's first shift day (the first phase is still open). */
export function needsFirstShift(phases: CrewJobPhase[]): boolean {
  const first = [...phases].sort((a, b) => a.ord - b.ord)[0];
  return !!first && !first.verifiedAt;
}

/** "hang, day 3" · "hang" · "complete" · "" (no phases). For the small text after a job's name. */
export function stageText(stage: JobStage | null): string {
  if (!stage) return "";
  if (stage.complete) return "complete";
  return stage.day ? `${stage.name}, day ${stage.day}` : stage.name;
}

export function withStage<J extends CrewJob>(job: J, phases: CrewJobPhase[], today: string, firstShiftDay: string | null = null): J & Pick<CrewJobStaged, "phases" | "stage"> {
  return { ...job, phases, stage: stageOf(phases, today, firstShiftDay) };
}

// ---- setting the list ----------------------------------------------------------------

export type PhaseKeep = { id: number; ord: number; trade: string; plannedFrom: string | null; plannedTo: string | null };
export type PhaseAdd = PhaseSpec & { ord: number };
export type PhaseSetPlan = { ok: true; keep: PhaseKeep[]; add: PhaseAdd[] } | { ok: false; error: string };

const norm = (s: string) => s.trim().toLowerCase();

/**
 * How to turn the job's list into `wanted`, in that order. Unverified phases
 * are dropped and the list re-made from `wanted`; a verified phase is never
 * dropped: each must still be on the list, by name and in the same order as
 * it was verified, and is kept with its check (its dates and trade follow the
 * list). Anything else refuses, so the owner sees why nothing changed.
 */
export function planPhaseSet(existing: CrewJobPhase[], wanted: PhaseSpec[]): PhaseSetPlan {
  const verified = existing.filter((p) => p.verifiedAt).sort((a, b) => a.ord - b.ord);
  const keep: PhaseKeep[] = [];
  const add: PhaseAdd[] = [];
  let vi = 0;
  wanted.forEach((w, i) => {
    const ord = i + 1;
    const v = verified[vi];
    if (v && norm(v.name) === norm(w.name)) {
      keep.push({ id: v.id, ord, trade: w.trade.trim() || v.trade, plannedFrom: w.plannedFrom, plannedTo: w.plannedTo });
      vi++;
    } else {
      add.push({ name: w.name.trim(), trade: w.trade.trim(), plannedFrom: w.plannedFrom, plannedTo: w.plannedTo, ord });
    }
  });
  if (vi < verified.length) {
    const missed = verified[vi];
    const onList = wanted.some((w) => norm(w.name) === norm(missed.name));
    return {
      ok: false,
      error: onList
        ? `Verified phases keep their order: "${missed.name}" was checked ${vi ? `after "${verified[vi - 1].name}"` : "first"}. Put it back where it was.`
        : `"${missed.name}" is verified and cannot be dropped. Unverify it first, or keep it on the list.`,
    };
  }
  return { ok: true, keep, add };
}
