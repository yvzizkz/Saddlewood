// Grouping and totals for the KPI headers. Client-safe and pure.

import { bucketLabel, bucketOf, bucketsBetween, type Grain } from "./period";

export type Slice = {
  /** Stable id the drill-down puts in the URL. */
  key: string;
  label: string;
  value: number;
  /** Rows behind the slice. */
  count: number;
  share: number;
};

export type TrendPoint = { bucket: string; label: string; value: number };

/**
 * Sums `value` per group, biggest first. Past `limit` groups the tail folds into
 * one "Other" slice: a ninth color is never invented (see palette.ts).
 */
export function groupSum<T>(
  rows: readonly T[],
  keyOf: (r: T) => { key: string; label: string } | null,
  valueOf: (r: T) => number,
  limit = 7,
): Slice[] {
  const m = new Map<string, Slice>();
  let total = 0;
  for (const r of rows) {
    const k = keyOf(r) ?? { key: "", label: "Unassigned" };
    const v = valueOf(r);
    total += v;
    const s = m.get(k.key);
    if (s) {
      s.value += v;
      s.count += 1;
    } else {
      m.set(k.key, { key: k.key, label: k.label, value: v, count: 1, share: 0 });
    }
  }
  const all = [...m.values()].sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
  let out = all;
  if (all.length > limit) {
    const head = all.slice(0, limit - 1);
    const tail = all.slice(limit - 1);
    out = [
      ...head,
      {
        key: OTHER_KEY,
        label: `Other (${tail.length})`,
        value: tail.reduce((a, s) => a + s.value, 0),
        count: tail.reduce((a, s) => a + s.count, 0),
        share: 0,
      },
    ];
  }
  for (const s of out) s.share = total > 0 ? s.value / total : 0;
  return out;
}

export const OTHER_KEY = "__other";

/** Totals per day/week/month across the whole range, zeros included. */
export function trend<T>(
  rows: readonly T[],
  dayOf: (r: T) => string | null,
  valueOf: (r: T) => number,
  from: string,
  to: string,
  grain: Grain,
): TrendPoint[] {
  const sums = new Map<string, number>();
  for (const r of rows) {
    const d = dayOf(r);
    if (!d) continue;
    const b = bucketOf(d, grain);
    sums.set(b, (sums.get(b) ?? 0) + valueOf(r));
  }
  return bucketsBetween(from, to, grain).map((b) => ({ bucket: b, label: bucketLabel(b, grain), value: sums.get(b) ?? 0 }));
}

export function sum<T>(rows: readonly T[], valueOf: (r: T) => number): number {
  let t = 0;
  for (const r of rows) t += valueOf(r);
  return t;
}

/** Signed change vs the previous period, or null when there is nothing to compare. */
export function delta(now: number, before: number): { pct: number; up: boolean } | null {
  if (!before) return null;
  const pct = (now - before) / Math.abs(before);
  return { pct, up: pct >= 0 };
}

/** "12.9K", "$4.2M": compact numbers for tiles and axis ticks. */
export function compact(n: number, opts: { money?: boolean; digits?: number } = {}): string {
  const a = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  const pre = opts.money ? "$" : "";
  const fmt = (v: number, s: string) => `${sign}${pre}${v.toFixed(v >= 100 ? 0 : (opts.digits ?? 1)).replace(/\.0$/, "")}${s}`;
  if (a >= 1_000_000) return fmt(a / 1_000_000, "M");
  if (a >= 10_000) return fmt(a / 1_000, "K");
  if (opts.money) return `${sign}$${Math.round(a).toLocaleString("en-US")}`;
  return `${sign}${a.toLocaleString("en-US", { maximumFractionDigits: opts.digits ?? 1 })}`;
}

/** Clean axis ticks: 0 and up to four round steps covering `max`. */
export function niceTicks(max: number, count = 4, opts: { integer?: boolean } = {}): number[] {
  if (!(max > 0)) return [0, 1];
  // Counts never get a tick at 0.5: the step is at least 1.
  const raw = opts.integer ? Math.max(1, max / count) : max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).filter((s) => !opts.integer || Number.isInteger(s)).find((s) => s >= raw) ?? 10 * mag;
  const ticks: number[] = [];
  for (let v = 0; v < max + step * 0.999; v += step) ticks.push(Number(v.toPrecision(12)));
  return ticks;
}
