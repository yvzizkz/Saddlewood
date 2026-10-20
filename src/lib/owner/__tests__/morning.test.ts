import { describe, expect, it } from "vitest";

import type { CrewScheduleItem, CrewTask } from "@/lib/crew/types";
import { buildMorning, type MorningInput } from "../morning";
import type { WaitingItem } from "../waiting";

const MARCO = "marco@saddlewoodcontracting.com";
const LANDO = "lando@saddlewoodcontracting.com";
const INFO = "info@saddlewoodcontracting.com";
const ELI = "eli@saddlewoodcontracting.com";
const ARNOLD = "arnold@example.com";
const MARCUS = "marcus@example.com";
const DAY = "2026-10-13"; // a Tuesday

const OWNERS = {
  [MARCO]: { name: "Marco", role: "owner" as const },
  [LANDO]: { name: "Lando", role: "owner" as const },
  [INFO]: { name: "Lando", role: "owner" as const },
};
const PEOPLE: MorningInput["people"] = [
  { email: ELI, name: "Eli Ramos", lang: "en", active: true, perms: ["clock", "tasks.verify", "plan.send", "updates"] },
  { email: ARNOLD, name: "Arnold Mujica", lang: "es", active: true, perms: ["clock"] },
  { email: MARCUS, name: "Marcus Ulm", lang: "en", active: true, perms: ["clock"] },
] as MorningInput["people"];

function slot(over: Partial<CrewScheduleItem>): CrewScheduleItem {
  return { id: 1, day: DAY, email: ARNOLD, jobId: "keim", jobName: "12729 W Keim Dr", startTime: "07:00", note: "", priority: null, ack: "", ackNote: "", ackAt: null, createdBy: "Eli", ...over };
}
function task(over: Partial<CrewTask>): CrewTask {
  return {
    id: 1, email: ARNOLD, title: "Hang the garage ceiling", detail: "", jobId: "keim", jobName: "12729 W Keim Dr", due: null, status: "open",
    doneNote: "", files: [], closedAt: null, priority: null, reportedAt: null, verifiedAt: null, verifiedBy: "", sentBack: 0, createdBy: "Eli",
    createdAt: "2026-10-10T15:00:00Z", ...over,
  };
}
function item(over: Partial<WaitingItem>): WaitingItem {
  return { key: "k", lane: "decisions", kind: "decision", title: "Eli asks you", detail: "", href: "/app", at: null, ...over };
}
function input(over: Partial<MorningInput> = {}): MorningInput {
  return { day: DAY, owners: OWNERS, people: PEOPLE, schedule: [], tasks: [], reports: [], waiting: [], bids: 0, ...over };
}
const noteFor = (notes: ReturnType<typeof buildMorning>, email: string) => notes.find((n) => n.email === email);

describe("the 7 AM push", () => {
  it("gives each owner their own lanes, and a hand-off back to whoever gave it", () => {
    const notes = buildMorning(
      input({
        waiting: [
          item({ title: "Eli asks you" }),
          item({ key: "h", kind: "signal", who: "Marco", title: "Eli · Order the Bambi lumber" }),
          item({ key: "m", lane: "money", title: "Hours: 2 time fixes" }),
        ],
        bids: 2,
        schedule: [slot({}), slot({ id: 2, email: MARCUS, jobId: "bambi", jobName: "6402 E Bambi Drive" })],
      }),
    );
    expect(noteFor(notes, MARCO)).toMatchObject({
      title: "Your day: 1 decision, 1 to watch, 2 bids",
      body: "Eli asks you; Eli · Order the Bambi lumber · 2 people on 2 jobs today. · No plan from Eli for today.",
      url: "/app",
      tag: `morning-${DAY}`,
    });
    expect(noteFor(notes, LANDO)?.title).toBe("Your day: 1 decision");
    expect(noteFor(notes, INFO)?.body).toContain("Hours: 2 time fixes");
    expect(noteFor(notes, LANDO)?.body).not.toContain("Eli asks");
  });

  it("still tells an owner the day is quiet", () => {
    const notes = buildMorning(input({ reports: [{ id: 1, day: DAY } as MorningInput["reports"][number]] }));
    expect(noteFor(notes, MARCO)).toMatchObject({ title: "Your day: nothing waiting on you", body: "Nobody is on the schedule today." });
  });

  it("gives the supervisor the crew and what is theirs to check, never their own work", () => {
    const notes = buildMorning(
      input({
        schedule: [slot({ ack: "ok" }), slot({ id: 2, email: MARCUS }), slot({ id: 3, email: ELI })],
        tasks: [
          task({ status: "done", reportedAt: "2026-10-12T22:00:00Z" }),
          task({ id: 2, email: MARCUS, due: DAY }),
          task({ id: 3, email: ELI, title: "Order the Bambi lumber", due: DAY, createdBy: "Marco" }),
        ],
      }),
    );
    expect(noteFor(notes, ELI)).toEqual({
      email: ELI,
      title: "Your day",
      body: "3 people on 1 job today. · 1 not confirmed yet · 1 task to check · 1 task due today · 1 hand-off due from you",
      url: "/app/crew",
      tag: `morning-${DAY}`,
    });
  });

  it("gives a project manager only the jobs they are on", () => {
    const pmPeople = PEOPLE.map((p) => (p.email === ELI ? { ...p, perms: [...p.perms, "projects.mine"] } : p)) as MorningInput["people"];
    const notes = buildMorning(
      input({
        people: pmPeople,
        jobPeople: [{ jobId: "keim", email: ELI, role: "pm" }],
        schedule: [slot({}), slot({ id: 2, email: MARCUS, jobId: "bambi", jobName: "6402 E Bambi Drive" })],
        tasks: [task({ status: "done", reportedAt: "2026-10-12T22:00:00Z", jobId: "bambi" }), task({ id: 2, due: DAY })],
      }),
    );
    expect(noteFor(notes, ELI)?.body).toBe("1 person on 1 job today. · 1 not confirmed yet · 1 task due today");
  });

  it("tells a worker where they are going, in their language, and skips anyone off today", () => {
    const notes = buildMorning(input({ schedule: [slot({})], tasks: [task({}), task({ id: 2, title: "Tape the hallway", due: DAY })] }));
    expect(noteFor(notes, ARNOLD)).toMatchObject({
      title: "Tu día, mar 13 oct",
      body: "12729 W Keim Dr a las 7:00 AM. 2 tareas, primero: Tape the hallway.",
    });
    expect(noteFor(notes, MARCUS)).toBeUndefined();
  });

  it("sends nothing on Sunday", () => {
    expect(buildMorning(input({ day: "2026-10-18" }))).toEqual([]);
  });
});

describe("late from the field, folded into the 7 AM push", () => {
  const late = (over: Partial<MorningInput["late"] extends (infer T)[] | undefined ? T : never>) => ({
    day: "2026-10-12",
    id: 1,
    who: "Arnold",
    job: "12729 W Keim Dr",
    text: "no clock-in by 7:30",
    at: "2026-10-12T14:31:00Z",
    ...over,
  });
  const quiet = { reports: [{ id: 1, day: DAY } as MorningInput["reports"][number]] };

  it("tells an owner what came in late yesterday, after the rest of the day", () => {
    const notes = buildMorning(input({ ...quiet, late: [late({})] }));
    expect(noteFor(notes, MARCO)?.body).toBe("Nobody is on the schedule today. · Late from the field: Arnold · 12729 W Keim Dr: no clock-in by 7:30");
    expect(noteFor(notes, LANDO)?.body).toContain("Late from the field");
  });

  it("names the first and counts the rest, within the push's length", () => {
    const notes = buildMorning(
      input({
        ...quiet,
        late: [late({}), late({ id: 2, who: "Marcus", text: "clocked out at 4:10, given afterwards" }), late({ id: 3, who: "Beto", text: "end of day at 9 PM" })],
      }),
    );
    const body = noteFor(notes, MARCO)?.body ?? "";
    expect(body).toContain("Late from the field: Arnold · 12729 W Keim Dr: no clock-in by 7:30 (+2 more)");
    expect(body).not.toContain("Marcus");
    expect(body.length).toBeLessThanOrEqual(240);
  });

  it("reaches back to Saturday on a Monday, and no further", () => {
    const monday = "2026-10-19";
    const notes = buildMorning(input({ ...quiet, day: monday, late: [late({ day: "2026-10-16", id: 1, who: "Friday" }), late({ day: "2026-10-17", id: 2, who: "Saturday" })] }));
    expect(noteFor(notes, MARCO)?.body).toContain("Late from the field: Saturday");
    expect(noteFor(notes, MARCO)?.body).not.toContain("Friday");
    // Today's and tomorrow's are not yesterday's.
    const none = buildMorning(input({ ...quiet, late: [late({ day: DAY }), late({ day: "2026-10-14", id: 2 })] }));
    expect(noteFor(none, MARCO)?.body).toBe("Nobody is on the schedule today.");
  });

  it("gives the supervisor the same, and a project manager only their jobs' by name", () => {
    const all = buildMorning(input({ late: [late({})] }));
    expect(noteFor(all, ELI)?.body).toBe("Nobody is on the schedule today. · Late from the field: Arnold · 12729 W Keim Dr: no clock-in by 7:30");
    const pmPeople = PEOPLE.map((p) => (p.email === ELI ? { ...p, perms: [...p.perms, "projects.mine"] } : p)) as MorningInput["people"];
    const narrowed = (jobs: MorningInput["jobs"], items: NonNullable<MorningInput["late"]>) =>
      noteFor(buildMorning(input({ people: pmPeople, jobPeople: [{ jobId: "keim", email: ELI, role: "pm" }], jobs, late: items })), ELI)?.body ?? "";
    expect(narrowed([{ id: "keim", name: "12729 W Keim Dr" }], [late({})])).toContain("Late from the field: Arnold");
    expect(narrowed([{ id: "keim", name: "12729 W Keim Dr" }], [late({ job: "6402 E Bambi Drive" })])).not.toContain("Late from the field");
    // The Mac may name the job by its id too.
    expect(narrowed([], [late({ job: "keim" })])).toContain("Late from the field: Arnold · keim");
    // An owner is never narrowed.
    expect(noteFor(buildMorning(input({ people: pmPeople, jobPeople: [{ jobId: "keim", email: ELI, role: "pm" }], late: [late({ job: "6402 E Bambi Drive" })] })), MARCO)?.body).toContain("Bambi");
  });
});
