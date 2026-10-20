import { describe, expect, it } from "vitest";

import { PHASE_TEMPLATES, needsFirstShift, phasesOf, planPhaseSet, stageOf, stageText, templatePhases, withStage } from "../phases";
import type { CrewJob, CrewJobPhase } from "../types";

// The stage of a job is read off its phases, never stored. These are the
// rules: which phase is current, how long it has been there, when it is
// behind, and what setting the list may and may not do to a verified phase.

const TODAY = "2026-10-19";

const phase = (ord: number, name: string, over: Partial<CrewJobPhase> = {}): CrewJobPhase => ({
  id: ord,
  jobId: "bambi",
  ord,
  name,
  trade: "drywall",
  plannedFrom: null,
  plannedTo: null,
  verifiedBy: "",
  verifiedAt: null,
  note: "",
  createdBy: "Eli",
  ...over,
});
// 10 PM Phoenix on the 16th is 05:00Z on the 17th: the day is the Phoenix one.
const done = (ord: number, name: string, at = "2026-10-17T05:00:00Z") => phase(ord, name, { verifiedAt: at, verifiedBy: "Eli Lugo" });
const drywall = () => [phase(1, "hang"), phase(2, "tape"), phase(3, "texture"), phase(4, "punch")];

describe("the templates", () => {
  it("are framing and drywall, in order, and both is framing then drywall", () => {
    expect(PHASE_TEMPLATES.framing).toEqual(["layout", "walls", "roof and ceiling", "backing", "inspection"]);
    expect(PHASE_TEMPLATES.drywall).toEqual(["hang", "tape", "texture", "punch"]);
    expect(templatePhases("drywall").map((p) => [p.name, p.trade])).toEqual([
      ["hang", "drywall"],
      ["tape", "drywall"],
      ["texture", "drywall"],
      ["punch", "drywall"],
    ]);
    expect(templatePhases("both").map((p) => p.name)).toEqual(["layout", "walls", "roof and ceiling", "backing", "inspection", "hang", "tape", "texture", "punch"]);
    expect(templatePhases("both").map((p) => p.trade)).toEqual(["framing", "framing", "framing", "framing", "framing", "drywall", "drywall", "drywall", "drywall"]);
  });
});

describe("stageOf", () => {
  it("is null with no phases", () => {
    expect(stageOf([], TODAY)).toBeNull();
  });

  it("is the first unverified phase, counting days from the previous check", () => {
    const s = stageOf([done(1, "hang", "2026-10-17T05:00:00Z"), phase(2, "tape"), phase(3, "texture")], TODAY);
    expect(s).toMatchObject({ id: 2, name: "tape", trade: "drywall", ord: 2, of: 3, sinceDay: "2026-10-16", day: 4, behind: false, complete: false, plannedDays: null });
  });

  it("counts the first phase from the job's first shift, or not at all", () => {
    expect(stageOf(drywall(), TODAY, "2026-10-17")).toMatchObject({ name: "hang", ord: 1, of: 4, sinceDay: "2026-10-17", day: 3 });
    expect(stageOf(drywall(), TODAY)).toMatchObject({ name: "hang", sinceDay: null, day: null });
    // A shift later today is still day 1, never day 0.
    expect(stageOf(drywall(), TODAY, TODAY)).toMatchObject({ day: 1 });
  });

  it("is behind when the plan has run out and the phase is not verified", () => {
    const planned = [done(1, "hang"), phase(2, "tape", { plannedFrom: "2026-10-15", plannedTo: "2026-10-18" }), phase(3, "texture")];
    expect(stageOf(planned, TODAY)).toMatchObject({ name: "tape", behind: true, plannedFrom: "2026-10-15", plannedTo: "2026-10-18", plannedDays: 4 });
    expect(stageOf(planned, "2026-10-18")).toMatchObject({ behind: false });
    // A verified phase past its plan is not behind: the next one is current.
    const late = [done(1, "hang"), phase(2, "tape", { plannedTo: "2026-10-01", verifiedAt: "2026-10-18T20:00:00Z" }), phase(3, "texture")];
    expect(stageOf(late, TODAY)).toMatchObject({ name: "texture", behind: false, sinceDay: "2026-10-18" });
  });

  it("reads the order from ord, not the array", () => {
    expect(stageOf([phase(3, "texture"), done(1, "hang"), done(2, "tape", "2026-10-18T20:00:00Z")], TODAY)).toMatchObject({ name: "texture", ord: 3, sinceDay: "2026-10-18" });
  });

  it("is the first gap when a later phase was verified first", () => {
    expect(stageOf([done(1, "hang"), phase(2, "tape"), done(3, "texture")], TODAY)).toMatchObject({ name: "tape", ord: 2 });
  });

  it("is complete once every phase is verified, since the latest check", () => {
    const s = stageOf([done(1, "hang"), done(2, "tape", "2026-10-18T20:00:00Z")], TODAY);
    expect(s).toMatchObject({ id: null, name: "complete", ord: 2, of: 2, sinceDay: "2026-10-18", day: null, behind: false, complete: true });
  });

  it("says whether the first shift day is wanted", () => {
    expect(needsFirstShift([])).toBe(false);
    expect(needsFirstShift(drywall())).toBe(true);
    expect(needsFirstShift([done(1, "hang"), phase(2, "tape")])).toBe(false);
  });
});

describe("the small text after a job's name", () => {
  it("is the stage and the day", () => {
    expect(stageText(null)).toBe("");
    expect(stageText(stageOf(drywall(), TODAY))).toBe("hang");
    expect(stageText(stageOf(drywall(), TODAY, "2026-10-17"))).toBe("hang, day 3");
    expect(stageText(stageOf([done(1, "hang")], TODAY))).toBe("complete");
  });

  it("puts the phases and the stage on a job, and picks one job's phases out of everyone's", () => {
    const job: CrewJob = { id: "bambi", name: "6402 E Bambi", address: "", note: "", active: true, promised: null, promiseNote: "", geo: null };
    const all = [phase(1, "hang", { jobId: "keim" }), ...drywall()];
    expect(phasesOf(all, "bambi").map((p) => p.name)).toEqual(["hang", "tape", "texture", "punch"]);
    expect(withStage(job, phasesOf(all, "bambi"), TODAY, "2026-10-17")).toMatchObject({ name: "6402 E Bambi", stage: { name: "hang", day: 3 } });
    expect(withStage(job, [], TODAY)).toMatchObject({ phases: [], stage: null });
  });
});

describe("setting the list", () => {
  const want = (...names: string[]) => names.map((name) => ({ name, trade: "", plannedFrom: null, plannedTo: null }));

  it("replaces unverified phases in order and renumbers", () => {
    const plan = planPhaseSet(drywall(), want("hang", "sand", "texture"));
    expect(plan).toEqual({
      ok: true,
      keep: [],
      add: [
        { name: "hang", trade: "", plannedFrom: null, plannedTo: null, ord: 1 },
        { name: "sand", trade: "", plannedFrom: null, plannedTo: null, ord: 2 },
        { name: "texture", trade: "", plannedFrom: null, plannedTo: null, ord: 3 },
      ],
    });
  });

  it("keeps a verified phase in place, with its check, and follows the list's dates", () => {
    const existing = [done(1, "hang"), phase(2, "tape"), done(3, "texture")];
    const plan = planPhaseSet(existing, [
      { name: "Hang ", trade: "", plannedFrom: "2026-10-10", plannedTo: "2026-10-12" },
      ...want("sand"),
      { name: "texture", trade: "finish", plannedFrom: null, plannedTo: null },
      ...want("punch"),
    ]);
    expect(plan).toEqual({
      ok: true,
      keep: [
        { id: 1, ord: 1, trade: "drywall", plannedFrom: "2026-10-10", plannedTo: "2026-10-12" },
        { id: 3, ord: 3, trade: "finish", plannedFrom: null, plannedTo: null },
      ],
      add: [
        { name: "sand", trade: "", plannedFrom: null, plannedTo: null, ord: 2 },
        { name: "punch", trade: "", plannedFrom: null, plannedTo: null, ord: 4 },
      ],
    });
  });

  it("never drops a verified phase", () => {
    const plan = planPhaseSet([done(1, "hang"), phase(2, "tape")], want("tape", "texture"));
    expect(plan).toEqual({ ok: false, error: '"hang" is verified and cannot be dropped. Unverify it first, or keep it on the list.' });
    expect(planPhaseSet([done(1, "hang")], [])).toMatchObject({ ok: false });
  });

  it("keeps verified phases in the order they were checked", () => {
    const plan = planPhaseSet([done(1, "hang"), done(2, "tape"), phase(3, "texture")], want("tape", "hang", "texture"));
    expect(plan).toMatchObject({ ok: false, error: 'Verified phases keep their order: "tape" was checked after "hang". Put it back where it was.' });
    expect(planPhaseSet([done(1, "hang"), done(2, "tape")], want("tape", "texture"))).toMatchObject({ ok: false, error: '"hang" is verified and cannot be dropped. Unverify it first, or keep it on the list.' });
    expect(planPhaseSet([done(1, "hang"), done(2, "tape")], want("hang", "texture", "tape"))).toMatchObject({ ok: true, keep: [{ id: 1, ord: 1 }, { id: 2, ord: 3 }] });
  });

  it("clears a list with nothing verified", () => {
    expect(planPhaseSet(drywall(), [])).toEqual({ ok: true, keep: [], add: [] });
  });
});
