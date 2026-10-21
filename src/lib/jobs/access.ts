// Who may open the job pages and Tasks, and on which jobs. Server only.
//
// Owners see every job. A project manager (a crew seat with money.view, the
// same seat Accounting opens to, access.ts) sees the jobs they are on
// (crew/scope.ts) and runs them: the schedule, the log and QA, punch, tasks
// handed down to the field, a change recorded from the field. Money on the
// job is read only; labor dollars and margin follow Company policies
// (policy.pm.laborCost, policy.pm.margin); sub and vendor bills (Payables),
// pricing a change order and billing stay with the owners. Pages only hide;
// every API behind them checks the seat again.

import { moneySeatForPage, seesBillingJob, seesCrewJob, type MoneySeat } from "@/lib/accounting/access";
import { getJobRef, type JobRef } from "@/lib/jobs/hub";
import type { Role } from "@/lib/roles/seats";

export type WorkSeat = MoneySeat;

/** The roles a PM hands work to: their own seat and the field below it. */
export const PM_ROLES: Role[] = ["pm", "field_lead"];

/** The caller's seat for the job pages and Tasks, or null when they have none. */
export async function workSeat(): Promise<WorkSeat | null> {
  return moneySeatForPage("overview");
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

