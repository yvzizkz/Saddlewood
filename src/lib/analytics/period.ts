// The reporting periods every Accounting screen shares: Today, week to date,
// month to date, year to date, or a custom range. Client-safe and pure.
//
// Days are Phoenix calendar days (see crew/time.ts) and the week runs Monday to
// Sunday, the same week the timesheets use. Ranges are inclusive on both ends.

import { addDays, isDay, localDay, weekStart } from "@/lib/crew/time";

export type PeriodKey = "today" | "wtd" | "mtd" | "ytd" | "custom";

export const PERIOD_KEYS: PeriodKey[] = ["today", "wtd", "mtd", "ytd", "custom"];

export const PERIOD_LABEL: Record<PeriodKey, string> = {
  today: "Today",
  wtd: "Week",
  mtd: "Month",
  ytd: "Year",
  custom: "Custom",
};

/** How a trend chart buckets the period. */
export type Grain = "day" | "week" | "month";

export type Period = {
  key: PeriodKey;
  from: string;
  to: string;
  /** "Oct 14 – Oct 20", "Today, Oct 20" */
  label: string;
  grain: Grain;
  /** The same length of time just before, for the "vs last week" delta. */
  previous: { from: string; to: string; label: string };
};

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
}

function short(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function rangeLabel(from: string, to: string): string {
  if (from === to) return short(from);
  const sameYear = from.slice(0, 4) === to.slice(0, 4);
  const year = sameYear ? "" : `, ${from.slice(0, 4)}`;
  return `${short(from)}${year} – ${short(to)}${sameYear ? "" : `, ${to.slice(0, 4)}`}`;
}

function grainFor(from: string, to: string): Grain {
  const n = daysBetween(from, to) + 1;
  if (n <= 45) return "day";
  if (n <= 190) return "week";
  return "month";
}

/**
 * Reads the period out of URL params (`p`, `from`, `to`). Anything missing or
 * malformed falls back to `fallback` (week to date by default), so a stale or
 * hand-edited link still opens a sensible screen.
 */
export function resolvePeriod(
  params: { p?: string | null; from?: string | null; to?: string | null },
  today: string = localDay(),
  fallback: PeriodKey = "wtd",
): Period {
  const asked = (PERIOD_KEYS as string[]).includes(params.p ?? "") ? (params.p as PeriodKey) : fallback;
  let key: PeriodKey = asked;
  let from: string;
  let to = today;

  switch (asked) {
    case "today":
      from = today;
      break;
    case "wtd":
      from = weekStart(today);
      break;
    case "mtd":
      from = `${today.slice(0, 7)}-01`;
      break;
    case "ytd":
      from = `${today.slice(0, 4)}-01-01`;
      break;
    case "custom": {
      const f = params.from;
      const t = params.to;
      if (isDay(f) && isDay(t)) {
        [from, to] = f <= t ? [f, t] : [t, f];
      } else if (isDay(f)) {
        from = f <= today ? f : today;
      } else {
        key = fallback;
        return resolvePeriod({ p: fallback }, today, fallback);
      }
      break;
    }
  }

  const len = daysBetween(from, to) + 1;
  const prevTo = addDays(from, -1);
  const prevFrom = addDays(prevTo, -(len - 1));
  const label = key === "today" ? `Today, ${short(today)}` : rangeLabel(from, to);
  const prevLabel =
    key === "today" ? "yesterday" : key === "wtd" ? "last week" : key === "mtd" ? "last month" : key === "ytd" ? "last year" : "the period before";

  return {
    key,
    from,
    to,
    label,
    grain: grainFor(from, to),
    previous: { from: prevFrom, to: prevTo, label: prevLabel },
  };
}

/** The year-to-date window "last year" means: the same days, a year back. */
export function sameDaysLastYear(p: Period): { from: string; to: string } {
  const back = (d: string) => `${Number(d.slice(0, 4)) - 1}${d.slice(4)}`.replace(/-02-29$/, "-02-28");
  return { from: back(p.from), to: back(p.to) };
}

/** The bucket a day falls in at a grain: the day itself, its Monday, or the 1st. */
export function bucketOf(day: string, grain: Grain): string {
  if (grain === "day") return day;
  if (grain === "week") return weekStart(day);
  return `${day.slice(0, 7)}-01`;
}

/** Every bucket from `from` to `to`, so a chart shows the quiet days as zeros. */
export function bucketsBetween(from: string, to: string, grain: Grain): string[] {
  const out: string[] = [];
  let b = bucketOf(from, grain);
  const last = bucketOf(to, grain);
  while (b <= last) {
    out.push(b);
    if (grain === "day") b = addDays(b, 1);
    else if (grain === "week") b = addDays(b, 7);
    else {
      const [y, m] = b.split("-").map(Number);
      b = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
    }
    if (out.length > 400) break;
  }
  return out;
}

export function bucketLabel(bucket: string, grain: Grain): string {
  const d = new Date(`${bucket}T12:00:00Z`);
  if (grain === "month") return d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  if (grain === "week") return short(bucket);
  return d.toLocaleDateString("en-US", { weekday: "short", day: "numeric", timeZone: "UTC" });
}

/** True when a day (YYYY-MM-DD, or an ISO instant read in Phoenix) is inside the range. */
export function inRange(dayOrInstant: string | null | undefined, from: string, to: string): boolean {
  if (!dayOrInstant) return false;
  const d = isDay(dayOrInstant) ? dayOrInstant : localDay(dayOrInstant);
  return d >= from && d <= to;
}

/** URL params for a period, to merge into a link. */
export function periodParams(p: Pick<Period, "key" | "from" | "to">): Record<string, string> {
  return p.key === "custom" ? { p: "custom", from: p.from, to: p.to } : { p: p.key };
}
