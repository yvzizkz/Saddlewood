// The drill-down every Accounting section shares, run on the server.
//
// A section hands over its rows for the period, the ways they can be grouped
// (trade, job, person, vendor…) and the number that matters (hours, dollars).
// The URL carries everything else:
//
//   ?p=wtd                 the period (period.ts)
//   &by=job                which grouping the breakdown chart shows
//   &trade=framing         a slice someone tapped: only those rows from here on
//   &job=8009              …and another, which makes the breadcrumb longer
//
// So a drill-down is a link, the back button undoes it, and a screen can be
// sent to someone exactly as it was seen.

import { delta, groupSum, sum, trend, OTHER_KEY, type Slice, type TrendPoint } from "./aggregate";
import { colorMap } from "./palette";
import { periodParams, type Period } from "./period";

export type Dim<T> = {
  key: string;
  label: string;
  /** Plural noun for "12 jobs". */
  plural: string;
  of: (row: T) => { key: string; label: string } | null;
  /** Pin trade colors (palette.ts). */
  trades?: boolean;
};

export type DrillSpec<T> = {
  /** Base path of the section, e.g. /app/accounting/payroll */
  path: string;
  title: string;
  dims: Dim<T>[];
  value: (row: T) => number;
  dayOf: (row: T) => string | null;
};

export type Crumb = { label: string; href: string };

export type BreakdownView = {
  dim: { key: string; label: string; plural: string };
  slices: (Slice & { color: string; href: string | null })[];
};

export type DrillResult<T> = {
  rows: T[];
  total: number;
  previousTotal: number | null;
  change: { pct: number; up: boolean } | null;
  trend: TrendPoint[];
  breakdown: BreakdownView;
  /** Every grouping, for the "By" switcher; the current one marked. */
  byOptions: { key: string; label: string; href: string; active: boolean }[];
  crumbs: Crumb[];
  filters: { dim: string; dimLabel: string; key: string; label: string; clearHref: string }[];
  /** Params that define this view (period, filters, by), to build more links. */
  params: Record<string, string>;
};

type Params = Record<string, string | string[] | undefined>;

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export function hrefOf(path: string, params: Record<string, string | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") q.set(k, v);
  const s = q.toString();
  return s ? `${path}?${s}` : path;
}

export function drill<T>(
  spec: DrillSpec<T>,
  rows: readonly T[],
  period: Period,
  searchParams: Params,
  opts: { previousRows?: readonly T[]; limit?: number } = {},
): DrillResult<T> {
  const base: Record<string, string> = { ...periodParams(period) };

  // Filters in the order the dims are declared, so the breadcrumb reads the same
  // way whichever slice was tapped first.
  const filters: { dim: Dim<T>; key: string }[] = [];
  for (const d of spec.dims) {
    const v = one(searchParams[d.key]);
    if (v !== undefined && v !== OTHER_KEY) filters.push({ dim: d, key: v });
  }
  const keep = (r: T) => filters.every((f) => (f.dim.of(r)?.key ?? "") === f.key);
  const filtered = rows.filter(keep);
  const prevFiltered = opts.previousRows ? opts.previousRows.filter(keep) : null;

  const filterParams: Record<string, string> = {};
  for (const f of filters) filterParams[f.dim.key] = f.key;

  // The breakdown shows the asked-for grouping, or the first one nobody has
  // narrowed to yet: after tapping a trade, the next chart is by job.
  const free = spec.dims.filter((d) => !filterParams[d.key]);
  const askedBy = one(searchParams.by);
  const by = spec.dims.find((d) => d.key === askedBy && !filterParams[d.key]) ?? free[0] ?? spec.dims[spec.dims.length - 1];
  const nextBy = (after: string) => spec.dims.find((d) => d.key !== after && !filterParams[d.key] && d.key !== by.key)?.key;

  const params = { ...base, ...filterParams, by: by.key };

  const slices = groupSum(filtered, by.of, spec.value, opts.limit ?? 7);
  // Colors from the whole period's ranking, so narrowing never repaints a slice.
  const colors = colorMap(groupSum(rows, by.of, spec.value, 99).map((s) => s.key), { trades: by.trades });

  const breakdown: BreakdownView = {
    dim: { key: by.key, label: by.label, plural: by.plural },
    slices: slices.map((s) => ({
      ...s,
      color: s.key === OTHER_KEY ? colors.get(OTHER_KEY) ?? "#a39c92" : colors.get(s.key) ?? "#a39c92",
      href:
        s.key === OTHER_KEY || free.length === 0
          ? null
          : hrefOf(spec.path, { ...base, ...filterParams, [by.key]: s.key, by: nextBy(by.key) }),
    })),
  };

  const labelOf = (d: Dim<T>, key: string) => {
    for (const r of rows) {
      const g = d.of(r);
      if ((g?.key ?? "") === key) return g?.label ?? "Unassigned";
    }
    return key || "Unassigned";
  };

  const crumbs: Crumb[] = [{ label: spec.title, href: hrefOf(spec.path, { ...base }) }];
  const acc: Record<string, string> = {};
  for (const f of filters) {
    acc[f.dim.key] = f.key;
    crumbs.push({ label: labelOf(f.dim, f.key), href: hrefOf(spec.path, { ...base, ...acc }) });
  }

  const total = sum(filtered, spec.value);
  const previousTotal = prevFiltered ? sum(prevFiltered, spec.value) : null;

  return {
    rows: filtered,
    total,
    previousTotal,
    change: previousTotal === null ? null : delta(total, previousTotal),
    trend: trend(filtered, spec.dayOf, spec.value, period.from, period.to, period.grain),
    breakdown,
    byOptions: spec.dims
      .filter((d) => !filterParams[d.key])
      .map((d) => ({ key: d.key, label: d.label, href: hrefOf(spec.path, { ...base, ...filterParams, by: d.key }), active: d.key === by.key })),
    crumbs,
    filters: filters.map((f) => {
      const rest = { ...filterParams };
      delete rest[f.dim.key];
      return {
        dim: f.dim.key,
        dimLabel: f.dim.label,
        key: f.key,
        label: labelOf(f.dim, f.key),
        clearHref: hrefOf(spec.path, { ...base, ...rest }),
      };
    }),
    params,
  };
}
