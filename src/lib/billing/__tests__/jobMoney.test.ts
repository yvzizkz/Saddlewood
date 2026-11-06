import { describe, expect, it } from "vitest";

import { coIsBill, contractOf, invoiceNamedIn, jobOfBill, jobOfNumber, placeMoney, summarizeJobMoney, unplacedPaidFor, type MoneyInput, type MoneyJob } from "../jobMoney";
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
  return { documents, paid: new Map(), firstSent: new Map(), changeOrders: new Map(), jobs: JOBS, ...extra };
}

describe("what counts as billed", () => {
  const billedOn = (i: MoneyInput, job = JURY) => (placeMoney(i).byJob.get(job) ?? []).reduce((s, x) => s + x.billedCents, 0);
  const paidOn = (i: MoneyInput, job = JURY) => (placeMoney(i).byJob.get(job) ?? []).reduce((s, x) => s + x.paidCents, 0);
  const inv = () => doc({ kind: "invoice", number: "8009-01", jobId: JURY, totalCents: 100_000 });
  const co = () => doc({ kind: "change_order", number: "8009-CO1", jobId: JURY, totalCents: 500_000 });
  const on = (d: { id: string }, status: string, invoiced = false) => ({ changeOrders: new Map([[d.id, { status, invoiced }]]) });

  it("a change order is a bill once signed, until an issued invoice bills it", () => {
    expect(coIsBill({ status: "signed", invoiced: false })).toBe(true);
    expect(coIsBill({ status: "signed", invoiced: true })).toBe(false);
    // Marked billed by a draw that's still a draft: nothing has gone to the client yet.
    expect(coIsBill({ status: "billed", invoiced: false })).toBe(true);
    expect(coIsBill({ status: "billed", invoiced: true })).toBe(false);
    for (const status of ["requested", "priced", "sent", "rejected", "void"]) expect(coIsBill({ status, invoiced: false })).toBe(false);
    expect(coIsBill(undefined)).toBe(false);
  });

  it("a rejected or voided change order's document stays issued and bills nothing", () => {
    const c = co();
    expect(billedOn(input([inv(), c], on(c, "rejected")))).toBe(100_000);
    expect(billedOn(input([inv(), c], on(c, "void")))).toBe(100_000);
  });

  it("one awaiting approval, or not on the register, bills nothing yet", () => {
    const c = co();
    expect(billedOn(input([inv(), c], on(c, "sent")))).toBe(100_000);
    expect(billedOn(input([inv(), c], on(c, "priced")))).toBe(100_000);
    expect(billedOn(input([inv(), c]))).toBe(100_000);
  });

  it("a signed one counts once: as itself, then as the draw that bills it", () => {
    const c = co();
    const draw = doc({ kind: "invoice", number: "8009-02", jobId: JURY, totalCents: 250_000 });
    expect(billedOn(input([c], on(c, "signed")))).toBe(500_000);
    // A draw short of 100% leaves it signed: the draw's line is what says so.
    expect(billedOn(input([c, draw], on(c, "signed", true)))).toBe(250_000);
    expect(billedOn(input([c, draw], on(c, "billed", true)))).toBe(250_000);
  });

  it("money paid on a change order that bills nothing is still paid, and owes nothing", () => {
    const c = co();
    const i = input([c], { ...on(c, "rejected"), paid: new Map([[c.id, { total: 40_000, byLine: new Map() }]]) });
    expect(paidOn(i)).toBe(40_000);
    expect(billedOn(i)).toBe(0);
    expect(summarizeJobMoney(JURY, placeMoney(i).byJob.get(JURY) ?? [], null, "2026-11-05").owedCents).toBe(0);
  });

  it("a signed change order stays billed through a revision of its document", () => {
    const c = co();
    const next = doc({ kind: "change_order", number: "8009-CO1", jobId: JURY, totalCents: 450_000, revision: 2, supersedes: c.id });
    expect(billedOn(input([c, next], on(c, "signed")))).toBe(450_000);
    expect(billedOn(input([c, next], on(c, "rejected")))).toBe(0);
  });

  it("a revision replaces what it corrects, through every revision between", () => {
    const first = inv();
    const second = doc({ kind: "invoice", number: "8009-01", jobId: JURY, totalCents: 90_000, revision: 2, supersedes: first.id });
    expect(billedOn(input([first, second]))).toBe(90_000);
    const third = doc({ kind: "invoice", number: "8009-01", jobId: JURY, totalCents: 80_000, revision: 3, supersedes: second.id });
    expect(billedOn(input([first, second, third]))).toBe(80_000);
  });

  it("a revision still in draft or voided replaces nothing", () => {
    const first = inv();
    const draft = doc({ kind: "invoice", number: "8009-01", jobId: JURY, totalCents: 90_000, status: "draft", supersedes: first.id });
    const voided = doc({ kind: "invoice", number: "8009-01", jobId: JURY, totalCents: 90_000, status: "void", supersedes: first.id });
    expect(billedOn(input([first, draft, voided]))).toBe(100_000);
  });

  it("money paid on a replaced document moves to the revision", () => {
    const first = inv();
    const second = doc({ kind: "invoice", number: "8009-01", jobId: JURY, totalCents: 90_000, revision: 2, supersedes: first.id });
    const i = input([first, second], { paid: new Map([[first.id, { total: 60_000, byLine: new Map() }]]) });
    const m = summarizeJobMoney(JURY, placeMoney(i).byJob.get(JURY) ?? [], null, "2026-11-05");
    expect([m.billedCents, m.paidCents, m.owedCents]).toEqual([90_000, 60_000, 30_000]);
  });

  it("a replaced statement's lines aren't billed twice", () => {
    const lines = [{ description: "Invoice 8009-08", amountCents: 100_000 }];
    const first = doc({ kind: "statement", number: "AFT-1", snapshot: { lines } });
    const second = doc({ kind: "statement", number: "AFT-1", revision: 2, supersedes: first.id, snapshot: { lines } });
    expect(billedOn(input([first, second]))).toBe(100_000);
  });
});

describe("money on a statement", () => {
  const today = "2026-11-05";
  const money = (i: MoneyInput, job = JURY) => {
    const m = summarizeJobMoney(job, placeMoney(i).byJob.get(job) ?? [], null, today);
    return [m.billedCents, m.paidCents, m.owedCents];
  };
  const paid = (d: { id: string }, total: number, byLine: [number, number][] = []) => new Map([[d.id, { total, byLine: new Map(byLine) }]]);

  it("a two-line statement paid on the whole document leaves nothing open", () => {
    const st = doc({ kind: "statement", number: "AFT-1", jobId: JURY, snapshot: { lines: [{ description: "Framing", amountCents: 1_320_000 }, { description: "Trim", amountCents: 264_000 }] } });
    const i = input([st], { paid: paid(st, 1_584_000) });
    expect(money(i)).toEqual([1_584_000, 1_584_000, 0]);
    expect((placeMoney(i).byJob.get(JURY) ?? []).map((x) => x.paidCents)).toEqual([1_320_000, 264_000]);
  });

  it("part of a lump fills the lines in order, past what's already on them", () => {
    const st = doc({ kind: "statement", number: "AFT-1", jobId: JURY, snapshot: { lines: [{ description: "A", amountCents: 1000 }, { description: "B", amountCents: 1000 }] } });
    const items = placeMoney(input([st], { paid: paid(st, 1500, [[0, 800]]) })).byJob.get(JURY) ?? [];
    expect(items.map((x) => x.paidCents)).toEqual([1000, 500]);
  });

  it("a lump over the statement's total stays paid, with nothing open", () => {
    const st = doc({ kind: "statement", number: "AFT-1", jobId: JURY, snapshot: { lines: [{ description: "A", amountCents: 1000 }] } });
    expect(money(input([st], { paid: paid(st, 1200) }))).toEqual([1000, 1200, 0]);
  });

  it("a lump covering a line that's its own document leaves no false Open", () => {
    const own = doc({ kind: "invoice", number: "8009-07", totalCents: 300_000 });
    const st = doc({ kind: "statement", number: "AFT-1", snapshot: { lines: [{ description: "Invoice 8009-07", amountCents: 300_000 }, { description: "Invoice 8009-08", amountCents: 200_000 }] } });
    expect(money(input([own, st], { paid: paid(st, 500_000) }))).toEqual([500_000, 500_000, 0]);
  });

  it("money on a line that's its own document is that job's", () => {
    const own = doc({ kind: "invoice", number: "5203-12", totalCents: 700_000 });
    const st = doc({ kind: "statement", number: "AFT-1", snapshot: { lines: [{ description: "Invoice 8009-08", amountCents: 300_000 }, { description: "Invoice 5203-12", amountCents: 700_000 }] } });
    const i = input([own, st], { paid: paid(st, 500_000, [[1, 500_000]]) });
    expect(money(i, RABBIT)).toEqual([700_000, 500_000, 200_000]);
    expect(money(i, JURY)).toEqual([300_000, 0, 300_000]);
    expect(placeMoney(i).unplaced).toEqual([]);
  });

  it("money on a line whose own document has no job waits with the owners", () => {
    const own = doc({ kind: "invoice", number: "7777-01", totalCents: 700_000 });
    const st = doc({ kind: "statement", number: "AFT-1", snapshot: { lines: [{ description: "Invoice 7777-01", amountCents: 700_000 }] } });
    const { unplaced } = placeMoney(input([own, st], { paid: paid(st, 500_000, [[0, 500_000]]) }));
    expect(unplaced.filter((u) => u.documentId === st.id).map((u) => u.paidCents)).toEqual([500_000]);
  });

  it("a one-job statement of nothing but own documents pays that job", () => {
    const own = doc({ kind: "invoice", number: "8009-07", totalCents: 300_000 });
    const st = doc({ kind: "statement", number: "AFT-1", snapshot: { lines: [{ description: "Invoice 8009-07", amountCents: 300_000 }] } });
    const i = input([own, st], { paid: paid(st, 300_000) });
    expect(money(i)).toEqual([300_000, 300_000, 0]);
    expect(placeMoney(i).unplaced).toEqual([]);
  });

  it("a replaced statement's line money stays on its line, on its job", () => {
    const lines = [{ description: "Invoice 8009-08", amountCents: 300_000 }, { description: "Invoice 5203-12", amountCents: 700_000 }];
    const first = doc({ kind: "statement", number: "AFT-1", snapshot: { lines } });
    const next = doc({ kind: "statement", number: "AFT-1", revision: 2, supersedes: first.id, snapshot: { lines: [lines[1], lines[0]] } });
    const i = input([first, next], { paid: paid(first, 400_000, [[0, 100_000], [1, 300_000]]) });
    expect(money(i)).toEqual([300_000, 100_000, 200_000]);
    expect(money(i, RABBIT)).toEqual([700_000, 300_000, 400_000]);
    expect(placeMoney(i).unplaced).toEqual([]);
  });

  it("a line the revision dropped keeps its money with that line's job", () => {
    const first = doc({ kind: "statement", number: "AFT-1", snapshot: { lines: [{ description: "Invoice 8009-08", amountCents: 300_000 }, { description: "Invoice 5203-12", amountCents: 700_000 }] } });
    const next = doc({ kind: "statement", number: "AFT-1", revision: 2, supersedes: first.id, snapshot: { lines: [{ description: "Invoice 8009-09", amountCents: 300_000 }, { description: "Invoice 5203-12", amountCents: 700_000 }] } });
    const i = input([first, next], { paid: paid(first, 300_000, [[0, 300_000]]) });
    expect(placeMoney(i).unplaced).toEqual([]);
    expect(money(i)).toEqual([300_000, 300_000, 0]);
    expect(money(i, RABBIT)).toEqual([700_000, 0, 700_000]);
  });

  it("a revision left with one job never takes the dropped line's money", () => {
    const own = doc({ kind: "invoice", number: "5203-1", jobId: RABBIT, totalCents: 2000 });
    const lines = [{ description: "Invoice 8009-1", amountCents: 1000 }, { description: "Invoice 5203-1", amountCents: 2000 }];
    const first = doc({ kind: "statement", number: "AFT-1", snapshot: { lines } });
    const next = doc({ kind: "statement", number: "AFT-1", revision: 2, supersedes: first.id, snapshot: { lines: [lines[0]] } });
    const i = input([own, first, next], { paid: paid(first, 2000, [[1, 2000]]) });
    expect(money(i)).toEqual([1000, 0, 1000]);
    expect(money(i, RABBIT)).toEqual([2000, 2000, 0]);
    expect(placeMoney(i).unplaced).toEqual([]);
  });

  it("a dropped line nobody can place holds, and the revision's job holds with it", () => {
    const CLIENT = "client-a";
    const jobs: MoneyJob[] = [{ id: JURY, prefix: "8009", clientId: CLIENT }, { id: RABBIT, prefix: "5203", clientId: CLIENT }];
    const first = doc({ kind: "statement", number: "AFT-1", clientId: CLIENT, snapshot: { lines: [{ description: "Invoice 8009-1", amountCents: 1000 }, { description: "Retainage", amountCents: 500 }] } });
    const next = doc({ kind: "statement", number: "AFT-1", clientId: CLIENT, revision: 2, supersedes: first.id, snapshot: { lines: [{ description: "Invoice 8009-1", amountCents: 1000 }] } });
    const { unplaced } = placeMoney(input([first, next], { jobs, paid: paid(first, 500, [[1, 500]]) }));
    expect(unplaced.map((u) => [u.paidCents, u.title])).toEqual([[500, "Retainage"]]);
    expect(unplacedPaidFor(JURY, unplaced)).toBe(500);
    expect(unplacedPaidFor(RABBIT, unplaced)).toBe(500);
  });

  it("a later statement re-listing an open invoice bills it once, and money on either line counts", () => {
    const relist = { description: "Invoice 8009-08", amountCents: 100_000 };
    const first = doc({ kind: "statement", number: "AFT-1", snapshot: { lines: [relist] } });
    const later = doc({ kind: "statement", number: "AFT-2", snapshot: { lines: [relist, { description: "Invoice 8009-09", amountCents: 50_000 }] } });
    expect(money(input([first, later]))).toEqual([150_000, 0, 150_000]);
    expect(money(input([first, later], { paid: paid(later, 40_000, [[0, 40_000]]) }))).toEqual([150_000, 40_000, 110_000]);
  });
});

describe("money that could be another job's", () => {
  const CLIENT = "client-1";
  const jobs: MoneyJob[] = [
    { id: JURY, prefix: "8009", clientId: CLIENT },
    { id: RABBIT, prefix: "5203", clientId: CLIENT },
    { id: CHURCH, prefix: null, clientId: CLIENT },
  ];
  const lump = (d: { id: string }, total: number) => ({ jobs, paid: new Map([[d.id, { total, byLine: new Map() }]]) });

  it("a lump on a statement for two jobs could be either, and no one else's", () => {
    const st = doc({ kind: "statement", number: "AFT-1", clientId: CLIENT, snapshot: { lines: [{ description: "Invoice 8009-08", amountCents: 300_000 }, { description: "Invoice 5203-12", amountCents: 200_000 }] } });
    const { byJob, unplaced } = placeMoney(input([st], lump(st, 500_000)));
    expect(byJob.get(JURY)?.[0].paidCents).toBe(0);
    expect(unplacedPaidFor(JURY, unplaced)).toBe(500_000);
    expect(unplacedPaidFor(RABBIT, unplaced)).toBe(500_000);
    expect(unplacedPaidFor(CHURCH, unplaced)).toBe(0);
  });

  it("a line that's its own document still counts as a job the lump could pay", () => {
    const inv = doc({ kind: "invoice", number: "5203-12", jobId: RABBIT, totalCents: 200_000 });
    const st = doc({ kind: "statement", number: "AFT-1", clientId: CLIENT, snapshot: { lines: [{ description: "Invoice 8009-08", amountCents: 300_000 }, { description: "Invoice 5203-12", amountCents: 200_000 }] } });
    const { byJob, unplaced } = placeMoney(input([inv, st], lump(st, 300_000)));
    expect(byJob.get(JURY)?.[0].paidCents).toBe(0);
    expect(unplacedPaidFor(RABBIT, unplaced)).toBe(300_000);
  });

  it("with a line no job claims, it could be any of the client's jobs", () => {
    const st = doc({ kind: "statement", number: "AFT-1", clientId: CLIENT, snapshot: { lines: [{ description: "Invoice 8009-08", amountCents: 300_000 }, { description: "Overhead", amountCents: 200_000 }] } });
    const { unplaced } = placeMoney(input([st], lump(st, 100_000)));
    expect(unplacedPaidFor(CHURCH, unplaced)).toBe(100_000);
  });

  it("paid on a line, it's that line's job's and holds nothing back", () => {
    const st = doc({ kind: "statement", number: "AFT-1", clientId: CLIENT, snapshot: { lines: [{ description: "Invoice 8009-08", amountCents: 300_000 }, { description: "Invoice 5203-12", amountCents: 200_000 }] } });
    const { unplaced } = placeMoney(input([st], { jobs, paid: new Map([[st.id, { total: 300_000, byLine: new Map([[0, 300_000]]) }]]) }));
    expect(unplacedPaidFor(JURY, unplaced)).toBe(0);
  });

  it("a bill with no job, paid, could be any of its client's jobs; unpaid, it holds nothing back", () => {
    const paid = doc({ kind: "invoice", number: "7777-01", clientId: CLIENT, totalCents: 100_000 });
    expect(unplacedPaidFor(CHURCH, placeMoney(input([paid], lump(paid, 100_000))).unplaced)).toBe(100_000);
    expect(unplacedPaidFor(CHURCH, placeMoney(input([paid], { jobs })).unplaced)).toBe(0);
  });
});

describe("money with no client on the document", () => {
  const CLIENT = "client-a";
  const jobs: MoneyJob[] = [{ id: JURY, prefix: "8009", clientId: CLIENT }, { id: RABBIT, prefix: "5203", clientId: CLIENT }, { id: CHURCH, prefix: null, clientId: "client-b" }];

  it("a known line says whose it is, so the client's other jobs could be it", () => {
    const st = doc({ kind: "statement", number: "AFT-1", snapshot: { lines: [{ description: "Invoice 8009-08", amountCents: 1000 }, { description: "Retainage", amountCents: 1000 }] } });
    const { unplaced } = placeMoney(input([st], { jobs, paid: new Map([[st.id, { total: 500, byLine: new Map() }]]) }));
    expect(unplaced[0].couldBe?.sort()).toEqual([JURY, RABBIT].sort());
    expect(unplacedPaidFor(CHURCH, unplaced)).toBe(0);
  });

  it("a job with no client on file could be anyone's", () => {
    const st = doc({ kind: "statement", number: "AFT-1", clientId: CLIENT, snapshot: { lines: [{ description: "Retainage", amountCents: 1000 }] } });
    const open: MoneyJob = { id: "44444444-4444-4444-4444-444444444444", prefix: null };
    const { unplaced } = placeMoney(input([st], { jobs: [...jobs, open], paid: new Map([[st.id, { total: 500, byLine: new Map() }]]) }));
    expect(unplacedPaidFor(open.id, unplaced)).toBe(500);
  });

  it("paid money nothing can place could be any job's, so every job holds", () => {
    const paidBill = doc({ kind: "invoice", number: "7777-01", totalCents: 1000 });
    const { unplaced } = placeMoney(input([paidBill], { jobs, paid: new Map([[paidBill.id, { total: 1000, byLine: new Map() }]]) }));
    expect(unplaced[0].couldBe).toBeNull();
    for (const j of jobs) expect(unplacedPaidFor(j.id, unplaced)).toBe(1000);
  });

  it("a known client with no jobs holds nobody else's", () => {
    const paidBill = doc({ kind: "invoice", number: "7777-01", clientId: "client-c", totalCents: 1000 });
    const { unplaced } = placeMoney(input([paidBill], { jobs, paid: new Map([[paidBill.id, { total: 1000, byLine: new Map() }]]) }));
    expect(unplaced[0].couldBe).toEqual([]);
    for (const j of jobs) expect(unplacedPaidFor(j.id, unplaced)).toBe(0);
  });

  it("no owner to be found and a line unclaimed, every job holds", () => {
    const loose: MoneyJob[] = [{ id: JURY, prefix: "8009" }, { id: RABBIT, prefix: "5203" }];
    const st = doc({ kind: "statement", number: "AFT-1", snapshot: { lines: [{ description: "Invoice 8009-08", amountCents: 1000 }, { description: "Retainage", amountCents: 1000 }] } });
    const { unplaced } = placeMoney(input([st], { jobs: loose, paid: new Map([[st.id, { total: 500, byLine: new Map() }]]) }));
    expect(unplaced[0].couldBe).toBeNull();
    for (const j of loose) expect(unplacedPaidFor(j.id, unplaced)).toBe(500);
  });
});

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
    // Every reader places a bill the same way: its own job first, then its number. A statement isn't placed by its number.
    expect(jobOfBill({ jobId: "own", number: "8009-13", kind: "invoice" }, JOBS)).toBe("own");
    expect(jobOfBill({ jobId: null, number: "8009-13", kind: "invoice" }, JOBS)).toBe(JURY);
    expect(jobOfBill({ jobId: null, number: "8009-13", kind: "statement" }, JOBS)).toBeNull();
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
    const items = placeMoney(input([co, st], { changeOrders: new Map([[co.id, { status: "signed", invoiced: false }]]) })).byJob.get(CHURCH) ?? [];
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
    expect(m.open).toEqual([{ documentId: st.id, number: "S", title: "Draw 7", owedCents: 5000, dueOn: "2026-10-05", daysLate: 8, payWhenPaid: false }]);
    expect(m.pastDueCents).toBe(5000);
  });

  it("dollars over on one bill pay down the job's others, most late first", () => {
    const a = doc({ kind: "invoice", number: "8009-01", totalCents: 1000, dueDate: "2026-10-01" });
    const late = doc({ kind: "invoice", number: "8009-02", totalCents: 1000, dueDate: "2026-10-01" });
    const later = doc({ kind: "invoice", number: "8009-03", totalCents: 1000, dueDate: "2026-12-01" });
    const { byJob } = placeMoney(input([a, late, later], { paid: new Map([[a.id, { total: 1500, byLine: new Map() }]]) }));
    const m = summarizeJobMoney(JURY, byJob.get(JURY) ?? [], null, today);
    expect([m.paidCents, m.owedCents, m.pastDueCents]).toEqual([1500, 1500, 500]);
    expect(m.open.map((o) => [o.number, o.owedCents])).toEqual([["8009-02", 500], ["8009-03", 1000]]);
  });

  it("a change order paid on its own document and later invoiced is paid", () => {
    const c = doc({ kind: "change_order", number: "8009-CO1", jobId: JURY, totalCents: 500_000 });
    const draw = doc({ kind: "invoice", number: "8009-02", jobId: JURY, totalCents: 500_000 });
    const { byJob } = placeMoney(input([c, draw], { changeOrders: new Map([[c.id, { status: "billed", invoiced: true }]]), paid: new Map([[c.id, { total: 500_000, byLine: new Map() }]]) }));
    const m = summarizeJobMoney(JURY, byJob.get(JURY) ?? [], null, today);
    expect([m.billedCents, m.paidCents, m.owedCents]).toEqual([500_000, 500_000, 0]);
    expect(m.open).toEqual([]);
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

  it("reads the contract column, whole cents only", () => {
    expect(contractOf({ contract_cents: 1584000 })).toBe(1584000);
    // bigint may come back as a string
    expect(contractOf({ contract_cents: "1584000" })).toBe(1584000);
    expect(contractOf({ contract_cents: 10.5 })).toBeNull();
    expect(contractOf({ contract_cents: null })).toBeNull();
    expect(contractOf({})).toBeNull();
    expect(contractOf(null)).toBeNull();
  });
});
