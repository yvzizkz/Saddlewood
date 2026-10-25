import { listBillingJobs, listJobPeople } from "./queries";
import type { Capability, CrewJobPerson } from "./types";

// Which jobs a person may see. A group with projects.mine (the project
// manager, 0018) sees only the jobs they are on (crew_job_people); everyone
// else on a screen sees every job. Owners are never narrowed (auth.ts leaves
// projects.mine out of their switches). Every list, act and alert that is
// about a job goes through this, on the server.

/** The caller, as requireSwitch / requireManager return them. */
export type ScopeCaller = { role: "owner" | "member"; email: string; perms: readonly Capability[] | readonly string[] };

/** null = every job. Otherwise the field job ids (crew_jobs.id) they are on. */
export type JobScope = string[] | null;

export function isNarrowed(who: ScopeCaller): boolean {
  return who.role !== "owner" && who.perms.includes("projects.mine");
}

/** The field jobs this caller may see: null for all of them. */
export async function visibleCrewJobs(who: ScopeCaller): Promise<JobScope> {
  if (!isNarrowed(who)) return null;
  return scopeFrom(who, await listJobPeople({ email: who.email }));
}

/** The same from assignments already read (the 7 AM push reads them once for everyone). */
export function scopeFrom(who: ScopeCaller, assignments: CrewJobPerson[]): JobScope {
  if (!isNarrowed(who)) return null;
  return jobsOn(who.email, assignments);
}

/** The field jobs a person is on (crew_job_people), whatever their switches: a field lead's seat (jobs/access.ts). */
export function jobsOn(email: string, assignments: CrewJobPerson[]): string[] {
  return [...new Set(assignments.filter((a) => a.email === email).map((a) => a.jobId))];
}

/**
 * The billing jobs (public.jobs.id) this caller may see, through the link
 * jobs.crew_job_id: null for all of them. A narrowed caller sees only billing
 * jobs linked to a field job they are on; an unlinked billing job is owners only.
 */
export async function visibleBillingJobs(who: ScopeCaller): Promise<JobScope> {
  const crew = await visibleCrewJobs(who);
  if (crew === null) return null;
  const mine = new Set(crew);
  return (await listBillingJobs()).filter((j) => j.crewJobId && mine.has(j.crewJobId)).map((j) => j.id);
}

/**
 * Whether something on a job is in scope. Work with no job (a task or pickup
 * not tied to one) stays visible: it is not about a job they are kept off.
 */
export function inScope(scope: JobScope, jobId: string | null | undefined): boolean {
  return scope === null || !jobId || scope.includes(jobId);
}
