import { z } from "zod";

import { fillTerms, POLICY_DEFAULTS, type Policies } from "@/lib/policies/rules";
import { DEFAULT_PRESENT, DEFAULT_PRICING, DEFAULT_TERMS, type EstimateDefaults } from "./templates";
import { ALLOWANCE_DISPLAYS, MARKUP_DISPLAYS, PRESENT_LAYOUTS, SIGNING_MODES, type Presentation, type Pricing } from "./types";

// The company's own choices for Sales, in one place an owner edits in the app
// (Sales > Settings), instead of in code. Every new estimate starts from
// these; each estimate can still change any of them for itself. Kept in
// sales_settings (0025) under the key "company".
//
// The defaults below are the decisions as they stood on 2026-10-19: SOP-007's
// short-form terms, the pipeline's 5/15/10 markups, allowances shown at their
// value, both sides sign, and proposal mail from info@.

export const SIGNATURE_FONTS = [
  { key: "dancing", label: "Dancing Script" },
  { key: "greatvibes", label: "Great Vibes" },
  { key: "allura", label: "Allura" },
  { key: "sacramento", label: "Sacramento" },
  { key: "pinyon", label: "Pinyon Script" },
  { key: "homemade", label: "Homemade Apple" },
  { key: "caveat", label: "Caveat" },
  { key: "delafield", label: "Mrs Saint Delafield" },
] as const;
export type SignatureFont = (typeof SIGNATURE_FONTS)[number]["key"];
export const SIGNATURE_FONT_KEYS = SIGNATURE_FONTS.map((f) => f.key) as SignatureFont[];

/** Who may act for the company: the owners only, or the owners and anyone with the Sales send switch. */
export type CompanyActors = "owners" | "owners_and_sales";

/**
 * Who a proposal can be emailed to. Owner decision 2026-10-19 (Lando): a
 * proposal someone deliberately sends goes to the addresses the client gave,
 * with no allowlist step; the allowlist is for the bot's automated replies.
 *
 *   addressed  any address the sender puts on it (the preview names the ones
 *              not on the allowlist); signing notices go to those addresses and
 *              to the email the client typed when signing
 *   allowlist  only company addresses and the owner's outbound allowlist
 */
export const RECIPIENT_RULES = [
  { key: "addressed", label: "Anyone you address", hint: "Whoever you put on it, after the preview. The client's signed copy goes to them too." },
  { key: "allowlist", label: "The owner's allowlist only", hint: "Outside addresses must be added on the Mac first (outbound_allow.py)." },
] as const;
export type RecipientRule = (typeof RECIPIENT_RULES)[number]["key"];

export type SalesSettings = {
  pricing: Pricing;
  proposal: {
    terms: string;
    validDays: number;
    present: Presentation;
    /** Payment steps a new residential estimate starts with. */
    schedule: { label: string; pct: number }[];
    /** Offered as one-tap additions in the builder. */
    exclusions: string[];
    clarifications: string[];
  };
  signing: {
    /** Who may countersign for Saddlewood. */
    companySigners: CompanyActors;
    /** Printed under the company's signature. */
    companyTitle: string;
    /** What the signer agrees to, shown above the signature and kept with it. */
    consentText: string;
    /** The typed-signature styles offered. */
    fonts: SignatureFont[];
  };
  email: {
    /** Display name and address proposal mail comes from (an @saddlewoodcontracting.com address). */
    fromName: string;
    fromAddress: string;
    replyTo: string;
    /** {title}, {number}, {company}, {first} are filled in. */
    subject: string;
    /** As above, plus {link}: where the button goes (left out when only the PDF is sent). */
    body: string;
    defaultLink: boolean;
    defaultAttachPdf: boolean;
    whoMaySend: CompanyActors;
    /** Who a proposal and its signing notices can go to. */
    recipients: RecipientRule;
    notify: {
      /** Email the sales lane when the client signs or accepts. */
      companyOnClientSign: boolean;
      /** Email the client a copy of what they signed, right away. */
      clientCopyOnSign: boolean;
      /** When every signature is on it, email the client the signed copy. */
      clientOnExecuted: boolean;
      /** ... and the company. */
      companyOnExecuted: boolean;
      /** Attach the signed PDF to those notices. */
      attachPdf: boolean;
      /** Company addresses copied on every notice. */
      internalCc: string[];
    };
  };
  updatedAt?: string;
  updatedBy?: string;
};

export const DEFAULT_CONSENT =
  "By signing, I agree to this proposal, its terms and the price shown, and I agree that this electronic signature is as binding as a handwritten one.";

export const DEFAULT_SETTINGS: SalesSettings = {
  pricing: { ...DEFAULT_PRICING },
  proposal: {
    terms: DEFAULT_TERMS,
    validDays: 30,
    present: { ...DEFAULT_PRESENT },
    schedule: [
      { label: "Deposit at signing", pct: 10 },
      { label: "Rough-in complete (framing, rough MEP inspected)", pct: 40 },
      { label: "Drywall and finishes complete", pct: 40 },
      { label: "Final walkthrough and punch", pct: 10 },
    ],
    exclusions: [],
    clarifications: [],
  },
  signing: {
    companySigners: "owners",
    companyTitle: "Saddlewood Contracting",
    consentText: DEFAULT_CONSENT,
    fonts: [...SIGNATURE_FONT_KEYS],
  },
  email: {
    fromName: "Saddlewood Contracting",
    fromAddress: "info@saddlewoodcontracting.com",
    replyTo: "info@saddlewoodcontracting.com",
    subject: "Proposal: {title}",
    body: "Hi {first},\n\nThank you for the opportunity. Your proposal for {title} is ready. You can choose options, accept and sign right on the page.\n\n{link}\n\nCall or reply with any questions.\n\nSaddlewood Contracting",
    defaultLink: true,
    defaultAttachPdf: false,
    whoMaySend: "owners",
    recipients: "addressed",
    notify: {
      companyOnClientSign: true,
      clientCopyOnSign: true,
      clientOnExecuted: true,
      companyOnExecuted: true,
      attachPdf: true,
      internalCc: [],
    },
  },
};

export const COMPANY_DOMAIN = "@saddlewoodcontracting.com";

// ---- reading what is stored (lenient: anything missing or bad is the default) ----

const pct = (d: number) => z.coerce.number().min(0).max(100).catch(d);
const bool = (d: boolean) => z.boolean().catch(d);
const text = (max: number, d: string) => z.string().max(max).catch(d);
const companyAddress = (d: string) =>
  z
    .string()
    .trim()
    .toLowerCase()
    .refine((s) => /^[^\s@<>,;"]+@saddlewoodcontracting\.com$/.test(s))
    .catch(d);

function schema(d: SalesSettings) {
  const p = d.pricing;
  const pr = d.proposal.present;
  return z.object({
    pricing: z
      .object({
        laborRate: z.coerce.number().min(0).max(500).catch(p.laborRate),
        contingencyPct: pct(p.contingencyPct),
        overheadPct: pct(p.overheadPct),
        profitPct: pct(p.profitPct),
        subMarkupPct: pct(p.subMarkupPct),
        materialTaxPct: z.coerce.number().min(0).max(20).catch(p.materialTaxPct),
        targetOverheadPct: z.coerce.number().min(0).max(100).nullable().catch(null),
        targetProfitPct: z.coerce.number().min(0).max(100).nullable().catch(null),
        roundTo: z.coerce.number().min(0).max(10000).catch(p.roundTo),
        marginFloorPct: z.coerce.number().min(0).max(90).catch(p.marginFloorPct),
      })
      .catch({ ...p, targetOverheadPct: p.targetOverheadPct ?? null, targetProfitPct: p.targetProfitPct ?? null }),
    proposal: z
      .object({
        terms: text(8000, d.proposal.terms),
        validDays: z.coerce.number().int().min(1).max(365).catch(d.proposal.validDays),
        present: z
          .object({
            layout: z.enum(PRESENT_LAYOUTS.map((l) => l.key) as [string, ...string[]]).catch(pr.layout),
            markupDisplay: z.enum(MARKUP_DISPLAYS.map((l) => l.key) as [string, ...string[]]).catch(pr.markupDisplay),
            allowanceDisplay: z.enum(ALLOWANCE_DISPLAYS.map((l) => l.key) as [string, ...string[]]).catch(pr.allowanceDisplay),
            showAllowanceAmounts: bool(pr.showAllowanceAmounts),
            signing: z.enum(SIGNING_MODES.map((l) => l.key) as [string, ...string[]]).catch(pr.signing),
            showPackages: bool(pr.showPackages),
            packageIds: z.array(z.string()).max(0).catch([]),
            showOptions: bool(pr.showOptions),
            showQuantities: bool(pr.showQuantities),
            showUnitPrices: bool(pr.showUnitPrices),
            showSectionNotes: bool(pr.showSectionNotes),
            showSchedule: bool(pr.showSchedule),
            showExclusions: bool(pr.showExclusions),
            showTimeline: bool(pr.showTimeline),
            allowAccept: bool(pr.allowAccept),
          })
          .catch(pr),
        schedule: z
          .array(z.object({ label: z.string().max(160), pct: z.coerce.number().min(0).max(100) }))
          .max(12)
          .catch(d.proposal.schedule),
        exclusions: z.array(z.string().max(400)).max(60).catch(d.proposal.exclusions),
        clarifications: z.array(z.string().max(400)).max(60).catch(d.proposal.clarifications),
      })
      .catch(d.proposal),
    signing: z
      .object({
        companySigners: z.enum(["owners", "owners_and_sales"]).catch(d.signing.companySigners),
        companyTitle: text(120, d.signing.companyTitle),
        consentText: z.string().min(20).max(1000).catch(d.signing.consentText),
        fonts: z
          .array(z.enum(SIGNATURE_FONT_KEYS as [string, ...string[]]))
          .min(1)
          .catch(d.signing.fonts),
      })
      .catch(d.signing),
    email: z
      .object({
        fromName: z.string().trim().min(1).max(80).refine((s) => !/[<>"\r\n]/.test(s)).catch(d.email.fromName),
        fromAddress: companyAddress(d.email.fromAddress),
        replyTo: companyAddress(d.email.replyTo),
        subject: z.string().trim().min(1).max(200).catch(d.email.subject),
        body: z.string().trim().min(1).max(5000).catch(d.email.body),
        defaultLink: bool(d.email.defaultLink),
        defaultAttachPdf: bool(d.email.defaultAttachPdf),
        whoMaySend: z.enum(["owners", "owners_and_sales"]).catch(d.email.whoMaySend),
        recipients: z.enum(RECIPIENT_RULES.map((r) => r.key) as [RecipientRule, ...RecipientRule[]]).catch(d.email.recipients),
        notify: z
          .object({
            companyOnClientSign: bool(d.email.notify.companyOnClientSign),
            clientCopyOnSign: bool(d.email.notify.clientCopyOnSign),
            clientOnExecuted: bool(d.email.notify.clientOnExecuted),
            companyOnExecuted: bool(d.email.notify.companyOnExecuted),
            attachPdf: bool(d.email.notify.attachPdf),
            internalCc: z
              .array(companyAddress(""))
              .max(10)
              .transform((l) => l.filter(Boolean))
              .catch(d.email.notify.internalCc),
          })
          .catch(d.email.notify),
      })
      .catch(d.email),
    updatedAt: z.string().optional().catch(undefined),
    updatedBy: z.string().optional().catch(undefined),
  });
}

/** Stored settings, with anything missing or out of range replaced by the default. Never throws. */
export function readSettings(raw: unknown): SalesSettings {
  const r = schema(DEFAULT_SETTINGS).safeParse(raw && typeof raw === "object" ? raw : {});
  if (!r.success) return structuredClone(DEFAULT_SETTINGS);
  const s = r.data as SalesSettings;
  // At least one way to send must stay on.
  if (!s.email.defaultLink && !s.email.defaultAttachPdf) s.email.defaultLink = true;
  return s;
}

/** What a new estimate starts from; the terms' policy markers filled from Company policies. */
export function estimateDefaults(s: SalesSettings, policies: Policies = POLICY_DEFAULTS): EstimateDefaults {
  return {
    pricing: { ...s.pricing },
    present: { ...s.proposal.present, packageIds: [] },
    terms: fillTerms(s.proposal.terms, policies),
    validDays: s.proposal.validDays,
    schedule: s.proposal.schedule,
  };
}

/** Fill {title}, {number}, {company}, {first} in a mail template. {link} is left for the mail builder. */
export function fillTemplate(t: string, v: { title: string; number: string; company: string; first: string }): string {
  return t
    .replace(/\{title\}/g, v.title)
    .replace(/\{number\}/g, v.number)
    .replace(/\{company\}/g, v.company)
    .replace(/\{first\}/g, v.first || "there");
}
