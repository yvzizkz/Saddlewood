import { describe, expect, it } from "vitest";

import type { Overview } from "@/lib/billing/overview";
import type { CrewJob, CrewReport, CrewTask } from "@/lib/crew/types";
import { laneHolder, laneOwners, lanesOf } from "../lanes";
import { buildWaiting, planAsk, type WaitingInput } from "../waiting";

const MARCO = "marco@saddlewoodcontracting.com";
const LANDO = "lando@saddlewoodcontracting.com";
const INFO = "info@saddlewoodcontracting.com";
const ILENE = "ilene8a@gmail.com";
const ELI = "eli@saddlewoodcontracting.com";

const PEOPLE = {
  [MARCO]: { name: "Marco", role: "owner" as const },
  [LANDO]: { name: "Lando", role: "owner" as const },
  [INFO]: { name: "Lando", role: "owner" as const },
  [ELI]: { name: "Eli", role: "requester" as const },
};

describe("lanes", () => {
  it("gives Marco sales and decisions, Lando the app and, until Ilene has a seat, the money", () => {
    expect(lanesOf(MARCO, PEOPLE)).toEqual(["sales", "decisions"]);
    expect(lanesOf(LANDO, PEOPLE)).toEqual(["money", "systems"]);
    expect(lanesOf(INFO, PEOPLE)).toEqual(["money", "systems"]);
    expect(laneHolder("money", PEOPLE)).toEqual({ name: "Lando", emails: [INFO, LANDO], backup: true });
  });

  it("moves payments and payroll to Ilene once she has an owner seat", () => {
    const people = { ...PEOPLE, [ILENE]: { name: "Ilene Ochoa", role: "owner" as const } };
    expect(laneOwners("money", people)).toEqual([ILENE]);
    expect(lanesOf(LANDO, people)).toEqual(["systems"]);
  });

  it("never names someone without an owner seat, and never drops an alert", () => {
    const people = { [ELI]: { name: "Marco", role: "requester" as const }, [LANDO]: { name: "Lando", role: "owner" as const } };
    expect(laneOwners("decisions", people)).toEqual([LANDO]); // Marco has no seat: his backup
    expect(laneOwners("systems", { [MARCO]: { name: "Marco", role: "owner" as const } })).toEqual([MARCO]);
    expect(laneOwners("money", { "x@y.com": { name: "Someone", role: "owner" as const } })).toEqual(["x@y.com"]);
  });
});

// 2026-10-14, a Wednesday, 7:00 PM in Phoenix.
const NOW = new Date("2026-10-15T02:00:00Z");
const TODAY = "2026-10-14";

function task(over: Partial<CrewTask>): CrewTask {
  return {
    id: 1,
    email: "arnold@example.com",
    title: "Sand the hallway",
    detail: "",
    jobId: "keim",
    jobName: "12729 W Keim Dr",
    due: null,
    status: "open",
    doneNote: "",
    files: [],
    closedAt: null,
    priority: null,
    reportedAt: null,
    verifiedAt: null,
    verifiedBy: "",
    sentBack: 0,
    createdBy: "Eli",
    createdAt: "2026-10-10T15:00:00Z",
    ...over,
  };
}

function job(over: Partial<CrewJob>): CrewJob {
  return { id: "keim", name: "12729 W Keim Dr", address: "", note: "", active: true, promised: null, promiseNote: "", ...over };
}

function report(over: Partial<CrewReport>): CrewReport {
  return { id: 5, day: "2026-10-15", sentBy: ELI, sentName: "Eli Garcia", body: "TOMORROW: Thu, Oct 15\n1. Arnold · Keim", createdAt: "2026-10-15T00:40:00Z", answer: null, ...over };
}

function input(over: Partial<WaitingInput> = {}): WaitingInput {
  return {
    now: NOW,
    people: [{ email: ELI, name: "Eli Garcia", active: true, perms: ["crew.view", "plan.send", "updates", "tasks.verify"] }],
    reports: [report({})],
    tasks: [],
    jobs: [],
    timefixes: 0,
    reviews: 0,
    money: null,
    ...over,
  };
}

describe("the supervisor's plan", () => {
  it("reads what the plan needs from Marco", () => {
    expect(planAsk("TOMORROW: Thu\n\nNEED FROM MARCO\nOK the $6k lumber order")).toBe("OK the $6k lumber order");
    expect(planAsk("TOMORROW: Thu\nNobody")).toBe("");
  });

  it("puts the ask in Marco's lane as a decision", () => {
    const items = buildWaiting(input({ reports: [report({ body: "TOMORROW\n\nNEED FROM MARCO\nA date for Keim Dr" })] }));
    expect(items).toEqual([
      expect.objectContaining({ lane: "decisions", kind: "decision", title: "Eli asks you", detail: "A date for Keim Dr", href: "/app/crew?view=plan&day=2026-10-15" }),
    ]);
  });

  it("drops the ask once an owner answered it", () => {
    const answered = report({ body: "x\nNEED FROM MARCO\nA date?", answer: { text: "Friday", by: MARCO, name: "Marco", at: "2026-10-15T01:00:00Z" } });
    expect(buildWaiting(input({ reports: [answered] }))).toEqual([]);
  });

  it("uses the newest plan for a day, and drops asks from past days", () => {
    const items = buildWaiting(
      input({
        reports: [
          report({ id: 4, body: "x\nNEED FROM MARCO\nold ask", createdAt: "2026-10-14T23:00:00Z" }),
          report({ id: 5, body: "x", createdAt: "2026-10-15T00:40:00Z" }),
          report({ id: 3, day: "2026-10-13", body: "x\nNEED FROM MARCO\nyesterday", createdAt: "2026-10-13T00:40:00Z" }),
        ],
      }),
    );
    expect(items).toEqual([]);
  });

  it("flags a plan not in by 6 PM, only when someone sends plans and tomorrow is a workday", () => {
    expect(buildWaiting(input({ reports: [] }))).toEqual([
      expect.objectContaining({ key: "plan-late-2026-10-15", kind: "signal", title: "Eli's plan for tomorrow is not in" }),
    ]);
    expect(buildWaiting(input({ reports: [], now: new Date("2026-10-15T00:30:00Z") }))).toEqual([]); // 5:30 PM
    expect(buildWaiting(input({ reports: [], people: [] }))).toEqual([]);
    // Saturday evening: tomorrow is Sunday.
    expect(buildWaiting(input({ reports: [], now: new Date("2026-10-18T02:00:00Z") }))).toEqual([]);
  });
});

describe("work reported done", () => {
  it("flags work not checked by the same time the next working day", () => {
    const late = task({ id: 1, status: "done", reportedAt: "2026-10-13T22:00:00Z" }); // Tue 3 PM
    const fresh = task({ id: 2, status: "done", reportedAt: "2026-10-14T20:00:00Z", title: "Prime" });
    const checked = task({ id: 3, status: "done", reportedAt: "2026-10-12T20:00:00Z", verifiedAt: "2026-10-12T23:00:00Z" });
    const items = buildWaiting(input({ tasks: [late, fresh, checked] }));
    expect(items).toEqual([
      expect.objectContaining({ key: "tasks-unchecked", kind: "signal", title: "1 task reported done, not checked for over a day", detail: "Sand the hallway · 12729 W Keim Dr" }),
    ]);
  });

  it("does not count Sunday: Saturday's report is late Monday", () => {
    const sat = task({ status: "done", reportedAt: "2026-10-17T21:00:00Z" }); // Sat 2 PM
    expect(buildWaiting(input({ tasks: [sat], now: new Date("2026-10-19T20:00:00Z") }))).toEqual([]); // Mon 1 PM
    expect(buildWaiting(input({ tasks: [sat], now: new Date("2026-10-19T22:00:00Z") }))).toHaveLength(1); // Mon 3 PM
  });
});

describe("promises", () => {
  it("flags a promise within three days while work on the job is open, and one already missed", () => {
    const open = task({});
    expect(buildWaiting(input({ jobs: [job({ promised: "2026-10-16", promiseNote: "Drywall finished" })], tasks: [open] }))).toEqual([
      expect.objectContaining({ key: "promise-keim", title: "12729 W Keim Dr: the promise is in 2 days", detail: "Drywall finished · 1 task still open" }),
    ]);
    expect(buildWaiting(input({ jobs: [job({ promised: TODAY })], tasks: [open] }))[0].title).toContain("is today");
    expect(buildWaiting(input({ jobs: [job({ promised: "2026-10-12" })], tasks: [open] }))[0].title).toContain("was due 2 days ago");
  });

  it("stays quiet when the promise is far off, the work is done, or the job is closed", () => {
    expect(buildWaiting(input({ jobs: [job({ promised: "2026-10-20" })], tasks: [task({})] }))).toEqual([]);
    expect(buildWaiting(input({ jobs: [job({ promised: "2026-10-15" })], tasks: [task({ status: "done", verifiedAt: "2026-10-14T20:00:00Z" })] }))).toEqual([]);
    expect(buildWaiting(input({ jobs: [job({ promised: "2026-10-15", active: false })], tasks: [task({})] }))).toEqual([]);
  });
});

describe("hours and money", () => {
  it("sends hours to the payroll lane", () => {
    expect(buildWaiting(input({ timefixes: 2, reviews: 1 }))).toEqual([
      expect.objectContaining({ lane: "money", kind: "decision", title: "Hours: 2 time fixes, 1 shift to review" }),
    ]);
  });

  it("gives Ilene the calls from day 7 and Marco from day 14", () => {
    const doc = (id: string, number: string, daysLate: number, balanceCents = 1_250_000) => ({
      doc: { id, number, dueDate: "2026-09-20" },
      clientName: "AFT",
      paidCents: 0,
      balanceCents,
      proof: {},
      unconfirmed: false,
      next: { on: "2026-10-20", label: "Attorney; lien calendar", who: "marco", daysLate },
    });
    const money = {
      today: TODAY,
      totalOpenCents: 0,
      clients: [{ id: "aft", name: "AFT", openCents: 0, documents: [doc("a", "8009-13", 3), doc("b", "8009-14", 9), doc("c", "5203-12", 24), doc("d", "5203-11", 30, 0)] }],
    } as unknown as Overview;
    const items = buildWaiting(input({ money }));
    expect(items.map((i) => [i.lane, i.title])).toEqual([
      ["money", "Call AFT: 8009-14 is 9 days late"],
      ["decisions", "Call AFT: 5203-12 is 24 days late"],
    ]);
    expect(items[1]).toMatchObject({ detail: "$12,500 open · next step Tue, Oct 20: Attorney; lien calendar", href: "/app/money/c" });
  });
});

it("lists decisions before signals", () => {
  const items = buildWaiting(input({ reports: [], timefixes: 1 }));
  expect(items.map((i) => i.kind)).toEqual(["decision", "signal"]);
});

describe("hand-offs to the supervisor", () => {
  const eliTask = (over: Partial<CrewTask>) => task({ id: 50, email: ELI, title: "Give Keim a date", jobId: "", jobName: "", createdBy: "Marco", ...over });
  const owners = ["Lando", "Marco"];

  it("lists open work given to the supervisor for the owner who gave it", () => {
    const items = buildWaiting(input({ owners, tasks: [eliTask({ due: "2026-10-16" })] }));
    expect(items).toEqual([expect.objectContaining({ key: "handoff-50", kind: "handoff", who: "Marco", title: "Eli · Give Keim a date", detail: "due Fri, Oct 16" })]);
  });

  it("asks the giver to check it once it is reported done, and keeps it out of the crew's check signal", () => {
    const done = eliTask({ status: "done", reportedAt: "2026-10-13T15:00:00Z", doneNote: "Friday, client OK" });
    const items = buildWaiting(input({ owners, tasks: [done] }));
    expect(items).toEqual([expect.objectContaining({ kind: "decision", who: "Marco", title: "Eli says done: Give Keim a date", detail: "Friday, client OK" })]);
  });

  it("turns late or stuck work into a signal, and leaves a checked task out", () => {
    expect(buildWaiting(input({ owners, tasks: [eliTask({ due: "2026-10-12" })] }))[0]).toMatchObject({ kind: "signal", detail: "was due Mon, Oct 12" });
    expect(buildWaiting(input({ owners, tasks: [eliTask({ status: "blocked", doneNote: "client away" })] }))[0]).toMatchObject({ kind: "signal", detail: "stuck: client away" });
    expect(buildWaiting(input({ owners, tasks: [eliTask({ status: "done", verifiedAt: "2026-10-14T20:00:00Z" })] }))).toEqual([]);
  });

  it("falls back to the lane when the giver is not an owner", () => {
    expect(buildWaiting(input({ owners, tasks: [eliTask({ createdBy: "bot" })] }))[0]).toMatchObject({ lane: "decisions", who: undefined });
  });
});
