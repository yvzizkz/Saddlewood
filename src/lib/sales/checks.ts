import { allItems, inPackage, priceEstimate, type Priced } from "./calc";
import { RATE_CARD } from "./catalog";
import type { EstimateBody, EstimateItem, OpportunityKind } from "./types";

// What has to be true before a number goes to a client. These are the rules
// written after real misses (CLAUDE.md "Estimating & takeoffs"): Franklin Hall
// was priced off the 07-20 set, missed ASI002 and an estimate already sent;
// foremen were counted in both labor and GCs; OSB stood in for plywood; unit
// prices older than 60 days rode into bids. A "stop" blocks sending; a "warn"
// is shown with the send button; an "info" is for the estimator.

export type CheckLevel = "stop" | "warn" | "info";
export type CheckArea = "manifest" | "lines" | "pricing" | "present" | "terms";

export type Check = {
  id: string;
  level: CheckLevel;
  area: CheckArea;
  title: string;
  detail?: string;
  /** The lines it is about, so the builder can jump to them. */
  itemIds?: string[];
};

export type PriorProposal = { number: string; revision: number; totalCents: number; issuedAt: string };

export type CheckContext = {
  /** YYYY-MM-DD, America/Phoenix. */
  today: string;
  kind: OpportunityKind;
  prior: PriorProposal[];
  bidDue?: string | null;
};

const STALE_DAYS = 60;

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);
}

function usd(c: number): string {
  return (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

/** True when the line's price is a dollar figure someone typed or copied, not only hours at the rate. */
function hasDollarPrice(i: EstimateItem): boolean {
  return i.mat > 0 || i.cost > 0 || (i.hrs <= 0 && i.lab > 0);
}

function isPriced(i: EstimateItem): boolean {
  switch (i.kind) {
    case "installed":
      return i.mat > 0 && (i.hrs > 0 || i.lab > 0);
    case "material":
      return i.mat > 0;
    case "labor":
      return i.hrs > 0 || i.lab > 0;
    default:
      return i.cost > 0;
  }
}

const SUPERVISION = /\b(foreman|supervis\w*|superintendent|project manag\w*|\bpm\b)/i;
const GENERAL_CONDITIONS = /general conditions|\bgcs?\b/i;

/** Pairs of specs that should not both appear in one estimate without a reason. */
const SPEC_CONFLICTS: [RegExp, RegExp, string][] = [
  [/\bosb\b/i, /\bplywood\b|\bply\b/i, "OSB and plywood"],
  [/kraft[- ]faced/i, /\bmetal stud|\bcfs\b|steel stud/i, "kraft-faced batts in a metal-stud wall (use unfaced)"],
  [/coarse[- ]thread|w-type/i, /\bmetal stud|\bcfs\b|steel stud/i, "coarse-thread screws on metal studs (use fine thread)"],
];

export function runChecks(body: EstimateBody, ctx: CheckContext, priced: Priced = priceEstimate(body)): Check[] {
  const out: Check[] = [];
  const items = allItems(body);
  const base = items.filter((i) => !i.optional);
  const p = body.pricing;
  const primary = priced.primary;

  // ---- the source manifest --------------------------------------------------
  const m = body.manifest;
  if (m.basis === "plans") {
    if (!m.drawingSet?.trim() || !m.drawingDate) {
      out.push({
        id: "manifest-set",
        level: "stop",
        area: "manifest",
        title: "Name the drawing set and its date",
        detail: "Priced from plans: the newest set, by name and date, goes on the proposal so a later revision is a change order.",
      });
    }
    if (!m.addenda?.trim()) {
      out.push({
        id: "manifest-addenda",
        level: "warn",
        area: "manifest",
        title: "List the ASIs / addenda / RFIs after that set, or write \"none\"",
        detail: "Franklin Hall missed ASI002 this way.",
      });
    }
  }
  if (!m.priorChecked) {
    out.push({
      id: "manifest-prior",
      level: "stop",
      area: "manifest",
      title: "Confirm nothing was already sent for this job",
      detail: "Search sent mail, Joist and DocuSign for an estimate or proposal on this job, then tick it on the Sources card.",
    });
  }

  // ---- lines ---------------------------------------------------------------
  if (base.length === 0) {
    out.push({ id: "lines-none", level: "stop", area: "lines", title: "There are no lines to price" });
  }
  const noQty = base.filter((i) => !(i.qty > 0));
  if (noQty.length) {
    out.push({
      id: "lines-qty",
      level: "stop",
      area: "lines",
      title: `${noQty.length} line${noQty.length === 1 ? " has" : "s have"} no quantity`,
      detail: noQty.slice(0, 4).map((i) => i.description).join(" · "),
      itemIds: noQty.map((i) => i.id),
    });
  }
  const unpriced = items.filter((i) => i.qty > 0 && !isPriced(i));
  if (unpriced.length) {
    out.push({
      id: "lines-price",
      level: "stop",
      area: "lines",
      title: `${unpriced.length} line${unpriced.length === 1 ? " is" : "s are"} not priced`,
      detail: unpriced.slice(0, 4).map((i) => i.description).join(" · "),
      itemIds: unpriced.map((i) => i.id),
    });
  }
  const stale = items.filter((i) => hasDollarPrice(i) && i.priceDate && daysBetween(i.priceDate, ctx.today) > STALE_DAYS);
  if (stale.length) {
    out.push({
      id: "lines-stale",
      level: "warn",
      area: "lines",
      title: `${stale.length} unit price${stale.length === 1 ? " is" : "s are"} older than ${STALE_DAYS} days`,
      detail: "Re-confirm with the supplier or a current quote, then update the price date.",
      itemIds: stale.map((i) => i.id),
    });
  }
  const undated = items.filter((i) => hasDollarPrice(i) && !i.priceDate);
  if (undated.length) {
    out.push({
      id: "lines-undated",
      level: "info",
      area: "lines",
      title: `${undated.length} price${undated.length === 1 ? " has" : "s have"} no date`,
      detail: "Add the day each price was confirmed so it can go stale on time.",
      itemIds: undated.map((i) => i.id),
    });
  }
  const subsNoQuote = items.filter((i) => i.kind === "sub" && i.cost > 0 && !(i.source ?? "").trim());
  if (subsNoQuote.length) {
    out.push({
      id: "lines-sub-quote",
      level: "info",
      area: "lines",
      title: `${subsNoQuote.length} sub price${subsNoQuote.length === 1 ? " has" : "s have"} no quote reference`,
      itemIds: subsNoQuote.map((i) => i.id),
    });
  }

  // Supervision counted twice: in a general-conditions section and in a trade, or in two trades.
  const supSections = new Map<string, EstimateItem[]>();
  for (const s of body.sections) {
    for (const i of s.items) {
      if ((i.kind === "labor" || i.kind === "installed") && SUPERVISION.test(i.description) && i.qty > 0) {
        supSections.set(s.id, [...(supSections.get(s.id) ?? []), i]);
      }
    }
  }
  if (supSections.size > 1) {
    const names = body.sections.filter((s) => supSections.has(s.id)).map((s) => s.name);
    const gc = names.some((n) => GENERAL_CONDITIONS.test(n));
    out.push({
      id: "lines-supervision",
      level: "warn",
      area: "lines",
      title: gc ? "Supervision is in general conditions and in a trade" : "Supervision appears in more than one section",
      detail: `${names.join(", ")}. The working foreman belongs in one place.`,
      itemIds: [...supSections.values()].flat().map((i) => i.id),
    });
  }

  const text = items.map((i) => `${i.description} ${i.note ?? ""}`).join(" \n ");
  for (const [a, b, label] of SPEC_CONFLICTS) {
    if (a.test(text) && b.test(text)) {
      const hits = items.filter((i) => a.test(i.description) || b.test(i.description));
      out.push({
        id: `lines-spec-${label}`,
        level: "warn",
        area: "lines",
        title: `Check the spec: ${label}`,
        detail: "Both appear in this estimate. Confirm against the drawings and spec book.",
        itemIds: hits.map((i) => i.id),
      });
    }
  }

  const zeroOptions = items.filter((i) => i.optional && !(i.qty > 0 && isPriced(i)));
  if (zeroOptions.length) {
    out.push({
      id: "lines-option-zero",
      level: "warn",
      area: "lines",
      title: `${zeroOptions.length} add-on${zeroOptions.length === 1 ? " has" : "s have"} no price`,
      itemIds: zeroOptions.map((i) => i.id),
    });
  }

  for (const pkg of body.packages) {
    if (!items.some((i) => inPackage(i, pkg.id))) {
      out.push({ id: `pkg-empty-${pkg.id}`, level: "stop", area: "lines", title: `Package "${pkg.name}" has no lines` });
    }
  }

  // ---- pricing ----------------------------------------------------------------
  if (primary && primary.sell > 0 && primary.marginPct < p.marginFloorPct) {
    out.push({
      id: "pricing-margin",
      level: "warn",
      area: "pricing",
      title: `Margin ${primary.marginPct.toFixed(1)}% is under the ${p.marginFloorPct}% floor`,
      detail: "Raise overhead or profit, or get an owner's OK to bid it thin.",
    });
  }
  if (p.contingencyPct <= 0 && (ctx.kind === "remodel" || ctx.kind === "addition")) {
    out.push({
      id: "pricing-contingency",
      level: "warn",
      area: "pricing",
      title: "No contingency on a remodel",
      detail: "There are always unknowns behind the walls (DEMO_CONTINGENCY rule).",
    });
  }
  if (Math.abs(p.laborRate - RATE_CARD.laborRate) > 0.005) {
    out.push({
      id: "pricing-rate",
      level: "info",
      area: "pricing",
      title: `Labor at $${p.laborRate.toFixed(2)}/hr, rate card is $${RATE_CARD.laborRate.toFixed(2)}`,
      detail: "Card rates are fully loaded: never add burden on top.",
    });
  }
  if (ctx.today >= RATE_CARD.reviewDue) {
    out.push({
      id: "pricing-rate-stale",
      level: "stop",
      area: "pricing",
      title: "The labor rate card is due for review",
      detail: `Effective ${RATE_CARD.effective}; Marco re-confirms it every January.`,
    });
  }
  const hiddenOh = p.targetOverheadPct != null && p.targetOverheadPct !== p.overheadPct;
  const hiddenP = p.targetProfitPct != null && p.targetProfitPct !== p.profitPct;
  if (hiddenOh || hiddenP) {
    out.push({
      id: "pricing-uplift",
      level: "info",
      area: "pricing",
      title: "A hidden uplift is on",
      detail: "Material and labor carry the difference between the target and the shown markup. It never shows on the client's copy.",
    });
  }

  // Against what was already sent.
  const last = [...ctx.prior].sort((a, b) => b.issuedAt.localeCompare(a.issuedAt))[0];
  if (last && primary) {
    const delta = primary.sell - last.totalCents;
    const pct = last.totalCents > 0 ? (delta / last.totalCents) * 100 : 0;
    if (delta !== 0) {
      out.push({
        id: "pricing-prior",
        level: Math.abs(pct) >= 10 ? "warn" : "info",
        area: "pricing",
        title: `${delta > 0 ? "Up" : "Down"} ${usd(Math.abs(delta))} (${pct > 0 ? "+" : ""}${pct.toFixed(1)}%) from ${last.number} rev ${last.revision}`,
        detail: "Say why in the intro or a clarification before it goes out.",
      });
    }
  }

  // ---- what the client sees -------------------------------------------------
  const pr = body.present;
  if (items.some((i) => i.kind === "allowance" && !i.optional) && pr.showAllowanceAmounts === false) {
    out.push({
      id: "present-allowances",
      level: "warn",
      area: "present",
      title: "Allowance amounts are hidden from the client",
      detail: "SOP-007 names each allowance with its dollar value. Hide them only when you mean to.",
    });
  }
  if (pr.markupDisplay === "line" && pr.layout === "total") {
    out.push({ id: "present-markup-total", level: "info", area: "present", title: "Overhead and profit as a line does not show in the one-price layout" });
  }
  if (pr.showSchedule && body.schedule.length > 0) {
    const sum = body.schedule.reduce((a, s) => a + (Number(s.pct) || 0), 0);
    if (Math.abs(sum - 100) > 0.001) {
      out.push({ id: "present-schedule", level: "stop", area: "terms", title: `Payment schedule adds up to ${sum}%, not 100%` });
    }
  }
  if (body.exclusions.filter((e) => e.trim()).length === 0) {
    out.push({ id: "terms-exclusions", level: "warn", area: "terms", title: "No exclusions listed", detail: "What is not included protects the price." });
  }
  if (!body.terms.trim()) {
    out.push({ id: "terms-empty", level: "warn", area: "terms", title: "No terms on the proposal" });
  }
  if (ctx.bidDue && ctx.bidDue < ctx.today) {
    out.push({ id: "terms-bid-due", level: "warn", area: "terms", title: `The bid was due ${ctx.bidDue}` });
  }
  if (body.packages.length === 1) {
    out.push({ id: "present-one-package", level: "info", area: "present", title: "One package: the client sees a single price", detail: "Add a second package to give them a choice." });
  }

  const order: Record<CheckLevel, number> = { stop: 0, warn: 1, info: 2 };
  return out.sort((a, b) => order[a.level] - order[b.level]);
}

export function blocking(checks: Check[]): Check[] {
  return checks.filter((c) => c.level === "stop");
}
