// Company policies: the decisions that run a job after it is won, each with
// the recommended value, why, what the company's own documents said, and where
// the app uses it. Owners change them in the app (/app/policies); they are
// stored in app_settings (0023) under "policy.*" keys, beside the field
// settings. Pure and client-safe: the screen, the server and the tests share it.
//
// Recommendations written 2026-10-19 from the lifecycle review (SOPs 001-009,
// the app spec, the PM plan, the operating model). Legal points are for
// counsel to confirm, as SOP-007 already says.

export type PolicyControl =
  | { type: "toggle" }
  | { type: "money" }
  | { type: "percent"; max: number; step?: number }
  | { type: "days"; max: number }
  | { type: "years"; max: number }
  | { type: "choice"; options: { value: string; label: string }[] };

export type PolicyDef = {
  key: string;
  label: string;
  /** Shown only while another policy has this value (the cancellation fee means nothing for a non-refundable deposit). */
  showIf?: { key: string; equals: boolean | number | string };
  /** The value we recommend; also the default until an owner changes it. */
  recommended: boolean | number | string;
  control: PolicyControl;
  hint?: string;
};

export type DecisionDef = {
  id: string;
  title: string;
  /** The question, as Marco would be asked it. */
  question: string;
  /** The recommendation in one line, then why. */
  recommendation: string;
  why: string;
  /** Where the documents disagreed (or the value was open). */
  sources: string;
  /** What uses it in the app today; empty when nothing does yet. */
  liveIn: string;
  /** What will use it once built. */
  laterIn: string;
  policies: PolicyDef[];
};

const yesNo = { type: "toggle" } as const;

export const DECISIONS: DecisionDef[] = [
  {
    id: "contract",
    title: "When a signed proposal is the contract",
    question: "Is the signed proposal enough, or does the job need a separate written agreement?",
    recommendation: "Yes under $10,000. Above it, the Award step generates the full agreement for signature.",
    why: "SOP-007 already requires the full agreement only over $10,000. The signed proposal carries the scope, price, exclusions, terms and an e-signature record tied to the exact proposal. On GC jobs their subcontract governs either way. Counsel should confirm the proposal's terms cover Arizona's residential contract content (ARS 32-1158).",
    sources: "SOP-007 §1 (full agreement over $10,000); app spec §6 (acceptance creates a contract draft).",
    liveIn: "",
    laterIn: "The Award step (L1–L2) reads both to decide whether to generate the agreement.",
    policies: [
      { key: "policy.contract.proposalIsContract", label: "A signed proposal is the contract on smaller jobs", recommended: true, control: yesNo },
      { key: "policy.contract.agreementOverCents", label: "Full written agreement above", recommended: 1_000_000, control: { type: "money" } },
    ],
  },
  {
    id: "ladder",
    title: "Payment reminders",
    question: "Do the first collection steps send themselves, or does an owner tap each one?",
    recommendation: "Automatic for the three friendly reminders. Everything after stays a person's call.",
    why: "The friendly reminders (resend when not opened in 2 business days, 3 days before due, 1 day after) are low risk and easy to forget; Lando chose automatic on 10/05. Ilene's call at +7, Marco's call and the 5-day notice at +14, suspension and lien steps need judgment. Legal notices are never automatic, whatever this says.",
    sources: "SOP-007 §5 and the app spec say automatic; the billing plan (10/12) and operating model say an owner taps each.",
    liveIn: "",
    laterIn: "The reminder sender, built with billing from the app (L5). Until then every step shows on Money as a tap.",
    policies: [
      {
        key: "policy.ladder.reminders",
        label: "Friendly reminders",
        recommended: "auto",
        control: {
          type: "choice",
          options: [
            { value: "auto", label: "Send automatically" },
            { value: "ask", label: "Ask an owner first" },
            { value: "off", label: "Off" },
          ],
        },
      },
    ],
  },
  {
    id: "late",
    title: "Late interest",
    question: "When does late interest start, and at what rate?",
    recommendation: "1.5% a month, starting 10 days after the due date.",
    why: "It matches SOP-007, gives the client a grace period after the bill is actually due, and is the easier reading to defend.",
    sources: "SOP-007 §1 (10 days after the due date) vs bot/contract.py (10 days from the invoice date); app spec decision #1.",
    liveIn: "The default proposal terms (Sales), and the Mac's contract generator (bot/contract.py).",
    laterIn: "Past-due statements once billing runs from the app.",
    policies: [
      {
        key: "policy.late.start",
        label: "Counted from",
        recommended: "due_date",
        control: {
          type: "choice",
          options: [
            { value: "due_date", label: "The due date" },
            { value: "invoice_date", label: "The invoice date" },
          ],
        },
      },
      { key: "policy.late.graceDays", label: "Grace period", recommended: 10, control: { type: "days", max: 60 } },
      { key: "policy.late.ratePct", label: "Rate per month", recommended: 1.5, control: { type: "percent", max: 5, step: 0.1 } },
    ],
  },
  {
    id: "extras",
    title: "Change orders and small extras",
    question: "Where does a change order start, and are small extras billed or only logged?",
    recommendation: "A signed change order from $1,000. Under that, log it and bill it on the next invoice.",
    why: "SOP-002 is approved and says to bill them; logging without billing gives the work away, and small extras add up over a job. The 20% markup and 50% at signing from $5,000 are SOP-007's values.",
    sources: "SOP-002 (approved: bill on the next invoice) vs the PM charter and plan (documented only); SOP-007 §1 (20% OH&P, 50% at signing from $5,000).",
    liveIn: "The default proposal terms (markup) and the Mac's contract generator (markup, the $1,000 and $5,000 lines, how small extras are handled).",
    laterIn: "Change orders from the field (L4).",
    policies: [
      { key: "policy.extras.coFromCents", label: "Signed change order from", recommended: 100_000, control: { type: "money" } },
      {
        key: "policy.extras.under",
        label: "Extras under that",
        recommended: "bill_next",
        control: {
          type: "choice",
          options: [
            { value: "bill_next", label: "Log and bill on the next invoice" },
            { value: "log_only", label: "Log only" },
          ],
        },
      },
      { key: "policy.extras.markupPct", label: "Change-order markup (overhead and profit)", recommended: 20, control: { type: "percent", max: 50 } },
      { key: "policy.extras.halfAtSigningFromCents", label: "Half due at signing from", recommended: 500_000, control: { type: "money" } },
    ],
  },
  {
    id: "purchases",
    title: "Purchase approvals",
    question: "Who approves a purchase, and up to what amount?",
    recommendation: "Keep the limits set on 10/19: the PM approves up to $500; above that an owner; above $1,000 both owners are told.",
    why: "$500 matches SOP-001's rule that bigger orders are checked against the plans, and these limits already run material requests. The older documents' tiers ($500 to Marco, or Lando to $5,000) were written before the app routed requests.",
    sources: "PM charter (Marco over $500) vs operating model (Lando $500–5,000, Marco over); Lando 10/19 kept $500 / $1,000, editable.",
    liveIn: "Material requests: who approves, and when both owners are told.",
    laterIn: "Purchase orders and sub awards.",
    policies: [
      { key: "requests.pmLimitCents", label: "Project manager approves up to", recommended: 50_000, control: { type: "money" } },
      { key: "requests.ownerLimitCents", label: "Both owners are told above", recommended: 100_000, control: { type: "money" } },
    ],
  },
  {
    id: "report",
    title: "The daily report deadline",
    question: "Is the daily report due by 5 pm or 6 PM?",
    recommendation: "6:00 PM, and change SOP-006's 5 pm to match.",
    why: "6 PM is what the crew already does and what the app already checks. One deadline is easier to keep than two.",
    sources: "SOP-006 (daily log by 5 pm) vs the app's nightly plan (by 6 PM).",
    liveIn: "Waiting on you and the 7 AM push flag a late plan from it; the Crew tab's on-time record counts against it.",
    laterIn: "",
    policies: [{ key: "crew.planDue", label: "The plan is due by", recommended: "18:00", control: { type: "choice", options: ["16:00", "16:30", "17:00", "17:30", "18:00", "18:30", "19:00", "20:00"].map((v) => ({ value: v, label: clockLabel(v) })) } }],
  },
  {
    id: "deposit",
    title: "Deposit",
    question: "How much is the deposit, and is it refundable if the client cancels?",
    recommendation: "10% at signing, plus all special-order materials before ordering; refunded on cancellation less costs incurred and 10%.",
    why: "SOP-007's own cancellation term. A non-refundable deposit is harder to defend if a homeowner cancels early, and the costs-plus-10% term already covers our exposure. Counsel to confirm with the residential template.",
    sources: "SOP-007 §1 (cancellation: costs plus 10%) vs bot/contract.py (deposit non-refundable).",
    liveIn: "The default proposal terms (Sales), and the Mac's contract generator (bot/contract.py).",
    laterIn: "The deposit invoice the Award step drafts (L2).",
    policies: [
      { key: "policy.deposit.pct", label: "Deposit at signing", recommended: 10, control: { type: "percent", max: 100 } },
      { key: "policy.deposit.specialOrders", label: "Special-order materials paid in full before ordering", recommended: true, control: yesNo },
      {
        key: "policy.deposit.refund",
        label: "If the client cancels",
        recommended: "costs_plus",
        control: {
          type: "choice",
          options: [
            { value: "costs_plus", label: "Refund less costs and a fee" },
            { value: "non_refundable", label: "Deposit is not refundable" },
          ],
        },
      },
      { key: "policy.deposit.cancelPct", label: "Cancellation fee", recommended: 10, control: { type: "percent", max: 50 }, hint: "Of the contract, on top of costs incurred.", showIf: { key: "policy.deposit.refund", equals: "costs_plus" } },
    ],
  },
  {
    id: "subwarranty",
    title: "Sub warranty",
    question: "How long must a sub warrant their work?",
    recommendation: "2 years, and never shorter than what we give the client.",
    why: "We give the client 2 years of workmanship. A 1-year sub warranty leaves the second year on us.",
    sources: "SOP-008 §2 (the sub MSA: 2 years, never shorter than the client's). Separate question: bot/contract.py gives Saddlewood's own warranty as 1 year on commercial and sub agreements, where SOP-007 says 2.",
    liveIn: "",
    laterIn: "Sub work orders.",
    policies: [
      { key: "policy.subs.warrantyYears", label: "Sub warranty", recommended: 2, control: { type: "years", max: 10 } },
      { key: "policy.subs.matchClient", label: "Never shorter than the client's warranty", recommended: true, control: yesNo },
    ],
  },
  {
    id: "pmcost",
    title: "What the project manager sees",
    question: "Does the PM see labor cost and margin?",
    recommendation: "Not yet. He sees hours against budget and material spend, not labor dollars or margin.",
    why: "Keeps the 10/13 decision. Hours and material are what he controls day to day; revisit when the bonus plan (and its X%) is set.",
    sources: "Decision C, 10/13 (no cost, margin or pay rates for the PM).",
    liveIn: "",
    laterIn: "Budget against actuals (L3).",
    policies: [
      { key: "policy.pm.laborCost", label: "PM sees labor dollars", recommended: false, control: yesNo },
      { key: "policy.pm.margin", label: "PM sees margin", recommended: false, control: yesNo },
    ],
  },
];

export function clockLabel(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const hr = ((h + 11) % 12) + 1;
  return `${hr}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

export const POLICY_DEFS: PolicyDef[] = DECISIONS.flatMap((d) => d.policies);

/** The keys this module stores itself; the rest (requests.*, crew.*) are field settings (src/lib/crew/settingsRules.ts). */
export const OWN_KEYS = POLICY_DEFS.map((p) => p.key).filter((k) => k.startsWith("policy."));

export type Policies = Record<string, boolean | number | string>;

export const POLICY_DEFAULTS: Policies = Object.fromEntries(POLICY_DEFS.map((p) => [p.key, p.recommended]));

export function policyDef(key: string): PolicyDef | undefined {
  return POLICY_DEFS.find((p) => p.key === key);
}

/** A value as its control allows it, or null when it is not one. */
export function parsePolicyValue(key: string, value: unknown): boolean | number | string | null {
  const def = policyDef(key);
  if (!def) return null;
  const c = def.control;
  switch (c.type) {
    case "toggle":
      return typeof value === "boolean" ? value : null;
    case "money":
      return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 100_000_000 ? value : null;
    case "percent":
      return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= c.max ? Math.round(value * 100) / 100 : null;
    case "days":
    case "years":
      return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= c.max ? value : null;
    case "choice":
      return typeof value === "string" && c.options.some((o) => o.value === value) ? value : null;
  }
}

/** Every policy, with the recommended value where none is stored or the stored one does not fit. */
export function readPolicies(stored: Record<string, unknown>): Policies {
  const out: Policies = { ...POLICY_DEFAULTS };
  for (const [k, v] of Object.entries(stored)) {
    const p = parsePolicyValue(k, v);
    if (p !== null) out[k] = p;
  }
  return out;
}

function money(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function pct(n: number): string {
  return String(Math.round(n * 100) / 100);
}

/**
 * Fill the policy markers in a terms text, so the default proposal terms say
 * what the policies say. Markers an owner removed are simply not there; an
 * unknown marker is left as it is.
 *
 *   {deposit_pct} {special_orders} {late_grace} {late_from} {late_rate}
 *   {co_markup} {cancellation}
 */
export function fillTerms(text: string, p: Policies): string {
  const v: Record<string, string> = {
    deposit_pct: pct(Number(p["policy.deposit.pct"])),
    special_orders: p["policy.deposit.specialOrders"] ? ", plus 100% of any special-order materials before they are ordered" : "",
    late_grace: String(p["policy.late.graceDays"]),
    late_from: p["policy.late.start"] === "invoice_date" ? "invoice date" : "due date",
    late_rate: pct(Number(p["policy.late.ratePct"])),
    co_markup: pct(Number(p["policy.extras.markupPct"])),
    cancellation:
      p["policy.deposit.refund"] === "non_refundable"
        ? "The deposit is not refundable once the work is scheduled."
        : `If the client cancels after signing, the deposit is refunded less costs incurred and ${pct(Number(p["policy.deposit.cancelPct"]))}% of the contract.`,
  };
  return text.replace(/\{(deposit_pct|special_orders|late_grace|late_from|late_rate|co_markup|cancellation)\}/g, (_, k: string) => v[k]);
}

/** Money as the screen shows it. */
export const policyMoney = money;
