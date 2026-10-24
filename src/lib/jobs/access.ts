// Who may open the job pages and Tasks, and on which jobs. Server only.
//
// Owners see every job. A project manager (a crew seat with money.view, the
// same seat Accounting opens to, access.ts) sees the jobs they are on
// (crew/scope.ts) and runs them: the schedule, the log and QA, punch, tasks
// handed down to the field, a change recorded from the field. Money on the
// job is read only; labor dollars and margin follow Company policies
// (policy.pm.laborCost, policy.pm.margin); sub and vendor bills (Payables),
// pricing a change order and billing stay with the owners. A field lead (a
// crew seat without money.view who holds the Field lead seat, or covers it
// while it is empty: roles/seats.ts) runs the same jobs they are on with no
// money at all: no contract, invoices, payments, purchases or costs. Pages
// only hide; every API behind them checks the seat again.

import { moneySeatForPage, seesBillingJob, seesCrewJob, type MoneySeat } from "@/lib/accounting/access";
import { getViewer } from "@/lib/crew/auth";
import { listJobPeople } from "@/lib/crew/queries";
import { getJobRef, type JobRef } from "@/lib/jobs/hub";
import { holdsFieldLead, type Role } from "@/lib/roles/seats";
import { loadPeople, loadSeats } from "@/lib/roles/store";

export type WorkSeat = MoneySeat & {
  /** Money on the job (contract, invoices, payments, purchases, changes priced): owners and PMs; never a field lead. */
  money: boolean;
};

/** The roles a PM hands work to: their own seat and the field below it. */
export const PM_ROLES: Role[] = ["pm", "field_lead"];

/** A field lead's seat: the field jobs they are on (crew_job_people), never every job, and no money. */
export function fieldLeadSeat(email: string, crewJobs: string[]): WorkSeat {
  return { owner: false, email, crewJobs, billingJobs: [], laborCost: false, margin: false, sections: [], money: false };
}

/** The caller's seat for the job pages and Tasks, or null when they have none. */
export async function workSeat(): Promise<WorkSeat | null> {
  const money = await moneySeatForPage("overview");
  if (money) return { ...money, money: true };
  const viewer = await getViewer();
  if (viewer.kind !== "crew") return null;
  const email = viewer.person.email;
  const [seats, people] = await Promise.all([loadSeats(), loadPeople()]);
  if (!holdsFieldLead(email, seats, people)) return null;
  const on = await listJobPeople({ email });
  return fieldLeadSeat(email, [...new Set(on.map((a) => a.jobId))]);
}

export function seesJob(seat: WorkSeat, ref: Pick<JobRef, "crewId" | "billingId">): boolean {
  if (seat.owner) return true;
  return (!!ref.crewId && seesCrewJob(seat, ref.crewId)) || (!!ref.billingId && seesBillingJob(seat, ref.billingId));
}

/** The job behind a write, when this seat may write on it; null otherwise (a 403 or 404 to the caller). */
export async function jobForWrite(seat: WorkSeat, key: string): Promise<JobRef | null> {
  const ref = key ? await getJobRef(key) : null;
  return ref && seesJob(seat, ref) ? ref : null;
}

