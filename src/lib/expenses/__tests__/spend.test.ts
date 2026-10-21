import { describe, expect, it } from "vitest";

import { tripKey } from "@/lib/crew/purchases";
import { asExpense, expenseRef, spendKey, spendLine } from "../spend";

// The items as the KB bot builds them (accounting.py, receipt_ocr.py, crew.py).
const ZELLE = {
  id: "z-12", n: 12, source: "zelle", direction: "out", date: "2026-10-02", amount: 812.5, recipient: "Manuel Aj Stucco",
  memo: "exterior patch", transactionId: "25497569999", status: "pending", project: null, expenseType: null,
  decidedBy: null, decidedAt: null, clearedVia: null, notes: "Chase Zelle disbursement", createdAt: "2026-10-02T10:00:00",
};
const TEXTED = {
  id: "r-13", n: 13, source: "receipt", direction: "out", date: "2026-10-03", amount: 124.47, recipient: "LOWES", vendor: "LOWES",
  memo: "Counter paper receipt (card)", status: "categorized", project: "Powell", expenseType: "Materials", decidedBy: "Refugio",
  receiptUrl: "/receipts/receipt-1.jpg", notes: "Scanned by Refugio",
};

describe("spendLine", () => {
  it("a Zelle payment is its own trip, on no job, with what the bot knew in meta", () => {
    const r = spendLine(ZELLE);
    expect(r.kind).toBe("line");
    if (r.kind !== "line") return;
    expect(r.line).toMatchObject({
      source: "zelle", sourceKey: "expense:z-12:1", purchasedOn: "2026-10-02", vendor: "Manuel Aj Stucco", orderRef: "25497569999",
      jobNameRaw: "", description: "Zelle to Manuel Aj Stucco: exterior patch", qty: 1, lineTotalCents: 81250, jobId: null,
    });
    expect(r.line.meta).toEqual({ expenseId: "z-12", n: 12, recipient: "Manuel Aj Stucco", notes: "Chase Zelle disbursement" });
    expect(tripKey(r.line.sourceKey)).toBe("expense:z-12");
  });

  it("a texted receipt keeps its project name for the job rules, and its category", () => {
    const r = spendLine(TEXTED);
    if (r.kind !== "line") throw new Error(r.kind);
    expect(r.line).toMatchObject({ source: "receipt", vendor: "LOWES", jobNameRaw: "Powell", description: "Counter paper receipt (card)", lineTotalCents: 12447 });
    expect(r.line.meta).toMatchObject({ category: "Materials", receiptUrl: "/receipts/receipt-1.jpg", decidedBy: "Refugio" });
  });

  it("a dismissed item comes in set aside", () => {
    const r = spendLine({ ...ZELLE, status: "dismissed" });
    expect(r.kind === "line" && r.line.meta.ignored).toBe(true);
  });

  it("an app receipt is already a line (app:<entry>): nothing to add", () => {
    expect(spendLine({ ...TEXTED, id: "r-14", appEntry: 77 })).toEqual({ kind: "app", entry: 77 });
  });

  it("refuses what it cannot enter", () => {
    expect(spendLine(12).kind).toBe("bad");
    expect(spendLine(undefined).kind).toBe("bad");
    expect(spendLine({ ...ZELLE, id: "../x" }).kind).toBe("bad");
    expect(spendLine({ ...ZELLE, date: "10/02/2026" }).kind).toBe("bad");
    expect(spendLine({ ...ZELLE, amount: 0 }).kind).toBe("bad");
    expect(spendLine({ ...ZELLE, amount: "lots" }).kind).toBe("bad");
  });
});

describe("expenseRef", () => {
  it("a number is the bot's n, z-12 its id", () => {
    expect(expenseRef(12)).toEqual({ n: 12 });
    expect(expenseRef("12")).toEqual({ n: 12 });
    expect(expenseRef("Z-12")).toEqual({ id: "z-12" });
    expect(expenseRef(0)).toBeNull();
    expect(expenseRef("12,13")).toBeNull();
    expect(expenseRef("z-1) or (1=1")).toBeNull();
  });
});

describe("asExpense", () => {
  const row = { source: "zelle", source_key: spendKey("z-12"), purchased_on: "2026-10-02", vendor: "Manuel Aj Stucco", order_ref: "25497569999", job_name_raw: "", job_id: null, description: "Zelle to Manuel Aj Stucco: exterior patch", line_total_cents: 81250, meta: { expenseId: "z-12", n: 12, recipient: "Manuel Aj Stucco" } };

  it("gives the bot back its item: pending, categorized, dismissed", () => {
    expect(asExpense(row)).toMatchObject({ id: "z-12", n: 12, source: "zelle", amount: 812.5, recipient: "Manuel Aj Stucco", status: "pending", project: null });
    expect(asExpense({ ...row, job_id: "powell" }, "Powell Residence")).toMatchObject({ status: "categorized", project: "Powell Residence" });
    expect(asExpense({ ...row, job_name_raw: "Powell" })).toMatchObject({ status: "categorized", project: "Powell" });
    expect(asExpense({ ...row, meta: { ...row.meta, ignored: true } }).status).toBe("dismissed");
  });
});
