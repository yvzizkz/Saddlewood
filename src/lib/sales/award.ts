import { addDays } from "@/lib/crew/time";
import type { PhaseTemplatePick } from "@/lib/crew/phases";
import type { ClientKind, ContactRole, DocumentLine, DocumentSnapshot } from "@/lib/billing/types";
import type { Policies } from "@/lib/policies/rules";
import type { ProposalSnapshot } from "./presentation";
import type { Opportunity, OpportunityKind } from "./types";

// Award: one owner step that turns an accepted proposal into the job (KB
// docs/JOB-LIFECYCLE-PLAN-2026-10-19.md §6, links L1, L2 and L8). This file is
// the plan, pure, so the numbers are tested without a database; awardStore.ts
// carries it out. Everything comes from the frozen proposal the client
// accepted and from Company policies, never from the editable estimate.

/** The SOV and award record kept on the billing job (jobs.billing). */
export type SovLine = { description: string; amountCents: number; kind: "section" | "adjustment" | "option" | "contract" };

export type AwardRecord = {
  documentId: string;
  number: string;
  revision: number;
  packageId: string;
  packageName: string;
  options: string[];
  totalCents: number;
  acceptedAt: string;
  acceptedBy: string;
  awardedAt: string;
  awardedBy: string;
  /** The deposit invoice Award drafted, when it drafted one. */
  depositId?: string | null;
};

export const WATCH_KINDS = ["agreement", "deposit", "prelim_notice", "coi_gc", "permit", "custom"] as const;
export type WatchKind = (typeof WATCH_KINDS)[number];
export type WatchPlan = { kind: WatchKind; title: string; dueOn: string | null; note: string };

export type Accepted = {
  packageId: string;
  packageName: string;
  options: { id: string; description: string; priceCents: number }[];
  totalCents: number;
  name: string;
  email: string;
  at: string;
};

/** What the owner can change in the preview before it is built. */
export type AwardChoices = {
  jobName: string;
  /** The package it was won on, when the proposal had more than one and nobody accepted on the link. */
  packageId: string;
  /** The contract figure when it is not the accepted total (a GC's own subcontract); null keeps the total. */
  contractCents: number | null;
  prefix: string;
  template: PhaseTemplatePick | "none";
  pmEmail: string;
  deposit: boolean;
};

export type AwardPlan = {
  client: { name: string; kind: ClientKind; contact: { name: string; email: string; phone: string; role: ContactRole } | null };
  job: { name: string; address: string; prefix: string; contractCents: number; sov: SovLine[] };
  crew: { name: string; address: string; template: PhaseTemplatePick | "none"; pmEmail: string };
  deposit: { number: string; snapshot: DocumentSnapshot; totalCents: number } | null;
  agreementNeeded: boolean;
  watches: WatchPlan[];
};

const GC_KINDS: OpportunityKind[] = ["framing_sub", "commercial_ti"];

export function clientKindFor(kind: OpportunityKind): ClientKind {
  if (GC_KINDS.includes(kind)) return "gc";
  return kind === "other" ? "other" : "homeowner";
}

/** The name on the client record: the company, else the person, else the job. */
export function clientNameFor(o: Pick<Opportunity, "contact" | "title">): string {
  return (o.contact.company?.trim() || o.contact.name.trim() || o.title.trim()).replace(/\s+/g, " ");
}

/** SOP-003: a job is named by its street address. The first part of the address, else the title. */
export function jobNameFor(o: Pick<Opportunity, "address" | "title">): string {
  const street = o.address.split(",")[0]?.trim().replace(/\s+/g, " ") ?? "";
  return street || o.title.trim();
}

/** The street number, the front of every document number on the job (8009 in 8009-11); "" when the address has none. */
export function prefixFor(address: string): string {
  const m = /^\s*(\d{1,6})\b/.exec(address);
  return m ? m[1] : "";
}

/**
 * Where phases start from. We are the GC on a remodel, an addition or a custom
 * home, so the whole-job template; a framing package is our framing; commercial
 * TI is our framing and drywall. A service call starts empty.
 */
export function templateFor(kind: OpportunityKind): PhaseTemplatePick | "none" {
  if (kind === "remodel" || kind === "addition" || kind === "custom_home") return "gc";
  if (kind === "framing_sub") return "framing";
  if (kind === "commercial_ti") return "framing,drywall";
  return "none";
}

export function defaultChoices(o: Opportunity): AwardChoices {
  const kind = clientKindFor(o.kind);
  return { jobName: jobNameFor(o), packageId: "", contractCents: null, prefix: prefixFor(o.address), template: templateFor(o.kind), pmEmail: "", deposit: kind !== "gc" };
}

/**
 * The schedule of values from what was accepted: each section at its price in
 * the chosen package, the lines shown after the sections, then each add-on.
 * A proposal sent as one price has no section prices; it becomes one contract
 * line. Whatever rounding is left lands on the last base line, so the SOV
 * always adds up to the accepted total.
 */
export function sovFromProposal(p: ProposalSnapshot, a: Pick<Accepted, "packageId" | "packageName" | "options" | "totalCents">): SovLine[] {
  const pkg = p.packages.find((x) => x.id === a.packageId);
  const baseCents = pkg?.totalCents ?? a.totalCents - a.options.reduce((s, o) => s + o.priceCents, 0);
  const base: SovLine[] = [];
  for (const s of p.sections) {
    if (s.pkgs.length && !s.pkgs.includes(a.packageId)) continue;
    const amt = s.amounts?.[a.packageId];
    if (typeof amt === "number" && amt !== 0) base.push({ description: s.name, amountCents: amt, kind: "section" });
  }
  for (const adj of p.adjustments ?? []) {
    const amt = adj.amounts?.[a.packageId];
    if (typeof amt === "number" && amt !== 0) base.push({ description: adj.label, amountCents: amt, kind: "adjustment" });
  }
  const sum = base.reduce((s, l) => s + l.amountCents, 0);
  // No section prices, or prices that are clearly not this package's total: one line for the contract.
  if (!base.length || Math.abs(sum - baseCents) > base.length) {
    const label = p.packages.length > 1 && a.packageName ? `Contract work: ${a.packageName}` : `Contract work: ${p.title}`;
    base.splice(0, base.length, { description: label, amountCents: baseCents, kind: "contract" });
  } else if (sum !== baseCents) {
    base[base.length - 1] = { ...base[base.length - 1], amountCents: base[base.length - 1].amountCents + (baseCents - sum) };
  }
  const opts: SovLine[] = a.options.map((o) => ({ description: `Add-on: ${o.description}`, amountCents: o.priceCents, kind: "option" }));
  return [...base, ...opts];
}

function money(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);

/** Whether this award needs the full written agreement (Company policies, SOP-007 §1). */
export function needsAgreement(totalCents: number, policies: Policies): boolean {
  if (policies["policy.contract.proposalIsContract"] === false) return true;
  return totalCents > num(policies["policy.contract.agreementOverCents"], 1_000_000);
}

export function depositCents(totalCents: number, policies: Policies): number {
  return Math.round((totalCents * num(policies["policy.deposit.pct"], 10)) / 100);
}

export function planAward(input: {
  opportunity: Opportunity;
  /** The proposal it was won on; null when it was won on other paper with no proposal from the app. */
  proposal: ProposalSnapshot | null;
  proposalNumber: string;
  accepted: Accepted;
  policies: Policies;
  choices: AwardChoices;
  today: string;
}): AwardPlan {
  const { opportunity: o, proposal: p, accepted: a, policies, choices: c, today } = input;
  const kind = clientKindFor(o.kind);
  const name = c.jobName.trim().replace(/\s+/g, " ") || jobNameFor(o);
  const prefix = c.prefix.trim().replace(/\s+/g, "");
  const email = (o.contact.email ?? "").trim().toLowerCase();
  const contact = o.contact.name.trim() || email
    ? { name: o.contact.name.trim(), email, phone: (o.contact.phone ?? "").trim(), role: (kind === "gc" ? "pm" : "principal") as ContactRole }
    : null;
  const clientName = clientNameFor(o);
  // The contract is what was accepted, unless the owner says the paper we signed says otherwise.
  const contractCents = c.contractCents !== null && c.contractCents > 0 ? c.contractCents : a.totalCents;
  const sov: SovLine[] =
    p && contractCents === a.totalCents
      ? sovFromProposal(p, a)
      : [{ description: `Contract work: ${p?.title || o.title}`, amountCents: contractCents, kind: "contract" }];

  let deposit: AwardPlan["deposit"] = null;
  const depCents = depositCents(contractCents, policies);
  if (c.deposit && prefix && depCents > 0) {
    const pct = num(policies["policy.deposit.pct"], 10);
    const lines: DocumentLine[] = [{ description: `Deposit: ${pct}% of the contract (${money(contractCents)})`, amountCents: depCents }];
    const special = policies["policy.deposit.specialOrders"] !== false;
    deposit = {
      // The first number on a new job; awardStore takes the next free one when the job already has invoices.
      number: `${prefix}-01`,
      totalCents: depCents,
      snapshot: {
        billTo: { name: clientName, attention: contact?.name && contact.name !== clientName ? contact.name : undefined, address: o.address || undefined },
        job: { name, address: o.address || undefined },
        date: today,
        lines,
        terms: p
          ? `Due at signing, before the work is scheduled. Proposal ${input.proposalNumber}${a.packageName && p.packages.length > 1 ? ` (${a.packageName})` : ""}, accepted ${a.at.slice(0, 10)}.`
          : "Due at signing, before the work is scheduled.",
        note: special ? "Special-order materials are billed in full before they are ordered, on their own invoice." : undefined,
      },
    };
  }

  const agreementNeeded = needsAgreement(contractCents, policies);
  const watches: WatchPlan[] = [];
  if (agreementNeeded) {
    watches.push(
      kind === "gc"
        ? {
            kind: "agreement",
            title: "Their subcontract signed",
            dueOn: addDays(today, 7),
            note: "The GC's paper, read and redlined before signing (SOP-007 §2). Nobody starts before it is signed.",
          }
        : {
            kind: "agreement",
            title: "Full agreement signed",
            dueOn: addDays(today, 7),
            note: `Over ${money(num(policies["policy.contract.agreementOverCents"], 1_000_000))} the accepted proposal is not the contract (Company policies). Nobody starts before it is signed.`,
          },
    );
  }
  if (deposit) {
    watches.push({ kind: "deposit", title: "Deposit received", dueOn: addDays(today, 7), note: `${deposit.number}, ${money(deposit.totalCents)}. Before the job is scheduled.` });
  }
  watches.push({
    kind: "prelim_notice",
    title: "20-day preliminary notice served",
    dueOn: null,
    note: "Due 20 days after the first day anyone works on the job (SOP-007 §6). Keeps our lien rights.",
  });
  if (kind === "gc") {
    watches.push({ kind: "coi_gc", title: "Our insurance certificate sent to the GC", dueOn: addDays(today, 3), note: "Naming them as additional insured, as their paper asks." });
  }

  return {
    client: { name: clientName, kind, contact },
    job: { name, address: o.address.trim(), prefix, contractCents, sov },
    crew: { name, address: o.address.trim(), template: c.template, pmEmail: c.pmEmail.trim().toLowerCase() },
    deposit,
    agreementNeeded,
    watches,
  };
}

// ---- watches on "Waiting on you" -------------------------------------------------

export type JobWatch = {
  id: number;
  jobId: string;
  kind: WatchKind;
  title: string;
  dueOn: string | null;
  note: string;
  doneAt: string | null;
  doneBy: string;
  createdBy: string;
  createdAt: string;
};

/** When a watch is due: its own date, or for the 20-day notice, 20 days after the first clock-in (null before anyone works there). */
export function watchDue(w: Pick<JobWatch, "kind" | "dueOn">, firstDay: string | null): string | null {
  if (w.kind === "prelim_notice" && !w.dueOn) return firstDay ? addDays(firstDay, 20) : null;
  return w.dueOn;
}

/** Days ahead a watch starts showing on "Waiting on you". */
export const WATCH_AHEAD_DAYS = 5;

/** Whose lane a watch lands on: money for the deposit, the notice and certificates; sales for the agreement. */
export function watchLane(kind: WatchKind): "sales" | "money" | "decisions" {
  if (kind === "agreement") return "sales";
  if (kind === "deposit" || kind === "prelim_notice" || kind === "coi_gc") return "money";
  return "decisions";
}
