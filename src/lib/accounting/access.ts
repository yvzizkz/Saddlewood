// Who may open which Accounting section, and on which jobs. Server only.
//
// Owners see everything. A crew seat with money.view (a project manager)
// sees Receivables, Billing, Purchases and Payroll hours on the jobs they are
// on (crew/scope.ts), never anyone's pay, and never cost or margin unless an
// owner switches that on in Company policies (policy.pm.laborCost,
// policy.pm.margin; decision C of 10/13). Payables stays with the owners.
// Pages only hide; every API behind them checks the seat again.

import { getViewer, viewerIsOwner } from "@/lib/crew/auth";
import { visibleBillingJobs, visibleCrewJobs } from "@/lib/crew/scope";
import { loadPolicies } from "@/lib/policies/store";

export type Section = "overview" | "payroll" | "purchases" | "payables" | "receivables" | "billing" | "job-costing";

export type MoneySeat = {
  owner: boolean;
  email: string;
  /** Field job ids in view; null = every job. */
  crewJobs: string[] | null;
  /** Billing job ids in view; null = every job. */
  billingJobs: string[] | null;
  /** Labor dollars (pay rates times hours). */
  laborCost: boolean;
  /** Cost and margin (Job costing). */
  margin: boolean;
  sections: Section[];
};

const ALL: Section[] = ["overview", "payroll", "purchases", "payables", "receivables", "billing", "job-costing"];

export function sectionsFor(owner: boolean, margin: boolean): Section[] {
  if (owner) return ALL;
  return ["overview", "payroll", "purchases", "receivables", "billing", ...(margin ? (["job-costing"] as Section[]) : [])];
}

/** The caller's seat for an Accounting page, or null when this section is not theirs. */
export async function moneySeatForPage(section: Section): Promise<MoneySeat | null> {
  const viewer = await getViewer();
  if (viewer.kind === "staff" && (await viewerIsOwner(viewer))) {
    return { owner: true, email: viewer.email, crewJobs: null, billingJobs: null, laborCost: true, margin: true, sections: ALL };
  }
  if (viewer.kind !== "crew" || !viewer.person.perms.includes("money.view")) return null;
  const caller = { role: "member" as const, email: viewer.person.email, perms: viewer.person.perms };
  const [{ values }, crewJobs, billingJobs] = await Promise.all([loadPolicies(), visibleCrewJobs(caller), visibleBillingJobs(caller)]);
  const margin = values["policy.pm.margin"] === true;
  const seat: MoneySeat = {
    owner: false,
    email: caller.email,
    crewJobs,
    billingJobs,
    laborCost: values["policy.pm.laborCost"] === true,
    margin,
    sections: sectionsFor(false, margin),
  };
  return seat.sections.includes(section) ? seat : null;
}

/** Whether a row on this job is in the seat's view. A row with no job is owners only. */
export function seesCrewJob(seat: MoneySeat, crewJobId: string | null | undefined): boolean {
  if (seat.crewJobs === null) return true;
  return !!crewJobId && seat.crewJobs.includes(crewJobId);
}

export function seesBillingJob(seat: MoneySeat, billingJobId: string | null | undefined): boolean {
  if (seat.billingJobs === null) return true;
  return !!billingJobId && seat.billingJobs.includes(billingJobId);
}
