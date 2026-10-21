import { addDays } from "@/lib/crew/time";

import { allItems, allocate, cents, inPackage, itemDollars, lineSells, priceEstimate, roundUp, type Priced, type Rollup } from "./calc";
import { DEFAULT_SETTINGS, type SalesSettings } from "./settings";
import type { AllowanceDisplay, EstimateBody, EstimateItem, MarkupDisplay, Pricing, PresentLayout, Presentation, SigningMode } from "./types";

// What the client is sent: built from an estimate and the presentation the
// office picked, then frozen inside the document's snapshot. Only sell prices
// leave this file. Costs, hours, the labor rate, markups, internal memos and
// where a price came from are never copied in (RATE_CARD.md: "Never itemize
// labor hours or crew rates on any client-facing tab or proposal"); the tests
// pin that.

export type ProposalLine = {
  description: string;
  note?: string;
  qty?: number;
  unit?: string;
  /** Per-unit sell price, only when the layout shows unit prices. */
  unitCents?: number;
  /** The packages that carry this line. */
  pkgs: string[];
  /** Amount in each package, keyed by package id; only in the itemized layout. */
  amounts?: Record<string, number>;
  allowance?: boolean;
};

export type ProposalSection = {
  name: string;
  note?: string;
  pkgs: string[];
  /** Each package's price for the section; not in the "one price" layout. */
  amounts?: Record<string, number>;
  lines: ProposalLine[];
};

export type ProposalPackage = {
  id: string;
  name: string;
  tagline?: string;
  highlights: string[];
  recommended: boolean;
  totalCents: number;
};

export type ProposalOption = {
  id: string;
  description: string;
  note?: string;
  priceCents: number;
  /** Packages it can be added to (empty = any). */
  packages: string[];
};

/** A line after the sections, in every package that goes out: "Overhead and profit", or the markup on allowances. */
export type ProposalAdjustment = { key: "markup" | "allowance_markup"; label: string; amounts: Record<string, number> };

export type ProposalSnapshot = {
  v: 1;
  title: string;
  intro: string;
  layout: PresentLayout;
  show: Pick<Presentation, "showQuantities" | "showUnitPrices" | "showSectionNotes" | "showSchedule" | "showExclusions" | "showTimeline" | "showAllowanceAmounts">;
  markupDisplay: MarkupDisplay;
  allowanceDisplay: AllowanceDisplay;
  /** After the sections; each package's total is its sections plus these. Not in the "one price" layout. */
  adjustments: ProposalAdjustment[];
  /** Who signs, and the words they agree to (frozen with the proposal). */
  sign: { mode: SigningMode; consent: string; companyTitle: string; fonts: string[] };
  /** At least one; a single package with id "" when the estimate has none. */
  packages: ProposalPackage[];
  /** The client picks a package (more than one is going out). */
  choosePackage: boolean;
  sections: ProposalSection[];
  options: ProposalOption[];
  schedule: { label: string; pct: number }[];
  exclusions: string[];
  clarifications: string[];
  terms: string;
  timeline: string;
  validUntil: string;
  /** "Drawings: <set>, dated <date>; addenda: <...>" when priced from plans. */
  basis: string;
  allowAccept: boolean;
};

/**
 * Each line's amount inside one package, and the lines that go after the
 * sections, for the way markup and allowances are shown. Every variant adds
 * up to the same sell price; only where the client sees the markup changes.
 *
 *   markup "line"            prices before overhead and profit (contingency
 *                            stays inside), allowances at budget, then one
 *                            "Overhead and profit" line (which takes rounding)
 *   allowance "value"        each line at its share of the sell price
 *   allowance "budget_spread" allowances at budget; their markup is shared
 *                            out over the other lines
 *   allowance "budget_line"  allowances at budget, other lines at their share,
 *                            then "Overhead and profit on allowances"
 */
export function presentAmounts(
  items: EstimateItem[],
  p: Pricing,
  r: Rollup,
  markup: MarkupDisplay,
  allowance: AllowanceDisplay,
): { lines: Map<string, number>; adjustments: { key: ProposalAdjustment["key"]; label: string; cents: number }[] } {
  const c = p.contingencyPct / 100;
  const oh = p.overheadPct / 100;
  const pr = p.profitPct / 100;
  const parts = items.map((i) => {
    const d = itemDollars(i, p);
    const rest = d.material + d.waste + d.tax + d.labor + d.uplift + d.sub + d.subMarkup + d.equipment + d.other;
    return { i, rest, allow: d.allowance, isAllow: i.kind === "allowance" };
  });
  const allows = parts.filter((x) => x.isAllow);
  const others = parts.filter((x) => !x.isAllow);
  const lines = new Map<string, number>();
  const sum = () => [...lines.values()].reduce((a, b) => a + b, 0);

  if (markup === "line") {
    for (const x of allows) lines.set(x.i.id, cents(x.allow));
    const pre = r.direct + r.contingency;
    const shares = allocate(others.map((x) => x.rest * (1 + c)), pre - sum());
    others.forEach((x, k) => lines.set(x.i.id, shares[k]));
    return { lines, adjustments: [{ key: "markup", label: "Overhead and profit", cents: r.sell - sum() }] };
  }
  const sellW = (x: (typeof parts)[number]) => (x.rest * (1 + c + oh) + x.allow * (1 + oh)) * (1 + pr);
  if (allowance === "value" || allows.length === 0) {
    return { lines: lineSells(items, p, r.sell), adjustments: [] };
  }
  for (const x of allows) lines.set(x.i.id, cents(x.allow));
  if (allowance === "budget_spread" && others.length > 0) {
    const shares = allocate(others.map(sellW), r.sell - sum());
    others.forEach((x, k) => lines.set(x.i.id, shares[k]));
    return { lines, adjustments: [] };
  }
  const value = allocate(parts.map(sellW), r.sell);
  parts.forEach((x, k) => {
    if (!x.isAllow) lines.set(x.i.id, value[k]);
  });
  return { lines, adjustments: [{ key: "allowance_markup", label: "Overhead and profit on allowances", cents: r.sell - sum() }] };
}

export function buildProposal(
  body: EstimateBody,
  today: string,
  priced: Priced = priceEstimate(body),
  signing: SalesSettings["signing"] = DEFAULT_SETTINGS.signing,
): ProposalSnapshot {
  const pr = body.present;
  const items = allItems(body);

  // Which packages go out.
  let pkgs = body.packages.length > 0 ? body.packages : [{ id: "", name: "Base", highlights: [], recommended: true }];
  if (body.packages.length > 0 && pr.packageIds.length > 0) {
    const keep = pkgs.filter((p) => pr.packageIds.includes(p.id));
    if (keep.length > 0) pkgs = keep;
  }
  if (body.packages.length > 0 && !pr.showPackages) {
    // One price goes out: the recommended package among those picked, else the first.
    pkgs = [pkgs.find((p) => p.recommended) ?? pkgs[0]];
  }
  const ids = pkgs.map((p) => p.id);

  // Every line's amount inside each package that goes out, and what follows the sections.
  const markup: MarkupDisplay = pr.markupDisplay ?? "included";
  const allowanceShown: AllowanceDisplay = markup === "line" ? "budget_spread" : (pr.allowanceDisplay ?? "value");
  const linesByPkg = new Map<string, Map<string, number>>();
  const adjByPkg = new Map<string, { key: ProposalAdjustment["key"]; label: string; cents: number }[]>();
  for (const id of ids) {
    const inPkg = items.filter((i) => inPackage(i, id || null));
    const r = priced.packages[id];
    if (!r) continue;
    const a = presentAmounts(inPkg, body.pricing, r, markup, allowanceShown);
    linesByPkg.set(id, a.lines);
    adjByPkg.set(id, a.adjustments);
  }
  const adjustments: ProposalAdjustment[] = [];
  for (const id of ids) {
    for (const a of adjByPkg.get(id) ?? []) {
      let row = adjustments.find((x) => x.key === a.key);
      if (!row) adjustments.push((row = { key: a.key, label: a.label, amounts: {} }));
      row.amounts[id] = a.cents;
    }
  }

  const unitMode = pr.layout === "itemized" && pr.showUnitPrices;
  const sections: ProposalSection[] = [];
  for (const s of body.sections) {
    const lines: ProposalLine[] = [];
    for (const i of s.items) {
      if (i.optional) continue;
      const amounts: Record<string, number> = {};
      for (const id of ids) {
        const v = linesByPkg.get(id)?.get(i.id);
        if (v !== undefined) amounts[id] = v;
      }
      if (Object.keys(amounts).length === 0) continue;
      const line: ProposalLine = { description: i.description, pkgs: Object.keys(amounts), amounts };
      if (i.note?.trim()) line.note = i.note.trim();
      if (i.kind === "allowance") line.allowance = true;
      if (pr.layout === "itemized" && pr.showQuantities && i.qty > 0) {
        line.qty = i.qty;
        line.unit = i.unit;
      }
      if (unitMode && i.qty > 0) {
        // A unit price the client can multiply out: the line becomes unit x qty exactly.
        const first = Object.values(amounts)[0];
        const unitCents = Math.round(first / i.qty);
        line.qty = i.qty;
        line.unit = i.unit;
        line.unitCents = unitCents;
        for (const id of Object.keys(amounts)) amounts[id] = Math.round(unitCents * i.qty);
      }
      lines.push(line);
    }
    if (lines.length === 0) continue;
    const amounts: Record<string, number> = {};
    for (const id of ids) {
      if (lines.some((l) => l.pkgs.includes(id))) amounts[id] = lines.reduce((a, l) => a + (l.amounts?.[id] ?? 0), 0);
    }
    const sec: ProposalSection = { name: s.name, pkgs: Object.keys(amounts), amounts, lines };
    if (pr.showSectionNotes && s.note?.trim()) sec.note = s.note.trim();
    sections.push(sec);
  }

  const packages: ProposalPackage[] = pkgs.map((p) => ({
    id: p.id,
    name: p.name,
    tagline: "tagline" in p ? p.tagline : undefined,
    highlights: ("highlights" in p ? p.highlights : undefined)?.filter((h) => h.trim()) ?? [],
    recommended: !!p.recommended,
    totalCents: sections.reduce((a, s) => a + (s.amounts?.[p.id] ?? 0), 0) + adjustments.reduce((a, x) => a + (x.amounts[p.id] ?? 0), 0),
  }));

  // Only the numbers the layout shows leave the office: a "one price" proposal
  // carries no section prices, and only an itemized one carries line prices.
  // Allowances keep theirs in every layout: SOP-007 names each with its value.
  // An owner can also keep allowance values off the page (their names stay).
  const allowanceAmounts = pr.showAllowanceAmounts ?? true;
  for (const sec of sections) {
    if (pr.layout === "total") delete sec.amounts;
    for (const l of sec.lines) {
      if (l.allowance ? !allowanceAmounts : pr.layout !== "itemized") delete l.amounts;
    }
  }

  const options: ProposalOption[] = pr.showOptions
    ? items
        .filter((i) => i.optional && (priced.options[i.id]?.sell ?? 0) > 0)
        .map((i) => ({
          id: i.id,
          description: i.description,
          note: i.note?.trim() || undefined,
          priceCents: roundUp(priced.options[i.id].sell, body.pricing.roundTo),
          packages: (i.packages ?? []).filter((id) => ids.includes(id)),
        }))
    : [];

  const m = body.manifest;
  const basis =
    m.basis === "plans" && m.drawingSet?.trim()
      ? `Drawings: ${m.drawingSet.trim()}${m.drawingDate ? `, dated ${m.drawingDate}` : ""}${m.addenda?.trim() ? `; addenda: ${m.addenda.trim().replace(/\s*\n\s*/g, ", ")}` : "; no addenda"}`
      : "";

  return {
    v: 1,
    title: body.title,
    intro: body.intro.trim(),
    layout: pr.layout,
    show: {
      showQuantities: pr.showQuantities,
      showUnitPrices: unitMode,
      showSectionNotes: pr.showSectionNotes,
      showSchedule: pr.showSchedule,
      showExclusions: pr.showExclusions,
      showTimeline: pr.showTimeline,
      showAllowanceAmounts: allowanceAmounts,
    },
    markupDisplay: markup,
    allowanceDisplay: allowanceShown,
    adjustments: pr.layout === "total" ? [] : adjustments,
    sign: {
      mode: pr.allowAccept ? (pr.signing ?? "none") : "none",
      consent: signing.consentText,
      companyTitle: signing.companyTitle,
      fonts: [...signing.fonts],
    },
    packages,
    choosePackage: packages.length > 1,
    sections,
    options,
    schedule: pr.showSchedule ? body.schedule.filter((s) => s.label.trim()).map((s) => ({ label: s.label.trim(), pct: Number(s.pct) || 0 })) : [],
    exclusions: pr.showExclusions ? body.exclusions.map((e) => e.trim()).filter(Boolean) : [],
    clarifications: body.clarifications.map((e) => e.trim()).filter(Boolean),
    terms: body.terms.trim(),
    timeline: pr.showTimeline ? body.timeline.trim() : "",
    validUntil: addDays(today, Math.max(1, body.validDays || 30)),
    basis,
    allowAccept: pr.allowAccept,
  };
}

/** The price the client is agreeing to, worked out again from the frozen snapshot (never from what the browser says). */
export function acceptedTotal(
  p: ProposalSnapshot,
  packageId: string,
  optionIds: string[],
): { totalCents: number; packageName: string; options: { id: string; description: string; priceCents: number }[] } | null {
  const pkg = p.packages.find((x) => x.id === packageId);
  if (!pkg) return null;
  const chosen = [...new Set(optionIds)].map((id) => p.options.find((o) => o.id === id));
  if (chosen.some((o) => !o)) return null;
  const opts = chosen as ProposalOption[];
  if (opts.some((o) => o.packages.length > 0 && !o.packages.includes(pkg.id))) return null;
  return {
    totalCents: pkg.totalCents + opts.reduce((a, o) => a + o.priceCents, 0),
    packageName: pkg.name,
    options: opts.map((o) => ({ id: o.id, description: o.description, priceCents: o.priceCents })),
  };
}

/** Each payment step in dollars for a total; the last step takes the rounding so they add up. */
export function scheduleAmounts(schedule: { label: string; pct: number }[], totalCents: number): { label: string; pct: number; cents: number }[] {
  let left = totalCents;
  return schedule.map((s, i) => {
    const cents = i === schedule.length - 1 ? left : Math.round((totalCents * s.pct) / 100);
    left -= cents;
    return { ...s, cents };
  });
}
