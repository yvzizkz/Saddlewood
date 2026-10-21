import { describe, expect, it } from "vitest";

import { contractOf, invoiceNamedIn, jobOfNumber, placeMoney, summarizeJobMoney, type MoneyInput, type MoneyJob } from "../jobMoney";
import type { BillingDocument } from "../types";

const JURY = "11111111-1111-1111-1111-111111111111";
const RABBIT = "22222222-2222-2222-2222-222222222222";
const CHURCH = "33333333-3333-3333-3333-333333333333";
const JOBS: MoneyJob[] = [
  { id: JURY, prefix: "8009" },
  { id: RABBIT, prefix: "5203" },
  { id: CHURCH, prefix: null },
];

let n = 0;
function doc(p: Partial<BillingDocument> & Pick<BillingDocument, "kind" | "number">): BillingDocument {
  n += 1;
  return {
    id: `doc-${n}`,
    jobId: null,
    clientId: null,
    title: "",
    status: "issued",
    revision: 1,
    supersedes: null,
    snapshot: {},
    totalCents: 0,
    dueDate: null,
    token: "t",
    issuedAt: "2026-10-05T12:00:00Z",
    issuedBy: "marco@",
    voidReason: "",
    createdAt: "2026-10-05T12:00:00Z",
    ...p,
  };
}

function input(documents: BillingDocument[], extra: Partial<MoneyInput> = {}): MoneyInput {
  return { documents, paid: new Map(), firstSent: new Map(), jobs: JOBS, ...extra };
}

describe("which job a bill belongs to", () => {
  it("reads the invoice a statement line names", () => {
    expect(invoiceNamedIn("Invoice 8009-08 · Jury Residence (AFT 123) · Draw request 7")).toBe("8009-08");
    expect(invoiceNamedIn("invoice #5203-12 final")).toBe("5203-12");
    expect(invoiceNamedIn("Overhead")).toBeNull();
  });

  it("matches the number prefix, longest first, and never a near miss", () => {
    expect(jobOfNumber("8009-13", JOBS)).toBe(JURY);
    expect(jobOfNumber("80091-1", JOBS)).toBeNull();
    expect(jobOfNumber("CO-2", JOBS)).toBeNull();
    expect(jobOfNumber("8009-1", [...JOBS, { id: "x", prefix: "8009-1" }])).toBe(JURY);
    expect(jobOfNumber("8009-1-2", [...JOBS, { id: "x", prefix: "8009-1" }])).toBe("x");
  });

  it("splits a statement across the jobs its lines name", () => {
    const st = doc({
      kind: "statement",
      number: "AFT-100526",
      totalCents: 6093019,
      snapshot: {
        lines: [
          { description: "Invoice 5203-12 · Peter Rabbit Residence (AFT 125) · final bill", amountCents: 2542300 },
          { description: "Invoice 8009-08 · Jury Residence (AFT 123) · Draw request 7", amountCents: 2225719 },
          { description: "Invoice 4125-03 · Carder Remodel (AFT 129)", amountCents: 1325000 },
        ],
      },
    });
    const { byJob, unplaced } = placeMoney(
      input([st], { paid: new Map([[st.id, { total: 2225719, byLine: new Map([[1, 2225719]]) }]]) }),
    );
    expect(byJob.get(RABBIT)?.map((i) => [i.number, i.billedCents, i.paidCents])).toEqual([["5203-12", 2542300, 0]]);
    expect(byJob.get(JURY)?.map((i) => [i.number, i.billedCents, i.paidCents])).toEqual([["8009-08", 2225719, 2225719]]);
    // No job has the 4125 prefix yet: it waits for the owners, it is not dropped.
    expect(unplaced.map((i) => i.number)).toEqual(["4125-03"]);
  });

  it("does not bill an invoice twice when a statement also lists it", () => {
    const inv = doc({ kind: "invoice", number: "8009-13", totalCents: 964300 });
    const st = doc({
      kind: "statement",
      number: "AFT-1",
      snapshot: { lines: [{ description: "Invoice 8009-13 · change order", amountCents: 964300 }, { description: "Invoice 8009-08", amountCents: 100 }] },
    });
    const items = placeMoney(input([inv, st])).byJob.get(JURY) ?? [];
    expect(items.map((i) => i.number).sort()).toEqual(["8009-08", "8009-13"]);
    expect(items.reduce((s, i) => s + i.billedCents, 0)).toBe(964400);
  });

  it("prefers the document's own job, and puts a whole-job statement's lines on it", () => {
    const co = doc({ kind: "change_order", number: "CO-1", jobId: CHURCH, totalCents: 50000 });
    const st = doc({
      kind: "statement",
      number: "SB-100526",
      jobId: CHURCH,
      snapshot: { lines: [{ description: "Invoice 9146-90929 · First phase", amountCents: 1320000 }, { description: "Invoice 9146-90929 · Overhead", amountCents: 264000 }] },
    });
    const items = placeMoney(input([co, st])).byJob.get(CHURCH) ?? [];
    expect(items.map((i) => i.billedCents)).toEqual([50000, 1320000, 264000]);
  });

  it("leaves out void and draft documents, and estimates", () => {
    const docs = [
      doc({ kind: "invoice", number: "8009-14", totalCents: 1988186, status: "void", voidReason: "resent" }),
      doc({ kind: "invoice", number: "8009-15", totalCents: 1, status: "draft", token: null, issuedAt: null }),
      doc({ kind: "estimate", number: "8009-E1", totalCents: 99 }),
    ];
    const placed = placeMoney(input(docs));
    expect(placed.byJob.size).toBe(0);
    expect(placed.unplaced).toEqual([]);
  });

  it("puts money paid on a statement but on no line with the job only when the statement is one job's", () => {
    const one = doc({ kind: "statement", number: "S1", snapshot: { lines: [{ description: "Invoice 8009-01", amountCents: 1000 }, { description: "Invoice 8009-02", amountCents: 500 }] } });
    const two = doc({ kind: "statement", number: "S2", snapshot: { lines: [{ description: "Invoice 8009-03", amountCents: 1000 }, { description: "Invoice 5203-01", amountCents: 500 }] } });
    const placed = placeMoney(
      input([one, two], {
        paid: new Map([
          [one.id, { total: 700, byLine: new Map() }],
          [two.id, { total: 300, byLine: new Map() }],
        ]),
      }),
    );
    expect(placed.byJob.get(JURY)?.reduce((s, i) => s + i.paidCents, 0)).toBe(700);
    expect(placed.unplaced).toEqual([expect.objectContaining({ number: "S2", paidCents: 300, billedCents: 0 })]);
  });
});

describe("one job's money", () => {
  const today = "2026-10-13";

  it("adds billed, paid and owed, and counts past due from the day after the due date", () => {
    const due = doc({ kind: "invoice", number: "8009-13", totalCents: 964300, dueDate: "2026-10-12" });
    const today0 = doc({ kind: "invoice", number: "8009-14", totalCents: 1988186, dueDate: "2026-10-13" });
    const paidOff = doc({ kind: "invoice", number: "8009-08", totalCents: 2225719, dueDate: "2026-09-01" });
    const unsent = doc({ kind: "invoice", number: "8009-16", totalCents: 1000 });
    const { byJob } = placeMoney(
      input([due, today0, paidOff, unsent], {
        paid: new Map([
          [paidOff.id, { total: 2225719, byLine: new Map() }],
          [due.id, { total: 300, byLine: new Map() }],
        ]),
      }),
    );
    const m = summarizeJobMoney(JURY, byJob.get(JURY) ?? [], 40000000, today);
    expect(m.contractCents).toBe(40000000);
    expect(m.billedCents).toBe(964300 + 1988186 + 2225719 + 1000);
    expect(m.paidCents).toBe(2225719 + 300);
    expect(m.owedCents).toBe(964000 + 1988186 + 1000);
    expect(m.pastDueCents).toBe(964000);
    expect(m.open.map((o) => [o.number, o.daysLate])).toEqual([
      ["8009-13", 1],
      ["8009-14", 0],
      ["8009-16", null],
    ]);
  });

  it("counts a bill with no due date from the day it was first sent", () => {
    const st = doc({ kind: "statement", number: "S", jobId: JURY, snapshot: { lines: [{ description: "Draw 7", amountCents: 5000 }] } });
    const { byJob } = placeMoney(input([st], { firstSent: new Map([[st.id, "2026-10-05T16:20:00Z"]]) }));
    const m = summarizeJobMoney(JURY, byJob.get(JURY) ?? [], null, today);
    expect(m.open).toEqual([{ documentId: "doc-15", number: "S", title: "Draw 7", owedCents: 5000, dueOn: "2026-10-05", daysLate: 8, payWhenPaid: false }]);
    expect(m.pastDueCents).toBe(5000);
  });

  it("does not let an overpaid bill hide what is owed on another", () => {
    const a = doc({ kind: "invoice", number: "8009-01", totalCents: 1000, dueDate: "2026-10-01" });
    const b = doc({ kind: "invoice", number: "8009-02", totalCents: 1000, dueDate: "2026-10-01" });
    const { byJob } = placeMoney(input([a, b], { paid: new Map([[a.id, { total: 1500, byLine: new Map() }]]) }));
    const m = summarizeJobMoney(JURY, byJob.get(JURY) ?? [], null, today);
    expect(m.owedCents).toBe(1000);
    expect(m.paidCents).toBe(1500);
  });

  it("is all zeros for a job with nothing billed", () => {
    expect(summarizeJobMoney(CHURCH, [], null, today)).toEqual({
      jobId: CHURCH,
      contractCents: null,
      billedCents: 0,
      paidCents: 0,
      owedCents: 0,
      pastDueCents: 0,
      open: [],
      asOf: today,
    });
  });

  it("reads the contract only when the owners entered it as whole cents", () => {
    expect(contractOf({ contractCents: 1584000 })).toBe(1584000);
    expect(contractOf({ contractCents: "1584000" })).toBeNull();
    expect(contractOf({ contractCents: 10.5 })).toBeNull();
    expect(contractOf({})).toBeNull();
    expect(contractOf(null)).toBeNull();
  });
});
