import { DEFAULT_TRADES, resolveTrade, tradeLabel } from "@/lib/accounting/trades";
import { fillTerms, POLICY_DEFAULTS } from "@/lib/policies/rules";
import { RATE_CARD } from "./catalog";
import type { EstimateBody, EstimateItem, EstimateSection, OpportunityKind, PaymentStep, Presentation, Pricing } from "./types";

// Where a new estimate starts. A template is a skeleton (sections, the usual
// lines with no quantities, the terms that fit the kind of work), never a
// price: every line still needs a quantity, and a line with no unit price is
// flagged by the checks until someone prices it.

export const DEFAULT_PRICING: Pricing = {
  laborRate: RATE_CARD.laborRate,
  // JOB_CONFIG defaults (FRAMEWORK/JOB_CONFIG_TEMPLATE.md): 5 / 15 / 10, subs 10.
  contingencyPct: 5,
  overheadPct: 15,
  profitPct: 10,
  subMarkupPct: 10,
  materialTaxPct: 0,
  targetOverheadPct: null,
  targetProfitPct: null,
  roundTo: 0,
  // An owner's number to set; 20% is where the checks start to warn.
  marginFloorPct: 20,
};

export const DEFAULT_PRESENT: Presentation = {
  layout: "sections",
  markupDisplay: "included",
  allowanceDisplay: "value",
  showAllowanceAmounts: true,
  signing: "both",
  showPackages: true,
  packageIds: [],
  showOptions: true,
  showQuantities: false,
  showUnitPrices: false,
  showSectionNotes: true,
  showSchedule: true,
  showExclusions: true,
  showTimeline: true,
  allowAccept: true,
};

/**
 * The short form of SOP-007 §1 that goes on every estimate. The {markers}
 * are filled from Company policies (src/lib/policies/rules.ts, fillTerms)
 * when an estimate starts, so the terms say what the owners decided: the
 * deposit, late interest, change-order markup and cancellation. Counsel
 * reviews the residential template before it is final, as SOP-007 says.
 */
export const DEFAULT_TERMS = [
  "Deposit of {deposit_pct}% of the contract is due at signing, before scheduling{special_orders}.",
  "Progress invoices go out on the 1st and 15th against work completed and are due in 7 days. Balances unpaid {late_grace} days after the {late_from} accrue {late_rate}% per month.",
  "Changes are made in writing and signed before the work starts, priced at cost plus {co_markup}% overhead and profit. Conditions concealed at the time of this estimate are a change.",
  "Allowances are budgets for selections still to be made; the difference between an allowance and the final selection is settled by change order.",
  "Workmanship is warranted for 2 years from substantial completion; manufacturer warranties pass through. Owner-supplied items are not covered.",
  "{cancellation}",
  "An Arizona preliminary 20-day notice is served on every job as routine paperwork.",
].join("\n");

// Milestones after the 10% deposit are a starting point to edit per job (SOP-007:
// milestone billing on jobs under $50,000, twice-monthly progress above).
const RESIDENTIAL_SCHEDULE: PaymentStep[] = [
  { id: "p1", label: "Deposit at signing", pct: 10 },
  { id: "p2", label: "Rough-in complete (framing, rough MEP inspected)", pct: 40 },
  { id: "p3", label: "Drywall and finishes complete", pct: 40 },
  { id: "p4", label: "Final walkthrough and punch", pct: 10 },
];

const GC_SCHEDULE: PaymentStep[] = [{ id: "p1", label: "Progress billing twice a month against the schedule of values", pct: 100 }];

let seq = 0;
/** A short id that is unique within one estimate body (not across the database). */
export function localId(prefix = "i"): string {
  seq = (seq + 1) % 1e6;
  return `${prefix}${Date.now().toString(36)}${seq.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}

function line(description: string, unit: string, kind: EstimateItem["kind"], extra: Partial<EstimateItem> = {}): EstimateItem {
  return {
    id: localId(),
    description,
    kind,
    qty: 0,
    unit,
    mat: 0,
    wastePct: kind === "installed" || kind === "material" ? 10 : 0,
    hrs: 0,
    lab: 0,
    cost: 0,
    rate: null,
    priceDate: null,
    source: "",
    ...extra,
  };
}

function section(name: string, items: EstimateItem[], note?: string): EstimateSection {
  return { id: localId("s"), name, note, items };
}

/** A section for one of Saddlewood's trades, named from the shared trade list (trades.ts). */
function tradeSection(tradeKey: "plumbing" | "electrical" | "hvac", items: EstimateItem[], note?: string): EstimateSection {
  const label = resolveTrade(tradeKey, DEFAULT_TRADES)?.label ?? tradeLabel(tradeKey);
  return section(label, items, note);
}

/** Self-performed MEP sections (CR-37 Plumbing, CR-11 Electrical, CR-39 HVAC) for remodel and addition estimates. */
function mepSections(): EstimateSection[] {
  return [
    tradeSection("plumbing", [
      line("Rough-in and top-out (DWV, water supply, gas)", "LS", "installed"),
      line("Trim and fixture setting", "EA", "labor"),
    ]),
    tradeSection("electrical", [
      line("Rough-in, circuits and boxes", "LS", "installed"),
      line("Panel / service and trim-out", "LS", "installed"),
    ]),
    tradeSection("hvac", [
      line("Ductwork, rough-in and registers", "LS", "installed"),
      line("Equipment set, startup and balance", "LS", "installed"),
    ]),
  ];
}

export type TemplateKey = "quick" | "remodel" | "addition" | "framing_sub" | "service" | "blank";

export const TEMPLATES: { key: TemplateKey; label: string; hint: string }[] = [
  { key: "quick", label: "Quick price", hint: "On site, one number in two minutes" },
  { key: "remodel", label: "Remodel", hint: "Kitchen, bath, whole-house: scopes, allowances, packages" },
  { key: "addition", label: "Addition", hint: "New square footage tied into the house" },
  { key: "framing_sub", label: "Framing package", hint: "To a GC: labor + material, CSI sections, GCs" },
  { key: "service", label: "Time & material", hint: "Hours at the rate, material at cost plus" },
  { key: "blank", label: "Blank", hint: "Start empty" },
];

export function templateFor(kind: OpportunityKind): TemplateKey {
  if (kind === "framing_sub" || kind === "commercial_ti") return "framing_sub";
  if (kind === "addition" || kind === "custom_home") return "addition";
  if (kind === "service") return "service";
  return "remodel";
}

/** The company's settings a new estimate starts from (settings.ts, estimateDefaults). */
export type EstimateDefaults = {
  pricing: Pricing;
  present: Presentation;
  terms: string;
  validDays: number;
  schedule: { label: string; pct: number }[];
};

function base(template: TemplateKey, title: string, d?: EstimateDefaults): EstimateBody {
  const schedule = d?.schedule?.length ? d.schedule.map((s) => ({ id: localId("p"), label: s.label, pct: s.pct })) : RESIDENTIAL_SCHEDULE.map((s) => ({ ...s }));
  return {
    v: 1,
    template,
    title,
    intro: "",
    sections: [],
    packages: [],
    pricing: { ...(d?.pricing ?? DEFAULT_PRICING) },
    present: { ...(d?.present ?? DEFAULT_PRESENT), packageIds: [] },
    schedule,
    exclusions: [],
    clarifications: [],
    terms: d?.terms ?? fillTerms(DEFAULT_TERMS, POLICY_DEFAULTS),
    validDays: d?.validDays ?? 30,
    timeline: "",
    area: null,
    manifest: { basis: "site_walk", priorChecked: false },
  };
}

export function newEstimateBody(template: TemplateKey, title: string, defaults?: EstimateDefaults): EstimateBody {
  const b = base(template, title, defaults);
  switch (template) {
    case "quick":
      b.sections = [section("Scope of work", [line("Describe the work", "LS", "other")])];
      b.present = { ...b.present, layout: "total", showSchedule: false };
      b.schedule = [
        { id: "p1", label: "Deposit at signing", pct: 50 },
        { id: "p2", label: "On completion", pct: 50 },
      ];
      b.exclusions = ["Permits and permit fees unless listed above.", "Repair of conditions concealed at the time of this estimate."];
      break;
    case "remodel":
      b.sections = [
        section("Protection and demolition", [
          line("Floor and dust protection, zip walls", "LS", "other"),
          line("Demolition and haul-off", "LF", "labor"),
          line("Dumpster", "EA", "equipment"),
        ]),
        section("Framing and rough carpentry", [line("Wall framing", "LF", "labor"), line("Blocking for fixtures, cabinets and accessories", "LF", "labor")]),
        section("Drywall", [line("Hang, tape and finish", "SF", "installed")]),
        section("Finish carpentry and cabinets", [line("Cabinet install", "LF", "labor"), line("Trim and doors", "LF", "installed")]),
        section("Tile and flooring", [line("Floor tile", "SF", "installed"), line("Wall tile", "SF", "installed")]),
        section("Paint", [line("Paint walls and ceilings", "SF", "sub")]),
        ...mepSections(),
        section(
          "Allowances",
          [line("Cabinets allowance", "LS", "allowance"), line("Countertops allowance", "LS", "allowance"), line("Tile material allowance", "LS", "allowance"), line("Plumbing fixtures allowance", "LS", "allowance")],
          "Allowances are budgets for selections you make; the final cost is billed as selected.",
        ),
        section("General conditions", [line("Supervision", "WK", "labor"), line("Final clean", "LS", "labor")]),
      ];
      b.exclusions = [
        "Permits and permit fees unless listed above.",
        "Engineering, architectural drawings and HOA approvals.",
        "Asbestos, lead, mold or other hazardous material testing and abatement.",
        "Repair of concealed conditions (rot, termite damage, code deficiencies) found during demolition; priced by change order.",
        "Appliances and their installation unless listed above.",
      ];
      b.clarifications = ["Price is based on a site walk; selections not yet made are carried as allowances."];
      break;
    case "addition":
      b.sections = [
        section("Site and foundation", [line("Layout, excavation and footings (sub)", "LS", "sub"), line("Slab", "SF", "sub")]),
        section("Framing", [line("Wall framing", "LF", "installed"), line("Roof framing / trusses", "SF", "installed"), line("Sheathing", "SF", "installed")]),
        section("Tie-in to existing house", [line("Remove exterior wall section and header", "LS", "labor"), line("Roof tie-in", "LF", "labor")]),
        section("Exterior envelope", [line("Stucco (sub)", "SF", "sub"), line("Roofing (sub)", "SF", "sub"), line("Windows and exterior doors", "EA", "installed")]),
        ...mepSections(),
        section("Insulation and drywall", [line("Insulation", "SF", "installed"), line("Drywall hang, tape, finish", "SF", "installed")]),
        section("Finishes", [line("Flooring", "SF", "installed"), line("Trim and doors", "LF", "installed"), line("Paint (sub)", "SF", "sub")]),
        section("Allowances", [line("Finish selections allowance", "LS", "allowance")]),
        section("General conditions", [line("Supervision", "WK", "labor"), line("Dumpsters", "EA", "equipment"), line("Permits and plan review", "LS", "other")]),
      ];
      b.exclusions = [
        "Engineering, architectural drawings and HOA approvals unless listed above.",
        "Utility company fees and service upgrades.",
        "Landscaping and hardscape restoration beyond rough grade.",
        "Repair of concealed conditions in the existing house found at the tie-in; priced by change order.",
      ];
      b.manifest = { basis: "plans", drawingSet: "", drawingDate: null, addenda: "", priorChecked: false };
      break;
    case "framing_sub":
      b.sections = [
        section("Cold-formed metal framing (09 22 16)", [line("Steel stud walls", "LF", "installed"), line("Headers and box beams", "EA", "installed"), line("Ceiling framing", "SF", "installed")]),
        section("Rough carpentry / blocking (06 10 00)", [line("In-wall blocking", "LF", "installed")]),
        section("Gypsum board (09 29 00)", [line("Gypsum board hang, tape, finish", "SF", "installed")]),
        section("Allowances", [line("Hold-downs / connectors allowance", "LS", "allowance")]),
        section("General conditions", [
          line("Supervision: working foreman, full duration", "WK", "labor", { lab: 1801.2, priceDate: "2026-10-12", source: "gc-foreman · Patrick Lane GCs GC-01" }),
          line("Mobilization / demobilization", "EA", "labor", { lab: 560.24, priceDate: "2026-10-12", source: "gc-mob · Patrick Lane GCs GC-02" }),
          line("Small tools and consumables", "WK", "other", { cost: 300, priceDate: "2026-10-12", source: "gc-tools · Patrick Lane GCs GC-03" }),
          line("Material receiving, handling and distribution", "HR", "labor", { hrs: 1 }),
          line("Daily cleanup of our debris to GC dumpster", "HR", "labor", { hrs: 1 }),
        ]),
      ];
      b.schedule = GC_SCHEDULE.map((s) => ({ ...s }));
      b.clarifications = [
        "We assume the GC / owner pulls and pays the building permit and we work under it; if directed to pull it, the fee is added by change order.",
        "Bid per the drawing set and addenda listed in this proposal; later revisions are priced by change order.",
        "Layout from the GC's control lines; dumpster by the GC.",
      ];
      b.exclusions = [
        "Structural steel, steel trusses and glulam beams.",
        "MEP, fire protection and specialty trades.",
        "Painting and wall coverings beyond the finish level stated.",
        "Bonds, unless listed above.",
      ];
      b.manifest = { basis: "plans", drawingSet: "", drawingDate: null, addenda: "", priorChecked: false };
      b.present = { ...b.present, layout: "sections", showPackages: false };
      b.validDays = 30;
      break;
    case "service":
      b.sections = [
        section("Labor", [line("Field labor", "HR", "labor", { hrs: 1, priceDate: RATE_CARD.effective, source: "lab-hourly · RATE_CARD" })]),
        section("Materials", [line("Materials at cost", "LS", "material")]),
      ];
      b.present = { ...b.present, layout: "itemized", showQuantities: true, showSchedule: false };
      b.schedule = [{ id: "p1", label: "Due on completion", pct: 100 }];
      b.exclusions = ["Work beyond the description above is billed at the same hourly rate."];
      b.pricing.contingencyPct = 0;
      break;
    case "blank":
      b.sections = [section("Scope", [])];
      break;
  }
  return b;
}
