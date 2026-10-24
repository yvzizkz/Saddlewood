import { describe, expect, it } from "vitest";

import { canCloseHere, feedForSeat, forFieldLead, withoutMoney, type FeedItem } from "../feed";

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
  item("pc1", { source: "billing", kind: "billing", role: "pm", nowRole: "decisions", escalated: true }),
  item("q1", { source: "waiting", role: "decisions", nowRole: "decisions" }),
  item("o1", { source: "ops", role: "pm" }),
  item("b1", { source: "bill", kind: "approval", jobKey: "8009-n-ironwood-dr", editable: false }),
  item("c1", { source: "crew", role: "field_lead", jobKey: "8009-n-ironwood-dr", editable: false }),
];

describe("feedForSeat", () => {
  it("gives an owner the whole feed", () => {
    expect(feedForSeat(feed, null, () => false)).toHaveLength(feed.length);
  });

  it("gives a PM their jobs and their seat's no-job work (also once moved up), never the owners' list, the ops board or bills", () => {
    const mine = (i: FeedItem) => i.nowRole === "pm";
    expect(feedForSeat(feed, new Set(["8009-n-ironwood-dr"]), mine).map((i) => i.id)).toEqual(["w1", "w3", "pc1", "c1"]);
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

describe("withoutMoney", () => {
  it("leaves a field lead the work and crew tasks, never billing, bills, waivers or accounting links", () => {
    const xs = [
      ...feed,
      item("wvib9", { source: "billing", kind: "compliance" }),
      item("w5", { href: "/app/accounting/receivables" }),
      item("w6", { href: "/app/money/12" }),
    ];
    expect(withoutMoney(xs).map((i) => i.id)).toEqual(["w1", "w2", "w3", "w4", "q1", "o1", "c1"]);
  });
});

describe("forFieldLead", () => {
  it("drops the PM's work with no job, keeps the lead's own and the field lead's seat's, and every job item", () => {
    const xs = [
      item("pmfree", { role: "pm", nowRole: "pm", detail: "$4,800 deposit to chase" }),
      item("leadfree", { role: "field_lead", nowRole: "field_lead" }),
      item("handed", { role: "pm", assignee: "arnold@x.com" }),
      item("onjob", { role: "pm", jobKey: "8009-n-ironwood-dr" }),
      item("pc2", { source: "billing", kind: "billing", jobKey: "8009-n-ironwood-dr" }),
    ];
    const mine = (i: FeedItem) => i.assignee === "arnold@x.com";
    expect(forFieldLead(xs, mine).map((i) => i.id)).toEqual(["leadfree", "handed", "onjob"]);
  });
});
