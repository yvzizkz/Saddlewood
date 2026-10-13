import { describe, expect, it } from "vitest";

import { buildProjects, type ProjectsInput } from "../projects";
import { inScope, isNarrowed, scopeFrom } from "../scope";
import { normalizePerms, type CrewJob, type CrewScheduleItem, type CrewTask } from "../types";

const ELI = "eli@example.com";
const ARNOLD = "arnold@example.com";
const DAY = "2026-10-13";
const NOW = new Date("2026-10-13T15:00:00Z");

const job = (id: string, over: Partial<CrewJob> = {}): CrewJob => ({ id, name: id, address: "", note: "", active: true, promised: null, promiseNote: "", ...over });
const task = (over: Partial<CrewTask>): CrewTask => ({
  id: 1, email: ARNOLD, title: "Hang the ceiling", detail: "", jobId: "keim", jobName: "Keim", due: null, status: "open", doneNote: "", files: [], closedAt: null,
  priority: null, reportedAt: null, verifiedAt: null, verifiedBy: "", sentBack: 0, createdBy: "Eli", createdAt: "2026-10-10T15:00:00Z", ...over,
});
const slot = (over: Partial<CrewScheduleItem>): CrewScheduleItem => ({
  id: 1, day: DAY, email: ARNOLD, jobId: "keim", jobName: "Keim", startTime: "07:00", note: "", priority: null, ack: "", ackNote: "", ackAt: null, createdBy: "Eli", ...over,
});
const input = (over: Partial<ProjectsInput> = {}): ProjectsInput => ({
  day: DAY, now: NOW, scope: null, jobs: [job("keim"), job("bambi")], people: [{ email: ARNOLD, name: "Arnold Mujica" }, { email: ELI, name: "Eli Lugo" }],
  jobPeople: [], schedule: [], tasks: [], reports: [], billing: {}, ...over,
});

describe("switches and scope", () => {
  it("never opens the Crew tab with a projects or money switch alone", () => {
    expect(normalizePerms(["projects.view", "projects.mine", "money.view"])).toEqual(["projects.view", "projects.mine", "money.view"]);
  });

  it("narrows a member with projects.mine to their jobs, and never an owner", () => {
    const assignments = [{ jobId: "keim", email: ELI, role: "pm" as const }, { jobId: "bambi", email: ARNOLD, role: "crew" as const }];
    expect(scopeFrom({ role: "member", email: ELI, perms: ["projects.mine"] }, assignments)).toEqual(["keim"]);
    expect(scopeFrom({ role: "member", email: ELI, perms: ["crew.view"] }, assignments)).toBeNull();
    expect(isNarrowed({ role: "owner", email: "marco@x.com", perms: ["projects.mine"] })).toBe(false);
    expect(scopeFrom({ role: "member", email: "new@example.com", perms: ["projects.mine"] }, assignments)).toEqual([]); // on nothing: sees nothing
    expect(inScope(["keim"], "bambi")).toBe(false);
    expect(inScope(["keim"], "")).toBe(true); // work with no job
    expect(inScope(null, "bambi")).toBe(true);
  });
});

describe("the Projects screen", () => {
  it("shows a project manager only the jobs they are on", () => {
    const v = buildProjects(input({ scope: ["keim"] }));
    expect(v.projects.map((p) => p.id)).toEqual(["keim"]);
  });

  it("puts stuck and late promises first, and says why", () => {
    const v = buildProjects(
      input({
        jobs: [job("keim", { promised: "2026-10-12", promiseNote: "Drywall ready" }), job("bambi"), job("calm")],
        tasks: [
          task({ id: 1, jobId: "keim" }),
          task({ id: 2, jobId: "bambi", status: "blocked", doneNote: "No lumber" }),
          task({ id: 3, jobId: "calm", status: "done", reportedAt: "2026-10-12T22:00:00Z" }),
        ],
      }),
    );
    expect(v.projects.map((p) => [p.id, p.tone, p.headline])).toEqual([
      ["keim", "bad", "Promise passed 1 day ago with work open"],
      ["bambi", "bad", "1 stuck"],
      ["calm", "warn", "1 to check"],
    ]);
    expect(v.projects[1].stuck).toEqual([{ id: 2, title: "Hang the ceiling", who: "Arnold", note: "No lumber" }]);
  });

  it("counts verified and sent back over two weeks, and who is there today and next", () => {
    const v = buildProjects(
      input({
        jobs: [job("keim")],
        tasks: [
          task({ id: 1, status: "done", verifiedAt: "2026-10-12T20:00:00Z" }),
          task({ id: 2, status: "done", verifiedAt: "2026-09-01T20:00:00Z" }),
          task({ id: 3, status: "open", sentBack: 1 }),
        ],
        schedule: [slot({}), slot({ id: 2, day: "2026-10-15", email: ELI }), slot({ id: 3, day: "2026-10-16", ack: "cant", ackNote: "Doctor" })],
        jobPeople: [{ jobId: "keim", email: ELI, role: "pm" }],
        billing: { keim: "11111111-1111-4111-8111-111111111111" },
      }),
    );
    expect(v.projects[0]).toMatchObject({
      verified: 1,
      sentBack: 1,
      open: 1,
      today: ["Arnold"],
      next: { day: "2026-10-15", names: ["Eli"] },
      cant: [{ day: "2026-10-16", who: "Arnold", note: "Doctor" }],
      tone: "warn",
      people: [{ email: ELI, name: "Eli Lugo", role: "pm" }],
      billingJobId: "11111111-1111-4111-8111-111111111111",
    });
  });
});
