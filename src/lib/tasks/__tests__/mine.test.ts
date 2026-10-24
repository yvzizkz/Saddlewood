import { describe, expect, it } from "vitest";

import { peopleOf, type Seat } from "@/lib/roles/seats";
import type { FeedItem } from "../feed";
import { jobsOf, leadOf, mineOf, seatFeedOf, summaryOf } from "../mine";

// One person's Mine, shared by Tasks, the 7 AM push and Home's "Your tasks".

const DAY = "2026-10-13";
const MARCO = "marco@x.com";
const LANDO = "lando@x.com";
const ELI = "eli@x.com";
const ARNOLD = "arnold@x.com";
const people = peopleOf({ [MARCO]: { name: "Marco", role: "owner" }, [LANDO]: { name: "Lando", role: "owner" } } as never, [
  { email: ELI, name: "Eli Ramos" },
  { email: ARNOLD, name: "Arnold Mujica" },
]);
const seats: Seat[] = [
  { role: "decisions", holder: "Marco", backup: "Lando", note: "", updatedBy: "", updatedAt: null },
  { role: "ops", holder: "Lando", backup: "Marco", note: "", updatedBy: "", updatedAt: null },
  { role: "pm", holder: "Eli", backup: "Marco", note: "", updatedBy: "", updatedAt: null },
  { role: "field_lead", holder: "", backup: "Eli", note: "", updatedBy: "", updatedAt: null },
];
const item = (id: string, over: Partial<FeedItem>): FeedItem => ({
  id, source: "work", kind: "task", title: id, detail: "", role: "pm", nowRole: "pm", assignee: "", jobKey: null, job: "", dueOn: null, since: null,
  overdueDays: 0, escalated: false, href: `/x/${id}`, editable: true, ...over,
});

const FEED = [
  item("decide", { role: "decisions", nowRole: "decisions", dueOn: DAY }),
  // Lando handed it out; it comes back to him though the lane is Marco's.
  item("qhandoff-1", { source: "waiting", role: "decisions", nowRole: "decisions", backTo: "Lando", since: "2026-10-01" }),
  item("bill", { source: "bill", kind: "approval", role: "pm", nowRole: "decisions", escalated: true, dueOn: "2026-10-09", overdueDays: 4, href: "/app/accounting/payables/bill/7", jobKey: "bambi" }),
  item("keim", { jobKey: "keim", job: "12729 W Keim Dr", dueOn: "2026-10-11", overdueDays: 2 }),
  item("bambi", { jobKey: "bambi", job: "6402 E Bambi Drive", dueOn: "2026-10-10", overdueDays: 3 }),
  item("nojob", { dueOn: "2026-10-20" }),
  item("c1", { source: "crew", role: "field_lead", nowRole: "pm", escalated: true, assignee: ARNOLD, jobKey: "keim", dueOn: "2026-10-11", overdueDays: 2, editable: false }),
  item("c2", { source: "crew", role: "field_lead", nowRole: "field_lead", assignee: ELI, jobKey: "keim", editable: false }),
];
const REFS = [
  { key: "keim", crewId: "keim" },
  { key: "bambi", crewId: "bambi" },
  { key: "billing-only", crewId: null },
];
const ids = (xs: FeedItem[]) => xs.map((i) => i.id).sort();

describe("mineOf", () => {
  it("gives an owner their roles, what moved up to them, and a hand-off back to whoever gave it", () => {
    expect(ids(mineOf(FEED, { email: MARCO, owner: true, jobs: new Set() }, seats, people))).toEqual(["bill", "decide"]);
    expect(ids(mineOf(FEED, { email: LANDO, owner: true, jobs: new Set() }, seats, people))).toEqual(["qhandoff-1"]);
  });

  it("narrows a project manager to their jobs, and never bills or the owners' list", () => {
    const pm = mineOf(FEED, { email: ELI, owner: false, jobs: jobsOf(REFS, ["keim"]) }, seats, people);
    expect(ids(pm)).toEqual(["c1", "c2", "keim", "nojob"]);
  });

  it("gives a worker only what is assigned to them, moved up or not", () => {
    expect(ids(mineOf(FEED, { email: ARNOLD, owner: false, jobs: jobsOf(REFS, null) }, seats, people))).toEqual(["c1"]);
  });
});

describe("seatFeedOf", () => {
  it("gives an owner the whole feed, and a project manager their jobs with Mine inside it", () => {
    expect(ids(seatFeedOf(FEED, { email: MARCO, owner: true, jobs: null }, seats, people))).toEqual(ids(FEED));
    const seat = { email: ELI, owner: false, jobs: jobsOf(REFS, ["keim"]) };
    const everyone = seatFeedOf(FEED, seat, seats, people);
    expect(ids(everyone)).not.toContain("bambi");
    expect(ids(mineOf(FEED, seat, seats, people)).every((id) => ids(everyone).includes(id))).toBe(true);
  });
});

describe("jobsOf", () => {
  it("covers every job for no scope, and only the field jobs in scope otherwise", () => {
    expect([...jobsOf(REFS, null)]).toEqual(["keim", "bambi", "billing-only"]);
    expect([...jobsOf(REFS, ["keim"])]).toEqual(["keim"]);
  });
});

describe("leadOf and summaryOf", () => {
  const pm = mineOf(FEED, { email: ELI, owner: false, jobs: jobsOf(REFS, ["keim"]) }, seats, people);

  it("counts overdue, due today and moved up, oldest first", () => {
    expect(leadOf(pm, DAY)).toMatchObject({ count: 4, overdue: 2, dueToday: 0, movedUp: 1 });
    expect(leadOf(pm, DAY).oldest?.id).toBe("keim");
  });

  it("counts all of Mine but lists only what Home does not already show", () => {
    const s = summaryOf(pm, DAY, (i) => i.source === "crew" && i.assignee === ELI);
    expect(s).toMatchObject({ count: 4, overdue: 2, movedUp: 1 });
    expect(s.top.map((i) => i.id)).toEqual(["keim", "c1", "nojob"]);
    expect(s.top[0]).toEqual({ id: "keim", title: "keim", job: "12729 W Keim Dr", dueOn: "2026-10-11", overdueDays: 2, escalated: false, href: "/x/keim" });
    expect(summaryOf(pm, DAY, () => false, 1).top).toHaveLength(1);
  });
});
