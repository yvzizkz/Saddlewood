import { needsFirstShift, phasesOf, withStage } from "./phases";
import { firstShiftDays, listJobPhases } from "./queries";
import type { CrewJob, CrewJobPhase, CrewJobStaged } from "./types";

// Joins each job to its phases and works out its stage, for the reads that
// carry it: the Crew tab (adminHome), the Projects screen and the Mac's feed.
// The worker's own read never calls this.

/**
 * The jobs with `phases` and `stage` on each. The site can be deployed before
 * migration 0024 is applied: then the phases cannot be read, the jobs come
 * back as they were (no phases, no stage) and the Crew tab still opens.
 */
export async function stageJobs<J extends CrewJob>(jobs: J[], today: string): Promise<(J & Pick<CrewJobStaged, "phases" | "stage">)[]> {
  let all: CrewJobPhase[] = [];
  try {
    all = jobs.length ? await listJobPhases() : [];
  } catch (e) {
    console.error("[crew/stages] phases:", (e as Error).message);
  }
  // Only a job still on its first phase needs its first shift day for "day N".
  const need = jobs.filter((j) => needsFirstShift(phasesOf(all, j.id))).map((j) => j.id);
  const first = need.length ? await firstShiftDays(need).catch(() => ({}) as Record<string, string>) : {};
  return jobs.map((j) => withStage(j, phasesOf(all, j.id), today, first[j.id] ?? null));
}
