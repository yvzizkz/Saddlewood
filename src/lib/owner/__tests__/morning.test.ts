import { describe, expect, it } from "vitest";

import type { CrewScheduleItem, CrewTask } from "@/lib/crew/types";
import { peopleOf, type Seat } from "@/lib/roles/seats";
import type { FeedItem } from "@/lib/tasks/feed";
import { buildMorning, type MorningInput } from "../morning";
import { leadOf, mineOf } from "@/lib/tasks/mine";
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
  // The PM: money.view, so covering the empty Field lead seat does not narrow him to a field lead's cut.
  { email: ELI, name: "Eli Ramos", lang: "en", active: true, perms: ["clock", "tasks.verify", "plan.send", "updates", "money.view"] },
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

// The one task feed (tasks/feed.ts), as loadFeed hands it over.
const ILENE = "ilene@saddlewoodcontracting.com";
const SEATS: Seat[] = [
  { role: "decisions", holder: "Marco", backup: "Lando", note: "", updatedBy: "", updatedAt: null },
  { role: "sales", holder: "Marco", backup: "Lando", note: "", updatedBy: "", updatedAt: null },
  { role: "finance", holder: "Ilene", backup: "Lando", note: "", updatedBy: "", updatedAt: null },
  { role: "ops", holder: "Lando", backup: "Marco", note: "", updatedBy: "", updatedAt: null },
  { role: "pm", holder: "Eli", backup: "Marco", note: "", updatedBy: "", updatedAt: null },
  { role: "field_lead", holder: "", backup: "Eli", note: "", updatedBy: "", updatedAt: null },
];
const SEAT_PEOPLE = peopleOf({ ...OWNERS, [ILENE]: { name: "Ilene", role: "requester" } }, PEOPLE);
const REFS = [
  { key: "keim", crewId: "keim" },
  { key: "bambi", crewId: "bambi" },
];
function feedItem(id: string, over: Partial<FeedItem>): FeedItem {
  return { id, source: "work", kind: "task", title: id, detail: "", role: "pm", nowRole: "pm", assignee: "", jobKey: null, job: "", dueOn: null, since: null, overdueDays: 0, escalated: false, href: "/app/tasks", editable: true, ...over };
}
/** Due on a day, and how late that is on DAY (loadFeed's placeItem). */
function due(dueOn: string): Pick<FeedItem, "dueOn" | "overdueDays"> {
  return { dueOn, overdueDays: Math.max(0, Math.round((Date.parse(`${DAY}T12:00:00Z`) - Date.parse(`${dueOn}T12:00:00Z`)) / 86_400_000)) };
}
function withFeed(feed: FeedItem[]): Pick<MorningInput, "feed" | "seats" | "seatPeople" | "refs"> {
  return { feed, seats: SEATS, seatPeople: SEAT_PEOPLE, refs: REFS };
}

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
        // Their own hand-off reaches them through the feed, as Tasks shows it.
        ...withFeed([feedItem("c3", { source: "crew", role: "field_lead", nowRole: "field_lead", assignee: ELI, title: "Order the Bambi lumber", jobKey: "keim", job: "12729 W Keim Dr", dueOn: DAY })]),
      }),
    );
    expect(noteFor(notes, ELI)).toEqual({
      email: ELI,
      title: "Your day",
      body: "Yours: 1 due today · Oldest: Order the Bambi lumber (12729 W Keim Dr) · 3 people on 1 job today. · 1 not confirmed yet · 1 task to check · 1 crew task due today",
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
    expect(noteFor(notes, ELI)?.body).toBe("1 person on 1 job today. · 1 not confirmed yet · 1 crew task due today");
  });

  it("tells a worker where they are going, in their language, and skips anyone off today", () => {
    const crew = (id: string, over: Partial<FeedItem>) => feedItem(id, { source: "crew", role: "field_lead", nowRole: "field_lead", assignee: ARNOLD, jobKey: "keim", job: "12729 W Keim Dr", ...over });
    const notes = buildMorning(input({ schedule: [slot({})], ...withFeed([crew("c1", { title: "Hang the garage ceiling" }), crew("c2", { title: "Tape the hallway", dueOn: DAY })]) }));
    expect(noteFor(notes, ARNOLD)).toMatchObject({
      title: "Tu día, mar 13 oct",
      body: "12729 W Keim Dr a las 7:00 AM. 2 tareas (1 para hoy), primero: Tape the hallway.",
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

describe("the 7 AM push reads the one task feed", () => {
  const quiet = { reports: [{ id: 1, day: DAY } as MorningInput["reports"][number]] };
  const pmPeople = PEOPLE.map((p) => (p.email === ELI ? { ...p, perms: [...p.perms, "projects.mine", "money.view"] } : p)) as MorningInput["people"];
  const FEED = [
    // A sub bill unapproved past SOP-004's 10 days: moved up from the PM to the owners' decisions.
    feedItem("b7", { source: "bill", kind: "approval", title: "Approve Desert Plumbing 1042", job: "6402 E Bambi Drive", jobKey: "bambi", role: "pm", nowRole: "decisions", escalated: true, ...due("2026-10-09"), editable: false, href: "/app/accounting/payables/bill/7" }),
    feedItem("w1", { title: "Call the inspector", role: "decisions", nowRole: "decisions", ...due(DAY) }),
    feedItem("w2", { title: "Renew the COI", role: "ops", nowRole: "ops", ...due("2026-10-12") }),
    // The PM's: one on their job, one on a job they are not on, one with no job.
    feedItem("w3", { title: "Walk Keim with the client", jobKey: "keim", job: "12729 W Keim Dr", ...due("2026-10-11") }),
    feedItem("w4", { title: "Walk Bambi with the client", jobKey: "bambi", job: "6402 E Bambi Drive", ...due("2026-10-11") }),
    feedItem("w5", { title: "Send the PM checklist", ...due(DAY) }),
    // Finance: the invoice package, and a waiver we owe.
    feedItem("pkc1:2026-10-15", { source: "billing", kind: "billing", title: "Invoice package for Optima", role: "finance", nowRole: "finance", ...due("2026-10-15"), editable: false, href: "/app/accounting/billing" }),
    feedItem("wvo9", { source: "billing", kind: "compliance", title: "Waiver for Draw 3 (Optima)", role: "finance", nowRole: "finance", jobKey: "keim", job: "12729 W Keim Dr", editable: false, href: "/app/accounting/billing" }),
    // A worker's crew task, two days late: moved up to the PM, still the worker's.
    feedItem("c11", { source: "crew", title: "Hang the garage ceiling", role: "field_lead", nowRole: "pm", escalated: true, assignee: ARNOLD, jobKey: "keim", job: "12729 W Keim Dr", ...due("2026-10-11"), editable: false }),
  ];
  const notes = buildMorning(
    input({ ...quiet, ...withFeed(FEED), people: pmPeople, jobPeople: [{ jobId: "keim", email: ELI, role: "pm" }], schedule: [slot({ ack: "ok" })] }),
  );

  it("leads an owner's push with what is overdue, due today and moved up to them, and the oldest", () => {
    expect(noteFor(notes, MARCO)).toMatchObject({
      title: "Your day: 1 overdue, 1 due today, 1 moved up to you",
      body: "Oldest: Approve Desert Plumbing 1042 (6402 E Bambi Drive), 4 days late · 1 person on 1 job today.",
    });
    // Lando holds ops: the COI is his, the decisions are not.
    expect(noteFor(notes, LANDO)).toMatchObject({ title: "Your day: 1 overdue", body: "Oldest: Renew the COI, 1 day late · 1 person on 1 job today." });
  });

  it("gives a project manager only their jobs' work and their own, never bills or another job's", () => {
    const body = noteFor(notes, ELI)?.body ?? "";
    // Keim (their job, 2 days late), the crew task moved up to them, the no-job checklist due today.
    expect(body.startsWith("Yours: 2 overdue, 1 due today, 1 moved up to you · Oldest: Walk Keim with the client (12729 W Keim Dr), 2 days late")).toBe(true);
    expect(body).not.toContain("Bambi");
    expect(body).not.toContain("Desert Plumbing");
    expect(body).not.toContain("Invoice package");
  });

  it("gives finance their tasks, though they are not on the crew", () => {
    expect(noteFor(notes, ILENE)).toEqual({
      email: ILENE,
      title: "Your day: 2 open tasks",
      body: "Oldest: Invoice package for Optima",
      url: "/app/tasks",
      tag: `morning-${DAY}`,
    });
  });

  it("gives a worker their own list from the feed, late first", () => {
    expect(noteFor(notes, ARNOLD)?.body).toBe("12729 W Keim Dr a las 7:00 AM. 1 tarea (1 atrasada), primero: Hang the garage ceiling.");
  });

  it("buzzes nobody extra for a seat with nothing on it", () => {
    const none = buildMorning(input({ ...quiet, ...withFeed([]) }));
    expect(noteFor(none, ILENE)).toBeUndefined();
  });
});

describe("a field lead's 7 AM push (no money, jobs/access.ts)", () => {
  // Marcus holds the Field lead seat: a crew lead who checks work, without money.view, on Keim.
  const seats = SEATS.map((x) => (x.role === "field_lead" ? { ...x, holder: "Marcus" } : x));
  const people = PEOPLE.map((p) => (p.email === MARCUS ? { ...p, perms: ["clock", "tasks.verify"] } : p)) as MorningInput["people"];
  const FEED = [
    feedItem("f1", { title: "Frame the Keim soffit", role: "field_lead", nowRole: "field_lead", jobKey: "keim", job: "12729 W Keim Dr", ...due("2026-10-12") }),
    feedItem("f2", { title: "Pick up the Keim permit", role: "field_lead", nowRole: "field_lead", ...due(DAY) }),
    // Theirs by seat, but it carries dollars: not on a field lead's push.
    feedItem("f3", { source: "billing", kind: "billing", title: "Keim draw backup $12,400", role: "field_lead", nowRole: "field_lead", jobKey: "keim", job: "12729 W Keim Dr", ...due("2026-10-10"), editable: false, href: "/app/accounting/billing" }),
    // The PM's own work with no job: the PM's, not the field's.
    feedItem("w5", { title: "Send the PM checklist", ...due(DAY) }),
    // The field's work on a job Marcus is not on (Bambi): not his, though he holds the seat.
    feedItem("f4", { title: "Frame the Bambi soffit", role: "field_lead", nowRole: "field_lead", jobKey: "bambi", job: "6402 E Bambi Drive", ...due("2026-10-08") }),
  ];
  const run = (perms: string[]) =>
    buildMorning(
      input({
        reports: [{ id: 1, day: DAY } as MorningInput["reports"][number]],
        feed: FEED,
        seats,
        seatPeople: peopleOf({ ...OWNERS }, people),
        refs: REFS,
        people: people.map((p) => (p.email === MARCUS ? { ...p, perms } : p)) as MorningInput["people"],
        jobPeople: [{ jobId: "keim", email: MARCUS, role: "supervisor" }],
      }),
    );

  it("counts what their Home and Tasks show, and names nothing that carries dollars", () => {
    const body = noteFor(run(["clock", "tasks.verify"]), MARCUS)?.body ?? "";
    expect(body.startsWith("Yours: 1 overdue, 1 due today · Oldest: Frame the Keim soffit (12729 W Keim Dr), 1 day late")).toBe(true);
    expect(body).not.toContain("draw backup");
    expect(body).not.toMatch(/\$\s?\d/);
    expect(body).not.toContain("PM checklist");
  });

  it("names only the jobs they are on, without projects.mine, and counts what Home and Tasks count", () => {
    const body = noteFor(run(["clock", "tasks.verify"]), MARCUS)?.body ?? "";
    expect(body).not.toContain("Bambi");
    // Home's Your tasks and Tasks' Mine for this seat (tasks/mine.ts with the seat's jobs and no money): f1 and f2.
    const home = mineOf(FEED, { email: MARCUS, owner: false, jobs: new Set(["keim"]), money: false }, seats, peopleOf({ ...OWNERS }, people));
    expect(home.map((i) => i.id).sort()).toEqual(["f1", "f2"]);
    const lead = leadOf(home, DAY);
    expect(body.startsWith(`Yours: ${lead.overdue} overdue, ${lead.dueToday} due today ·`)).toBe(true);
  });

  it("keeps the money item for a lead who has money.view", () => {
    // f1, the draw backup and Bambi overdue: with money.view he is not a field lead's seat (jobs/access.ts).
    expect(noteFor(run(["clock", "tasks.verify", "money.view"]), MARCUS)?.body.startsWith("Yours: 3 overdue, 1 due today")).toBe(true);
  });
});

describe("the 7 AM push and the seats (Ship's review of #62)", () => {
  const quiet = { reports: [{ id: 1, day: DAY } as MorningInput["reports"][number]] };

  it("never buzzes a worker off today, whatever is on their list", () => {
    const notes = buildMorning(
      input({
        ...quiet,
        ...withFeed([
          feedItem("c1", { source: "crew", role: "field_lead", nowRole: "field_lead", assignee: ARNOLD, jobKey: "keim", ...due("2026-10-12"), editable: false }),
          feedItem("w9", { role: "field_lead", nowRole: "field_lead", assignee: ARNOLD, title: "Sweep the garage" }),
        ]),
      }),
    );
    expect(noteFor(notes, ARNOLD)).toBeUndefined();
  });

  it("gives a finance seat off the crew their bills on hold, sub waivers and ops cards", () => {
    const notes = buildMorning(
      input({
        ...quiet,
        ...withFeed([
          feedItem("b4", { source: "bill", kind: "compliance", title: "Clear the hold on Desert Plumbing 1042", role: "finance", nowRole: "finance", jobKey: "bambi", job: "6402 E Bambi Drive", ...due("2026-10-10"), href: "/app/accounting/payables/bill/4", editable: false }),
          feedItem("wvi4", { source: "billing", kind: "compliance", title: "Collect Desert Plumbing's waiver", role: "finance", nowRole: "finance", jobKey: "bambi", href: "/app/accounting/payables/bill/4", editable: false }),
          feedItem("oops1", { source: "ops", kind: "friction", title: "Fix the QuickBooks sync", role: "finance", nowRole: "finance", href: "/internal/ops", editable: false }),
        ]),
      }),
    );
    expect(noteFor(notes, ILENE)).toMatchObject({ title: "Your day: 1 overdue", body: "Oldest: Clear the hold on Desert Plumbing 1042 (6402 E Bambi Drive), 3 days late · 3 tasks open in all" });
  });

  it("never tells an owner nothing is waiting while naming their oldest task", () => {
    const notes = buildMorning(input({ ...quiet, ...withFeed([feedItem("w1", { title: "Call the inspector", role: "decisions", nowRole: "decisions" }), feedItem("w2", { title: "Book the dumpster", role: "decisions", nowRole: "decisions", dueOn: "2026-10-20" })]) }));
    expect(noteFor(notes, MARCO)).toMatchObject({ title: "Your day: 2 open tasks", body: "Oldest: Book the dumpster · Nobody is on the schedule today." });
    // Nothing at all: still the quiet day.
    expect(noteFor(buildMorning(input({ ...quiet, ...withFeed([]) })), MARCO)?.title).toBe("Your day: nothing waiting on you");
  });

  it("always leads a project manager's own work with Yours", () => {
    const pmPeople = PEOPLE.map((p) => (p.email === ELI ? { ...p, perms: [...p.perms, "projects.mine"] } : p)) as MorningInput["people"];
    const notes = buildMorning(input({ ...quiet, people: pmPeople, jobPeople: [{ jobId: "keim", email: ELI, role: "pm" }], ...withFeed([feedItem("w5", { title: "Send the PM checklist" })]) }));
    expect(noteFor(notes, ELI)?.body).toBe("Yours: 1 open task · Oldest: Send the PM checklist · Nobody is on the schedule today.");
  });
});
