import type { EstimateBody, EstimateItem, Pricing } from "./types";

// The price of an estimate, in whole cents, the way the Mac pipeline's rollup
// does it (Estimate/FRAMEWORK RUNBOOK stage 5, PREFERENCES "Margin Strategy"),
// so a number priced here and one priced there agree to the cent:
//
//   direct      = material + waste + tax + labor (+ hidden uplift)
//                 + sub + sub markup + equipment + other + allowances
//   contingency = contingency% x (direct - allowances)      rollup rule 6
//   overhead    = overhead%    x direct
//   profit      = profit%      x (direct + contingency + overhead)
//   sell        = direct + contingency + overhead + profit (+ rounding up)
//
// The cascade runs on exact amounts and only the sell price is rounded to the
// cent, as the pipeline's workbook formulas do (Patrick Lane: $173,100.48; its
// summary table, rounding each step, would print .49). The parts shown in the
// office are rounded one by one and profit takes the last cent, so they still
// add up to the sell price. Pure: no I/O, so the builder runs it on every key.

export type Buckets = {
  material: number;
  waste: number;
  tax: number;
  labor: number;
  uplift: number;
  sub: number;
  subMarkup: number;
  equipment: number;
  other: number;
  allowance: number;
};

export type Rollup = Buckets & {
  direct: number;
  contingency: number;
  overhead: number;
  profit: number;
  rounding: number;
  sell: number;
  /** What the work costs us: direct less the hidden uplift (which is margin). */
  cost: number;
  /** (sell - cost) / sell, in percent; 0 when there is nothing to sell. */
  marginPct: number;
  laborHours: number;
};

const EMPTY: Buckets = {
  material: 0,
  waste: 0,
  tax: 0,
  labor: 0,
  uplift: 0,
  sub: 0,
  subMarkup: 0,
  equipment: 0,
  other: 0,
  allowance: 0,
};

/** Half away from zero, to the cent, after removing float noise (0.1 * 3). */
export function cents(dollars: number): number {
  const c = Math.round(dollars * 100 * 1e6) / 1e6;
  return Math.sign(c) * Math.round(Math.abs(c));
}

function n(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/** The hidden uplift factor: 1 when what we recover is what we show. */
export function upliftFactor(p: Pricing): number {
  const tOh = p.targetOverheadPct ?? p.overheadPct;
  const tP = p.targetProfitPct ?? p.profitPct;
  const shown = (1 + p.overheadPct / 100) * (1 + p.profitPct / 100);
  const target = (1 + tOh / 100) * (1 + tP / 100);
  return shown > 0 ? target / shown : 1;
}

/** One line's cost by bucket, in exact dollars (not yet rounded). */
export function itemDollars(item: EstimateItem, p: Pricing): Buckets & { hours: number } {
  const qty = n(item.qty);
  const rate = item.rate != null && item.rate > 0 ? item.rate : p.laborRate;
  const out = { ...EMPTY, hours: 0 };
  const usesMaterial = item.kind === "installed" || item.kind === "material";
  const usesLabor = item.kind === "installed" || item.kind === "labor";
  if (usesMaterial) {
    out.material = qty * n(item.mat);
    out.waste = (out.material * n(item.wastePct)) / 100;
    out.tax = ((out.material + out.waste) * n(p.materialTaxPct)) / 100;
  }
  if (usesLabor) {
    if (n(item.hrs) > 0) {
      out.hours = qty * n(item.hrs);
      out.labor = out.hours * rate;
    } else {
      out.labor = qty * n(item.lab);
    }
  }
  const c = qty * n(item.cost);
  if (item.kind === "sub") {
    out.sub = c;
    out.subMarkup = (c * n(p.subMarkupPct)) / 100;
  } else if (item.kind === "equipment") out.equipment = c;
  else if (item.kind === "allowance") out.allowance = c;
  else if (item.kind === "other") out.other = c;
  out.uplift = (out.material + out.waste + out.labor) * (upliftFactor(p) - 1);
  return out;
}

/** The whole cascade over a set of lines. */
export function rollup(items: EstimateItem[], p: Pricing): Rollup {
  const sum = { ...EMPTY };
  let hours = 0;
  for (const item of items) {
    const d = itemDollars(item, p);
    for (const k of Object.keys(EMPTY) as (keyof Buckets)[]) sum[k] += d[k];
    hours += d.hours;
  }
  // Exact dollars through the cascade.
  const directX = (Object.keys(EMPTY) as (keyof Buckets)[]).reduce((a, k) => a + sum[k], 0);
  const contX = ((directX - sum.allowance) * n(p.contingencyPct)) / 100;
  const ohX = (directX * n(p.overheadPct)) / 100;
  const profitX = ((directX + contX + ohX) * n(p.profitPct)) / 100;
  const exact = cents(directX + contX + ohX + profitX);

  // The parts in cents, tied to the total.
  const b = {} as Buckets;
  for (const k of Object.keys(EMPTY) as (keyof Buckets)[]) b[k] = cents(sum[k]);
  const direct =
    b.material + b.waste + b.tax + b.labor + b.uplift + b.sub + b.subMarkup + b.equipment + b.other + b.allowance;
  const contingency = cents(contX);
  const overhead = cents(ohX);
  const profit = exact - direct - contingency - overhead;
  const sell = roundUp(exact, p.roundTo);
  const cost = direct - b.uplift;
  return {
    ...b,
    direct,
    contingency,
    overhead,
    profit,
    rounding: sell - exact,
    sell,
    cost,
    marginPct: sell > 0 ? ((sell - cost) / sell) * 100 : 0,
    laborHours: Math.round(hours * 10) / 10,
  };
}

/** Up to the next whole `step` dollars (0 or less: unchanged). */
export function roundUp(c: number, stepDollars: number): number {
  if (!(stepDollars > 0) || c <= 0) return c;
  const step = Math.round(stepDollars * 100);
  return Math.ceil(c / step) * step;
}

// ---- packages, options and what each line sells for --------------------------

export function allItems(body: EstimateBody): EstimateItem[] {
  return body.sections.flatMap((s) => s.items);
}

/** Lines in a package's base price: not an add-on, and either for every package or for this one. */
export function inPackage(item: EstimateItem, packageId: string | null): boolean {
  if (item.optional) return false;
  if (!packageId || !item.packages || item.packages.length === 0) return true;
  return item.packages.includes(packageId);
}

export function packageIds(body: EstimateBody): (string | null)[] {
  return body.packages.length > 0 ? body.packages.map((p) => p.id) : [null];
}

/** The package the office leads with: the recommended one, else the first, else none. */
export function primaryPackageId(body: EstimateBody): string | null {
  if (body.packages.length === 0) return null;
  return (body.packages.find((p) => p.recommended) ?? body.packages[0]).id;
}

export type Priced = {
  /** Each package's base price (key "" when there are no packages). */
  packages: Record<string, Rollup>;
  /** Each add-on on its own. */
  options: Record<string, Rollup>;
  /** The lead package's rollup: what the pipeline card and the totals bar show. */
  primary: Rollup;
};

export function priceEstimate(body: EstimateBody): Priced {
  const items = allItems(body);
  const packages: Record<string, Rollup> = {};
  for (const id of packageIds(body)) {
    packages[id ?? ""] = rollup(
      items.filter((i) => inPackage(i, id)),
      body.pricing,
    );
  }
  const options: Record<string, Rollup> = {};
  for (const i of items.filter((x) => x.optional)) options[i.id] = rollup([i], body.pricing);
  return { packages, options, primary: packages[primaryPackageId(body) ?? ""] };
}

/** Split `total` cents over weights, largest remainders first; adds up exactly. Zero weights share nothing. */
export function allocate(weights: number[], total: number): number[] {
  const w = weights.map((x) => (Number.isFinite(x) && x > 0 ? x : 0));
  const sum = w.reduce((a, b) => a + b, 0);
  if (w.length === 0) return [];
  if (sum <= 0) {
    const out = w.map(() => 0);
    out[0] = total;
    return out;
  }
  const raw = w.map((x) => (x / sum) * total);
  const floors = raw.map((r) => Math.floor(r));
  let left = total - floors.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r), w: w[i] })).sort((a, b) => b.frac - a.frac || b.w - a.w);
  for (const o of order) {
    if (left <= 0) break;
    floors[o.i] += 1;
    left -= 1;
  }
  return floors;
}

/**
 * What each line sells for inside one package, in cents, adding up exactly to
 * the package's sell price. Each line carries its share of the markups the way
 * the cascade applies them (an allowance no contingency), and the cents left
 * over from rounding go to the largest lines first.
 */
export function lineSells(items: EstimateItem[], p: Pricing, total: number): Map<string, number> {
  const c = n(p.contingencyPct) / 100;
  const oh = n(p.overheadPct) / 100;
  const pr = n(p.profitPct) / 100;
  const weights = items.map((item) => {
    const d = itemDollars(item, p);
    const allowance = d.allowance;
    const rest =
      d.material + d.waste + d.tax + d.labor + d.uplift + d.sub + d.subMarkup + d.equipment + d.other;
    return Math.max(0, (rest * (1 + c + oh) + allowance * (1 + oh)) * (1 + pr));
  });
  const sumW = weights.reduce((a, b) => a + b, 0);
  const out = new Map<string, number>();
  if (items.length === 0) return out;
  if (sumW <= 0) {
    items.forEach((i) => out.set(i.id, 0));
    return out;
  }
  const raw = weights.map((w) => (w / sumW) * total);
  const floors = raw.map((r) => Math.floor(r));
  let left = total - floors.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r), w: weights[i] }))
    .sort((a, b) => b.frac - a.frac || b.w - a.w);
  for (const o of order) {
    if (left <= 0) break;
    floors[o.i] += 1;
    left -= 1;
  }
  items.forEach((item, i) => out.set(item.id, floors[i]));
  return out;
}

/** The sell price of each section inside one package, in cents. */
export function sectionSells(body: EstimateBody, packageId: string | null, total: number): Map<string, number> {
  const items = allItems(body).filter((i) => inPackage(i, packageId));
  const lines = lineSells(items, body.pricing, total);
  const out = new Map<string, number>();
  for (const s of body.sections) {
    out.set(
      s.id,
      s.items.reduce((a, i) => a + (lines.get(i.id) ?? 0), 0),
    );
  }
  return out;
}

/** Dollars per square foot of the lead package, when an area is given. */
export function perSquareFoot(body: EstimateBody, sellCents: number): number | null {
  const area = n(body.area);
  return area > 0 ? sellCents / 100 / area : null;
}

/**
 * The profit percent that makes the lead package sell for `targetCents`
 * ("the client said 85"), with everything else held. Null when the target is
 * under what the work costs before profit.
 */
export function profitForTarget(body: EstimateBody, targetCents: number): number | null {
  const pid = primaryPackageId(body);
  const items = allItems(body).filter((i) => inPackage(i, pid));
  const r = rollup(items, { ...body.pricing, profitPct: 0, roundTo: 0 });
  const before = r.sell;
  if (!(before > 0) || targetCents < before) return null;
  return Math.round(((targetCents / before - 1) * 100) * 100) / 100;
}
