import { describe, expect, it } from "vitest";

import { buildWaiting, type WaitingInput } from "@/lib/owner/waiting";
import { placeMoney, summarizeJobMoney } from "../jobMoney";
import { isPayWhenPaid, ladderClock } from "../ladder";
import { buildOverview, type DocRow } from "../overview";
import type { BillingProfile, DocumentEvent } from "../types";

// Pay-when-paid (Lando, 2026-10-13): a client paid only after their own client
// pays them is not chased by the past-due ladder until an owner gives the bill
// a due date. Schifferer Built (Bellevue, SB-100526) is the first one.

const SCHIFFERER = "80d774df-f749-412e-9efd-9ed87d999728";
const AFT = "435e8af8-09da-4e3d-ab54-bf3d73c04cf6";
const BELLEVUE_JOB = "edab5137-117f-4c0e-9d22-2f914d181b01";

const sb100526: DocRow = {
  id: "sb",
  kind: "statement",
  job_id: null,
  client_id: SCHIFFERER,
  number: "SB-100526",
  title: "Open invoice as of October 5, 2026",
  status: "issued",
  revision: 1,
  snapshot: {
    lines: [
      { description: "Invoice 9146-90929 · First phase of framing, Franklin Hall", amountCents: 1320000 },
      { description: "Invoice 9146-90929 · Overhead", amountCents: 264000 },
    ],
  },
  total_cents: 1584000,
  due_date: null,
  token: "t",
  issued_at: "2026-10-05T21:15:00Z",
  created_at: "2026-10-05T21:15:00Z",
};
const aft100526: DocRow = { ...sb100526, id: "aft", client_id: AFT, number: "AFT-100526", total_cents: 6093019, snapshot: {} };

const sent = (documentId: string): DocumentEvent => ({
  id: 1,
  documentId,
  kind: "sent",
  at: "2026-10-05T21:15:02Z",
  actor: "lando",
  automatic: false,
  emailId: null,
  detail: {},
});

function overview(today: string, schiffererBilling: BillingProfile, rows: DocRow[] = [sb100526, aft100526]) {
  return buildOverview({
    today,
    rows,
    paid: new Map(),
    events: new Map(rows.map((r) => [r.id, [sent(r.id)]])),
    clients: new Map([
      [SCHIFFERER, { name: "Schifferer Built, LLC", billing: schiffererBilling }],
      [AFT, { name: "A Finer Touch Construction LLC", billing: {} }],
    ]),
    jobs: new Map(),
  });
}

function waiting(money: ReturnType<typeof overview>): string[] {
  const input: WaitingInput = { now: new Date("2026-10-13T15:00:00Z"), people: [], reports: [], tasks: [], jobs: [], timefixes: 0, reviews: 0, money };
  return buildWaiting(input)
    .filter((i) => i.key.startsWith("late-"))
    .map((i) => `${i.lane}: ${i.title}`);
}

describe("pay-when-paid", () => {
  it("is set by any payWhenPaidDays, and a job's own setting wins over the client's", () => {
    expect(isPayWhenPaid({ payWhenPaidDays: 10 })).toBe(true);
    expect(isPayWhenPaid({ payWhenPaidDays: 0 })).toBe(true);
    expect(isPayWhenPaid({})).toBe(false);
    expect(isPayWhenPaid(null, null)).toBe(false);
    expect(isPayWhenPaid({ payWhenPaidDays: 10 }, { payWhenPaidDays: null })).toBe(false);
    expect(isPayWhenPaid({}, { payWhenPaidDays: 5 })).toBe(true);
    expect(isPayWhenPaid({ payWhenPaidDays: 10 }, { netDays: 30 })).toBe(true);
  });

  it("has no ladder clock without a due date; with one it counts like any bill", () => {
    expect(ladderClock(null, "2026-10-05T21:15:02Z", true)).toBeNull();
    expect(ladderClock(null, "2026-10-05T21:15:02Z", false)).toBe("2026-10-05");
    expect(ladderClock("2026-11-20", "2026-10-05T21:15:02Z", true)).toBe("2026-11-20");
    expect(ladderClock(null, null, false)).toBeNull();
  });

  it("before the mark: SB-100526 is an Ilene call on 10/13 and Marco's on 10/19", () => {
    expect(waiting(overview("2026-10-13", {}))).toContain("money: Call Schifferer Built, LLC: SB-100526 is 8 days late");
    expect(waiting(overview("2026-10-19", {}))).toContain("decisions: Call Schifferer Built, LLC: SB-100526 is 14 days late");
  });

  it("with Schifferer marked: SB-100526 drops out on 10/13 and 10/19, AFT stays", () => {
    for (const today of ["2026-10-13", "2026-10-19", "2026-11-30"]) {
      const o = overview(today, { payWhenPaidDays: 10, delivery: "portal" });
      const sb = o.clients.flatMap((c) => c.documents).find((d) => d.doc.number === "SB-100526")!;
      expect(sb).toMatchObject({ payWhenPaid: true, next: null, balanceCents: 1584000 });
      const calls = waiting(o);
      expect(calls.some((c) => c.includes("Schifferer"))).toBe(false);
      expect(calls.some((c) => c.includes("AFT-100526"))).toBe(true);
    }
  });

  it("chases again once an owner gives it a due date", () => {
    const dated = { ...sb100526, due_date: "2026-10-30" };
    expect(waiting(overview("2026-11-07", { payWhenPaidDays: 10 }, [dated]))).toEqual(["money: Call Schifferer Built, LLC: SB-100526 is 8 days late"]);
  });

  it("shows on the money card as pay-when-paid, owed but not past due", () => {
    const doc = {
      id: "sb",
      kind: "statement" as const,
      jobId: null,
      clientId: SCHIFFERER,
      number: "SB-100526",
      title: "",
      status: "issued" as const,
      revision: 1,
      supersedes: null,
      snapshot: sb100526.snapshot as never,
      totalCents: 1584000,
      dueDate: null,
      token: "t",
      issuedAt: "2026-10-05T21:15:00Z",
      issuedBy: "",
      voidReason: "",
      createdAt: "2026-10-05T21:15:00Z",
    };
    const { byJob } = placeMoney({
      documents: [doc],
      paid: new Map(),
      firstSent: new Map([["sb", "2026-10-05T21:15:02Z"]]),
      jobs: [{ id: BELLEVUE_JOB, prefix: "9146", billing: {} }],
      clients: new Map([[SCHIFFERER, { payWhenPaidDays: 10 }]]),
    });
    const m = summarizeJobMoney(BELLEVUE_JOB, byJob.get(BELLEVUE_JOB) ?? [], 1584000, "2026-10-19");
    expect(m).toMatchObject({ billedCents: 1584000, owedCents: 1584000, pastDueCents: 0 });
    expect(m.open.every((o) => o.payWhenPaid && o.daysLate === null)).toBe(true);
  });
});
