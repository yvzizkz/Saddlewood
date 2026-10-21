import { SELF_PERFORMED, tradeLabel, type SelfPerformed } from "@/lib/accounting/tradeList";

import { localDay } from "./time";
import type { CrewJob, CrewJobPhase, CrewJobStaged, JobStage } from "./types";

// The stage of a job (0024, Lando 2026-10-19): a list of phases the project
// manager or an owner keeps on the job, each verified by a person. The stage
// is derived from the list every time it is read, never stored: the first
// phase nobody has verified is where the job is. A worker's word never moves
// it. Everything here is pure, so it is tested without a database; the read
// that joins it to the jobs is src/lib/crew/stages.ts.

// ---- templates -----------------------------------------------------------------------

/**
 * Where a step falls in a build, so phases from several trades interleave the
 * way a job runs (Arizona residential: Scottsdale, Phoenix and Maricopa County
 * inspect underground before the slab, every rough-in before cover, insulation
 * before board, and the service before the utility releases power).
 */
export const SLOT = {
  temp: 5,
  underground: 10,
  framing: 20,
  rough: 30,
  roughInspection: 40,
  insulation: 50,
  drywall: 60,
  trim: 70,
  service: 75,
  final: 80,
} as const;

type Step = readonly [name: string, slot: number];

/**
 * What a job's list starts with, one template per trade our crews perform
 * (SELF_PERFORMED in the shared trade list). Marco edits a job's phases in the
 * app once they are on it; these are only the starting point.
 */
const STEPS = {
  framing: [
    ["layout", SLOT.framing],
    ["walls", SLOT.framing],
    ["roof and ceiling", SLOT.framing],
    ["backing", SLOT.framing],
    ["inspection", SLOT.roughInspection],
  ],
  plumbing: [
    ["plumbing underground", SLOT.underground],
    ["plumbing underground inspection", SLOT.underground],
    ["top-out", SLOT.rough],
    ["top-out inspection", SLOT.roughInspection],
    ["gas pressure test", SLOT.roughInspection],
    ["set fixtures", SLOT.trim],
    ["plumbing final", SLOT.final],
  ],
  electrical: [
    ["temp power", SLOT.temp],
    ["electrical underground", SLOT.underground],
    ["electrical rough", SLOT.rough],
    ["electrical rough inspection", SLOT.roughInspection],
    ["electrical trim", SLOT.trim],
    ["service (SES) inspection", SLOT.service],
    ["electrical final", SLOT.final],
  ],
  hvac: [
    ["HVAC rough", SLOT.rough],
    ["ductwork", SLOT.rough],
    ["HVAC rough and duct inspection", SLOT.roughInspection],
    ["set equipment", SLOT.trim],
    ["startup", SLOT.trim],
    ["HVAC final", SLOT.final],
  ],
  insulation: [
    ["insulation", SLOT.insulation],
    ["insulation inspection", SLOT.insulation],
  ],
  drywall: [
    ["hang", SLOT.drywall],
    ["tape", SLOT.drywall],
    ["texture", SLOT.drywall],
    ["punch", SLOT.drywall],
  ],
} as const satisfies Record<SelfPerformed, readonly Step[]>;

export type PhaseTemplate = keyof typeof STEPS;

/** The trades with a template, in build order. */
export const TEMPLATE_TRADES = SELF_PERFORMED.filter((t) => t in STEPS) as readonly PhaseTemplate[];

/** Each trade's phase names, in its own order. */
export const PHASE_TEMPLATES = Object.fromEntries(TEMPLATE_TRADES.map((t) => [t, STEPS[t].map(([name]) => name)])) as Record<PhaseTemplate, string[]>;

/**
 * The whole job, when we hold the paper (remodel, addition, custom home):
 * one phase per stage of the build, each under the trade that carries it.
 */
export const GC_TEMPLATE: readonly { name: string; trade: string }[] = [
  { name: "demo", trade: "demo" },
  { name: "plumbing underground", trade: "plumbing" },
  { name: "footing and foundation", trade: "concrete" },
  { name: "footing and underground inspection", trade: "concrete" },
  { name: "framing", trade: "framing" },
  { name: "plumbing top-out", trade: "plumbing" },
  { name: "electrical rough", trade: "electrical" },
  { name: "HVAC rough and duct", trade: "hvac" },
  { name: "MEP rough inspections", trade: "general" },
  { name: "framing inspection", trade: "framing" },
  { name: "insulation and inspection", trade: "insulation" },
  { name: "drywall", trade: "drywall" },
  { name: "finishes", trade: "general" },
  { name: "MEP trim and startup", trade: "general" },
  { name: "MEP finals", trade: "general" },
  { name: "final inspection", trade: "general" },
];

/**
 * What a job's phases start from: "gc" for the whole job, or the job's trades
 * joined with commas ("framing,drywall"). "both" is kept for framing and
 * drywall, as the app sent it before there were more trades.
 */
export type PhaseTemplatePick = string;

const isTemplateTrade = (t: string): t is PhaseTemplate => (TEMPLATE_TRADES as readonly string[]).includes(t);

/** The trades in a pick, in build order; [] for "gc", null when it is not a pick at all. */
export function pickTrades(pick: string): PhaseTemplate[] | null {
  const raw = pick.trim().toLowerCase();
  if (raw === "gc") return [];
  const parts = raw === "both" ? ["framing", "drywall"] : raw.split(",").map((t) => t.trim()).filter(Boolean);
  if (!parts.length || !parts.every(isTemplateTrade)) return null;
  return TEMPLATE_TRADES.filter((t) => parts.includes(t));
}

export function isPhasePick(v: unknown): v is PhaseTemplatePick {
  return typeof v === "string" && pickTrades(v) !== null;
}

/** The pick for these trades, in build order ("none" for no trade). */
export function pickFor(trades: readonly string[]): PhaseTemplatePick {
  const list = TEMPLATE_TRADES.filter((t) => trades.includes(t));
  return list.length ? list.join(",") : "none";
}

/** "the whole job" · "framing and drywall" · "plumbing, electrical and HVAC". */
export function pickLabel(pick: PhaseTemplatePick): string {
  const trades = pickTrades(pick);
  if (!trades) return pick;
  if (!trades.length) return "the whole job";
  const names = trades.map((t) => tradeLabel(t).replace(/^(?!HVAC)./, (c) => c.toLowerCase()));
  return names.length < 3 ? names.join(" and ") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** A phase as the owner's list names it, before it is a row. */
export type PhaseSpec = { name: string; trade: string; plannedFrom: string | null; plannedTo: string | null };

/**
 * The phases a pick starts a job with. Several trades interleave by where each
 * step falls in the build (SLOT); steps in the same slot keep the trades' build
 * order. An unknown pick gives none.
 */
export function templatePhases(pick: PhaseTemplatePick): PhaseSpec[] {
  const trades = pickTrades(pick);
  if (!trades) return [];
  if (!trades.length) return GC_TEMPLATE.map(({ name, trade }) => ({ name, trade, plannedFrom: null, plannedTo: null }));
  return trades
    .flatMap((trade) => STEPS[trade].map(([name, slot]) => ({ name, trade, slot })))
    .map((s, i) => ({ ...s, i }))
    .sort((a, b) => a.slot - b.slot || a.i - b.i)
    .map(({ name, trade }) => ({ name, trade, plannedFrom: null, plannedTo: null }));
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
