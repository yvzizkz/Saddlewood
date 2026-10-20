// Sales: every prospect from the first call to the signed job, and the
// estimates priced for them (supabase/migrations/0025_sales.sql).
//
// An opportunity is the prospect. Its estimates are working drafts the office
// edits freely (`body`); what a client is sent is a frozen `documents` row of
// kind "estimate" whose snapshot carries the proposal (presentation.ts), so
// the client's link, its viewing record and "an issued document cannot be
// edited" are the billing foundation's, not a second copy of them.

// ---- the pipeline -----------------------------------------------------------

export const STAGES = [
  { key: "lead", label: "New lead", short: "Lead", probability: 10, open: true },
  { key: "qualified", label: "Qualified", short: "Qualified", probability: 20, open: true },
  { key: "site_visit", label: "Site visit / plans", short: "Visit", probability: 30, open: true },
  { key: "estimating", label: "Estimating", short: "Estimating", probability: 40, open: true },
  { key: "proposal_sent", label: "Proposal sent", short: "Sent", probability: 55, open: true },
  { key: "negotiating", label: "Negotiating", short: "Talking", probability: 70, open: true },
  { key: "won", label: "Won", short: "Won", probability: 100, open: false },
  { key: "lost", label: "Lost", short: "Lost", probability: 0, open: false },
  { key: "no_bid", label: "No bid", short: "No bid", probability: 0, open: false },
] as const;
export type Stage = (typeof STAGES)[number]["key"];
export const STAGE_KEYS = STAGES.map((s) => s.key) as Stage[];
export const OPEN_STAGES = STAGES.filter((s) => s.open).map((s) => s.key) as Stage[];

export function stageInfo(stage: Stage) {
  return STAGES.find((s) => s.key === stage) ?? STAGES[0];
}

export const KINDS = [
  { key: "remodel", label: "Remodel" },
  { key: "addition", label: "Addition" },
  { key: "custom_home", label: "Custom home" },
  { key: "framing_sub", label: "Framing package (to a GC)" },
  { key: "commercial_ti", label: "Commercial / TI" },
  { key: "service", label: "Service / small job" },
  { key: "other", label: "Other" },
] as const;
export type OpportunityKind = (typeof KINDS)[number]["key"];
export const KIND_KEYS = KINDS.map((k) => k.key) as OpportunityKind[];

export const SOURCES = [
  { key: "call", label: "Phone call" },
  { key: "website", label: "Website" },
  { key: "referral", label: "Referral" },
  { key: "repeat", label: "Repeat client" },
  { key: "bid_invite", label: "Bid invite" },
  { key: "field", label: "From the crew" },
  { key: "walk_in", label: "Met on site" },
  { key: "other", label: "Other" },
] as const;
export type Source = (typeof SOURCES)[number]["key"];
export const SOURCE_KEYS = SOURCES.map((s) => s.key) as Source[];

export const LOST_REASONS = [
  { key: "price", label: "Price" },
  { key: "timing", label: "Timing / schedule" },
  { key: "went_other", label: "Went with someone else" },
  { key: "no_decision", label: "Never decided" },
  { key: "cancelled", label: "Project cancelled" },
  { key: "not_a_fit", label: "Not our work" },
  { key: "other", label: "Other" },
] as const;
export type LostReason = (typeof LOST_REASONS)[number]["key"];

export type Contact = {
  name: string;
  company?: string;
  phone?: string;
  email?: string;
};

export type Opportunity = {
  id: string;
  number: string;
  title: string;
  stage: Stage;
  kind: OpportunityKind;
  source: Source;
  contact: Contact;
  address: string;
  clientId: string | null;
  jobId: string | null;
  /** Our best guess of the job's size, in cents, until an estimate prices it. */
  valueCents: number;
  /** Set by hand; null means the stage's own number. */
  probability: number | null;
  owner: string;
  nextStep: string;
  nextStepOn: string | null;
  bidDue: string | null;
  lostReason: string;
  notes: string;
  tags: string[];
  /** Where it came from outside the app (a call-list phone, a bid invite), so it is never tracked twice. */
  externalRef: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  stageAt: string;
  closedAt: string | null;
};

export const EVENT_KINDS = [
  "created",
  "stage",
  "note",
  "call",
  "text",
  "email",
  "visit",
  "estimate",
  "issued",
  "viewed",
  "accepted",
  "signed",
  "emailed",
  "job",
  "field",
] as const;
export type SalesEventKind = (typeof EVENT_KINDS)[number];

export type SalesEvent = {
  id: number;
  opportunityId: string;
  kind: SalesEventKind;
  at: string;
  actor: string;
  text: string;
  detail: Record<string, unknown>;
};

// ---- the estimate -----------------------------------------------------------

/**
 * What a line costs us, by where the money goes. The kind decides which
 * markup rules apply: a sub's price gets the GC markup first, an allowance
 * carries no contingency (the pipeline's rollup rule 6).
 */
export const ITEM_KINDS = [
  { key: "installed", label: "Installed (material + labor)", short: "Installed" },
  { key: "material", label: "Material", short: "Material" },
  { key: "labor", label: "Labor", short: "Labor" },
  { key: "sub", label: "Subcontractor", short: "Sub" },
  { key: "equipment", label: "Equipment / rental", short: "Equip." },
  { key: "allowance", label: "Allowance", short: "Allowance" },
  { key: "other", label: "Other cost", short: "Other" },
] as const;
export type ItemKind = (typeof ITEM_KINDS)[number]["key"];
export const ITEM_KIND_KEYS = ITEM_KINDS.map((k) => k.key) as ItemKind[];

export const UNITS = ["EA", "LF", "SF", "SY", "CY", "HR", "DAY", "WK", "LS", "SHEET", "BOX", "ROLL", "GAL", "TON"] as const;

export type EstimateItem = {
  id: string;
  description: string;
  /** Shown to the client under the line when the layout shows lines. */
  note?: string;
  /** Internal only: where the number came from, what was assumed. Never shown to a client. */
  memo?: string;
  kind: ItemKind;
  qty: number;
  unit: string;
  /** Dollars per unit of material, before waste. */
  mat: number;
  /** Percent added to material for waste and cuts. */
  wastePct: number;
  /** Labor hours per unit; when above 0 it prices labor at the rate, and `lab` is ignored. */
  hrs: number;
  /** Labor dollars per unit, for when hours are not known (a piece rate). */
  lab: number;
  /** Dollars per unit for a sub, equipment, an allowance or another cost. */
  cost: number;
  /** A different loaded labor rate for this line (null = the estimate's rate). */
  rate?: number | null;
  /** Which packages carry this line (empty = every package). */
  packages?: string[];
  /** An add-on the client may choose; it is not in any package's base price. */
  optional?: boolean;
  /** The day the unit price was last confirmed (YYYY-MM-DD). */
  priceDate?: string | null;
  /** Catalog entry, quote number, or "manual". */
  source?: string;
};

export type EstimateSection = {
  id: string;
  name: string;
  /** Shown to the client with the section. */
  note?: string;
  items: EstimateItem[];
};

export type EstimatePackage = {
  id: string;
  name: string;
  tagline?: string;
  /** Short lines shown on the package card. */
  highlights?: string[];
  recommended?: boolean;
};

export type Pricing = {
  /** Loaded labor rate, $/hr (RATE_CARD.md: fully burdened, never add burden on top). */
  laborRate: number;
  contingencyPct: number;
  overheadPct: number;
  profitPct: number;
  /** GC markup on a sub's price, added before contingency, overhead and profit. */
  subMarkupPct: number;
  /** Sales/use tax on material, when we buy taxable. 0 when the prime's 5005 covers it. */
  materialTaxPct: number;
  /**
   * The markup we must recover, when the face shows less (PREFERENCES "Margin
   * Strategy"). Null = the same as shown. The difference goes into material
   * and labor as a hidden uplift; it is never shown to a client.
   */
  targetOverheadPct?: number | null;
  targetProfitPct?: number | null;
  /** Round each total the client sees up to this many dollars (0 = to the cent). */
  roundTo: number;
  /** Below this gross margin the checks warn. */
  marginFloorPct: number;
};

export const PRESENT_LAYOUTS = [
  { key: "total", label: "One price", hint: "Scope in words, one number" },
  { key: "sections", label: "By section", hint: "Each scope with its price" },
  { key: "itemized", label: "Itemized", hint: "Every line with its price" },
] as const;
export type PresentLayout = (typeof PRESENT_LAYOUTS)[number]["key"];

/** How overhead and profit reach the client: inside each price, or as their own line. */
export const MARKUP_DISPLAYS = [
  { key: "included", label: "Inside the prices", hint: "Each price already carries overhead and profit" },
  { key: "line", label: "As its own line", hint: "Prices before overhead and profit, then one line for them" },
] as const;
export type MarkupDisplay = (typeof MARKUP_DISPLAYS)[number]["key"];

/** What an allowance shows as. Its markup is in the price either way; this decides where the client sees it. */
export const ALLOWANCE_DISPLAYS = [
  { key: "value", label: "At its value", hint: "The allowance includes our overhead and profit" },
  { key: "budget_spread", label: "At budget", hint: "The allowance is the budget; its markup rides in the other prices" },
  { key: "budget_line", label: "At budget, markup listed", hint: "The budget, then a line for overhead and profit on allowances" },
] as const;
export type AllowanceDisplay = (typeof ALLOWANCE_DISPLAYS)[number]["key"];

/** Who signs a proposal on its link. */
export const SIGNING_MODES = [
  { key: "none", label: "No signature", hint: "The client accepts with their typed name" },
  { key: "client", label: "Client signs", hint: "The client signs to accept" },
  { key: "both", label: "Client and Saddlewood sign", hint: "The client signs, then we countersign; both get the signed copy" },
] as const;
export type SigningMode = (typeof SIGNING_MODES)[number]["key"];

export type Presentation = {
  layout: PresentLayout;
  markupDisplay: MarkupDisplay;
  allowanceDisplay: AllowanceDisplay;
  /** Show each allowance's dollar value (off: the allowance is named, its value is inside the price). */
  showAllowanceAmounts: boolean;
  signing: SigningMode;
  /** Show the packages side by side and let the client choose one. */
  showPackages: boolean;
  /** Which packages go out (empty = all). */
  packageIds: string[];
  showOptions: boolean;
  showQuantities: boolean;
  showUnitPrices: boolean;
  showSectionNotes: boolean;
  showSchedule: boolean;
  showExclusions: boolean;
  showTimeline: boolean;
  allowAccept: boolean;
};

export type PaymentStep = { id: string; label: string; pct: number };

export type Manifest = {
  /** Where the quantities came from. "plans" asks for the set and its date. */
  basis: "plans" | "site_walk" | "client_scope" | "pipeline";
  drawingSet?: string;
  drawingDate?: string | null;
  /** ASIs, addenda, answered RFIs after that set, one per line. */
  addenda?: string;
  /** Someone checked for an estimate or proposal already sent on this job. */
  priorChecked?: boolean;
};

export type EstimateBody = {
  v: 1;
  /** What kind of estimate it started as (templates.ts); changes nothing in the math. */
  template: string;
  title: string;
  intro: string;
  sections: EstimateSection[];
  packages: EstimatePackage[];
  pricing: Pricing;
  present: Presentation;
  schedule: PaymentStep[];
  exclusions: string[];
  clarifications: string[];
  terms: string;
  validDays: number;
  /** e.g. "6–8 weeks once permits are in hand". */
  timeline: string;
  /** Square feet the price is for, to show $/SF. */
  area?: number | null;
  manifest: Manifest;
};

export type SalesEstimate = {
  id: string;
  opportunityId: string;
  version: number;
  name: string;
  status: "draft" | "issued" | "archived";
  body: EstimateBody;
  sellCents: number;
  costCents: number;
  documentId: string | null;
  sourceEstimateId: string | null;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
};

/** A proposal the client was sent (a documents row of kind estimate), with how it stands. */
export type IssuedProposal = {
  documentId: string;
  estimateId: string | null;
  number: string;
  revision: number;
  totalCents: number;
  issuedAt: string;
  status: "issued" | "void";
  token: string;
  views: number;
  lastViewedAt: string | null;
  accepted: { at: string; name: string; packageName: string; totalCents: number } | null;
  /** Who has signed, oldest first. */
  signatures: { role: "client" | "company"; name: string; at: string; method: "draw" | "type" }[];
  /** The signing the proposal asks for (from its frozen snapshot). */
  signing: SigningMode;
  /** Every signature the proposal asks for is on it. */
  executed: boolean;
};
