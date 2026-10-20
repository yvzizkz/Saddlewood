import { describe, expect, it } from "vitest";

import { canCloseHere, feedForSeat, type FeedItem } from "../feed";

// A project manager's Tasks: their jobs, their own no-job work, and never the
// owners' waiting list, the ops board or sub bills.

const item = (id: string, over: Partial<FeedItem>): FeedItem => ({
  id,
  source: "work",
  kind: "task",
  title: id,
  detail: "",
  role: "pm",
  nowRole: "pm",
  assignee: "",
  jobKey: null,
  job: "",
  dueOn: null,
  since: null,
  overdueDays: 0,
  escalated: false,
  href: "/app/tasks",
  editable: true,
  ...over,
});

const feed = [
  item("w1", { jobKey: "8009-n-ironwood-dr" }),
  item("w2", { jobKey: "4125-camelback", role: "decisions", nowRole: "decisions" }),
  item("w3", { role: "pm" }),
  item("w4", { role: "finance", nowRole: "finance" }),
  item("q1", { source: "waiting", role: "decisions", nowRole: "decisions" }),
  item("o1", { source: "ops", role: "pm" }),
  item("b1", { source: "bill", kind: "approval", jobKey: "8009-n-ironwood-dr", editable: false }),
  item("c1", { source: "crew", role: "field_lead", jobKey: "8009-n-ironwood-dr", editable: false }),
];

describe("feedForSeat", () => {
  it("gives an owner the whole feed", () => {
    expect(feedForSeat(feed, null, () => false)).toHaveLength(feed.length);
  });

  it("gives a PM their jobs and their own no-job work, never the owners' list, the ops board or bills", () => {
    const mine = (i: FeedItem) => i.role === "pm";
    expect(feedForSeat(feed, new Set(["8009-n-ironwood-dr"]), mine).map((i) => i.id)).toEqual(["w1", "w3", "c1"]);
  });
});

describe("feedForSeat and Payables", () => {
  const waivers = [
    item("wvi77", { source: "billing", kind: "compliance", role: "finance", nowRole: "finance", jobKey: "8009-n-ironwood-dr", title: "Collect Sonoran's waiver for 2041", detail: "$4,250.00 · conditional progress", href: "/app/accounting/payables/bill/77", editable: false }),
    item("wvo12", { source: "billing", kind: "compliance", role: "finance", nowRole: "finance", jobKey: "8009-n-ironwood-dr", title: "Waiver for 8009-13 (A Finer Touch)", href: "/app/money/12", editable: false }),
  ];

  it("keeps a sub's waiver (its bill amount and Payables link) from a PM, on their own job", () => {
    const pm = feedForSeat(waivers, new Set(["8009-n-ironwood-dr"]), () => false);
    expect(pm.map((i) => i.id)).toEqual(["wvo12"]);
    expect(pm.some((i) => i.href.startsWith("/app/accounting/payables") || i.detail.includes("4,250"))).toBe(false);
  });

  it("leaves the owners' view as it was", () => {
    expect(feedForSeat(waivers, null, () => false).map((i) => i.id)).toEqual(["wvi77", "wvo12"]);
  });
});

describe("canCloseHere", () => {
  it("lets an owner close any work item and a PM only work with the PM's or field lead's seat", () => {
    expect(canCloseHere({ editable: true, role: "finance" }, true)).toBe(true);
    expect(canCloseHere({ editable: true, role: "finance" }, false)).toBe(false);
    expect(canCloseHere({ editable: true, role: "field_lead" }, false)).toBe(true);
    expect(canCloseHere({ editable: false, role: "pm" }, false)).toBe(false);
  });
});
