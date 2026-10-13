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
