import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CrewJob, CrewJobPhase } from "../types";

// The read that puts phases and a stage on each job (the Crew tab, Projects,
// the Mac's feed), against a stand-in for the two queries it makes.

const { db } = vi.hoisted(() => ({
  db: { phases: [] as CrewJobPhase[], firstShift: {} as Record<string, string>, down: false, asked: [] as string[][] },
}));

vi.mock("../queries", () => ({
  listJobPhases: async () => {
    if (db.down) throw new Error('relation "public.crew_job_phases" does not exist');
    return db.phases;
  },
  firstShiftDays: async (ids: string[]) => {
    db.asked.push(ids);
    return Object.fromEntries(ids.filter((id) => db.firstShift[id]).map((id) => [id, db.firstShift[id]]));
  },
}));

import { stageJobs } from "../stages";

const job = (id: string): CrewJob => ({ id, name: id, address: "", note: "", active: true, promised: null, promiseNote: "", geo: null });
const phase = (jobId: string, ord: number, name: string, verifiedAt: string | null = null): CrewJobPhase => ({
  id: ord + (jobId === "keim" ? 100 : 0),
  jobId,
  ord,
  name,
  trade: "drywall",
  plannedFrom: null,
  plannedTo: null,
  verifiedBy: verifiedAt ? "Eli" : "",
  verifiedAt,
  note: "",
  createdBy: "Eli",
});

beforeEach(() => {
  db.phases = [];
  db.firstShift = {};
  db.down = false;
  db.asked = [];
});

describe("stageJobs", () => {
  it("puts each job's phases and stage on it, asking for first shifts only where the first phase is open", async () => {
    db.phases = [phase("bambi", 1, "hang", "2026-10-17T20:00:00Z"), phase("bambi", 2, "tape"), phase("keim", 1, "layout")];
    db.firstShift = { keim: "2026-10-12" };
    const out = await stageJobs([job("bambi"), job("keim"), job("empty")], "2026-10-19");
    expect(out.map((j) => [j.id, j.phases.length, j.stage?.name ?? null, j.stage?.day ?? null])).toEqual([
      ["bambi", 2, "tape", 3],
      ["keim", 1, "layout", 8],
      ["empty", 0, null, null],
    ]);
    expect(db.asked).toEqual([["keim"]]);
  });

  it("leaves the jobs as they were when the phases cannot be read (migration 0024 not applied)", async () => {
    db.down = true;
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    const out = await stageJobs([job("bambi")], "2026-10-19");
    expect(out).toEqual([{ ...job("bambi"), phases: [], stage: null }]);
    expect(db.asked).toEqual([]);
    quiet.mockRestore();
  });

  it("reads nothing for no jobs", async () => {
    expect(await stageJobs([], "2026-10-19")).toEqual([]);
  });
});
