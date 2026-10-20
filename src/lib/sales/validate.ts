import { z } from "zod";

import { DEFAULT_PRESENT, DEFAULT_PRICING, DEFAULT_TERMS } from "./templates";
import { ALLOWANCE_DISPLAYS, ITEM_KIND_KEYS, KIND_KEYS, MARKUP_DISPLAYS, PRESENT_LAYOUTS, SIGNING_MODES, SOURCE_KEYS, STAGE_KEYS, type EstimateBody } from "./types";

// What the builder sends is checked here before it is saved: every number a
// finite number in range, every text capped, a bounded count of everything.
// Missing settings fall back to the defaults, so an estimate saved by an
// older screen still opens.

const num = (min: number, max: number, dflt = 0) => z.coerce.number().catch(dflt).pipe(z.number().min(min).max(max).catch(dflt));
const text = (max: number) => z.string().catch("").transform((s) => s.slice(0, max));
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable()
  .catch(null);
const id = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/);

const item = z.object({
  id,
  description: text(300),
  note: text(600).optional(),
  memo: text(600).optional(),
  kind: z.enum(ITEM_KIND_KEYS as [string, ...string[]]).catch("other"),
  qty: num(0, 1e7),
  unit: text(12).transform((s) => s.trim().toUpperCase() || "EA"),
  mat: num(0, 1e7),
  wastePct: num(0, 100),
  hrs: num(0, 1e4),
  lab: num(0, 1e7),
  cost: num(0, 1e8),
  rate: z.coerce.number().min(0).max(1000).nullable().optional().catch(null),
  packages: z.array(id).max(6).optional().catch([]),
  optional: z.boolean().optional().catch(false),
  priceDate: day.optional(),
  source: text(200).optional(),
});

const section = z.object({
  id,
  name: text(120),
  note: text(600).optional(),
  items: z.array(item).max(400),
});

const pkg = z.object({
  id,
  name: text(40),
  tagline: text(120).optional(),
  highlights: z.array(text(120)).max(8).optional().catch([]),
  recommended: z.boolean().optional().catch(false),
});

const pricing = z.object({
  laborRate: num(0, 500, DEFAULT_PRICING.laborRate),
  contingencyPct: num(0, 100, DEFAULT_PRICING.contingencyPct),
  overheadPct: num(0, 100, DEFAULT_PRICING.overheadPct),
  profitPct: num(0, 100, DEFAULT_PRICING.profitPct),
  subMarkupPct: num(0, 100, DEFAULT_PRICING.subMarkupPct),
  materialTaxPct: num(0, 20, 0),
  targetOverheadPct: z.coerce.number().min(0).max(100).nullable().optional().catch(null),
  targetProfitPct: z.coerce.number().min(0).max(100).nullable().optional().catch(null),
  roundTo: num(0, 10000, 0),
  marginFloorPct: num(0, 90, DEFAULT_PRICING.marginFloorPct),
});

const bool = (d: boolean) => z.boolean().catch(d);
const present = z.object({
  layout: z.enum(PRESENT_LAYOUTS.map((l) => l.key) as [string, ...string[]]).catch("sections"),
  // Added 2026-10-19; an estimate saved before then reads as the old behavior.
  markupDisplay: z.enum(MARKUP_DISPLAYS.map((l) => l.key) as [string, ...string[]]).catch(DEFAULT_PRESENT.markupDisplay),
  allowanceDisplay: z.enum(ALLOWANCE_DISPLAYS.map((l) => l.key) as [string, ...string[]]).catch(DEFAULT_PRESENT.allowanceDisplay),
  showAllowanceAmounts: bool(DEFAULT_PRESENT.showAllowanceAmounts),
  signing: z.enum(SIGNING_MODES.map((l) => l.key) as [string, ...string[]]).catch(DEFAULT_PRESENT.signing),
  showPackages: bool(DEFAULT_PRESENT.showPackages),
  packageIds: z.array(id).max(6).catch([]),
  showOptions: bool(DEFAULT_PRESENT.showOptions),
  showQuantities: bool(false),
  showUnitPrices: bool(false),
  showSectionNotes: bool(true),
  showSchedule: bool(true),
  showExclusions: bool(true),
  showTimeline: bool(true),
  allowAccept: bool(true),
});

const body = z.object({
  v: z.literal(1).catch(1),
  template: text(30),
  title: text(160),
  intro: text(3000),
  sections: z.array(section).max(60),
  packages: z.array(pkg).max(4).catch([]),
  pricing: pricing.catch({ ...DEFAULT_PRICING }),
  present: present.catch({ ...DEFAULT_PRESENT }),
  schedule: z
    .array(z.object({ id, label: text(160), pct: num(0, 100) }))
    .max(12)
    .catch([]),
  exclusions: z.array(text(400)).max(40).catch([]),
  clarifications: z.array(text(400)).max(40).catch([]),
  terms: z.string().max(8000).catch(DEFAULT_TERMS),
  validDays: num(1, 365, 30),
  timeline: text(300),
  area: z.coerce.number().min(0).max(1e6).nullable().optional().catch(null),
  manifest: z
    .object({
      basis: z.enum(["plans", "site_walk", "client_scope", "pipeline"]).catch("site_walk"),
      drawingSet: text(200).optional(),
      drawingDate: day.optional(),
      addenda: text(1000).optional(),
      priorChecked: z.boolean().optional().catch(false),
    })
    .catch({ basis: "site_walk", priorChecked: false }),
});

export type Read<T> = { ok: true; value: T } | { ok: false; error: string };

export function readBody(raw: unknown): Read<EstimateBody> {
  const r = body.safeParse(raw);
  if (!r.success) {
    const first = r.error.issues[0];
    return { ok: false, error: `estimate: ${first?.path.join(".") || "body"} ${first?.message ?? "is not valid"}` };
  }
  const value = r.data as EstimateBody;
  // Ids are unique within the estimate: the builder and the line prices key on them.
  const seen = new Set<string>();
  for (const s of value.sections) {
    if (seen.has(s.id)) return { ok: false, error: `estimate: section id ${s.id} is used twice` };
    seen.add(s.id);
    for (const i of s.items) {
      if (seen.has(i.id)) return { ok: false, error: `estimate: line id ${i.id} is used twice` };
      seen.add(i.id);
    }
  }
  const pkgIds = new Set(value.packages.map((p) => p.id));
  for (const s of value.sections) for (const i of s.items) if (i.packages) i.packages = i.packages.filter((p) => pkgIds.has(p));
  value.present.packageIds = value.present.packageIds.filter((p) => pkgIds.has(p));
  return { ok: true, value };
}

// ---- opportunity input -----------------------------------------------------------

const contact = z.object({
  name: text(120).transform((s) => s.trim()),
  company: text(120).optional(),
  phone: text(40).optional(),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(200)
    .refine((s) => s === "" || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s), "is not an email address")
    .optional(),
});

export const newOpportunitySchema = z.object({
  title: z.string().trim().min(1, "needs a name").max(160),
  kind: z.enum(KIND_KEYS as [string, ...string[]]).default("remodel"),
  source: z.enum(SOURCE_KEYS as [string, ...string[]]).default("call"),
  contact: contact.default({ name: "" }),
  address: z.string().max(300).optional(),
  valueCents: z.coerce.number().int().min(0).max(1e12).optional(),
  owner: z.string().max(200).optional(),
  nextStep: z.string().max(300).optional(),
  nextStepOn: day.optional(),
  bidDue: day.optional(),
  notes: z.string().max(4000).optional(),
  stage: z.enum(STAGE_KEYS as [string, ...string[]]).optional(),
  externalRef: z.string().max(200).nullable().optional(),
  firstNote: z.string().max(4000).optional(),
});

export const opportunityPatchSchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    stage: z.enum(STAGE_KEYS as [string, ...string[]]),
    kind: z.enum(KIND_KEYS as [string, ...string[]]),
    source: z.enum(SOURCE_KEYS as [string, ...string[]]),
    contact,
    address: z.string().max(300),
    valueCents: z.coerce.number().int().min(0).max(1e12),
    probability: z.coerce.number().int().min(0).max(100).nullable(),
    owner: z.string().max(200),
    nextStep: z.string().max(300),
    nextStepOn: day,
    bidDue: day,
    lostReason: z.string().max(300),
    notes: z.string().max(4000),
    tags: z.array(z.string().max(40)).max(20),
    why: z.string().max(1000),
  })
  .partial()
  .strict();

export const eventInputSchema = z.object({
  kind: z.enum(["note", "call", "text", "email", "visit"]),
  text: z.string().trim().min(1, "write something").max(4000),
});
