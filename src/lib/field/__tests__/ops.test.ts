import { describe, expect, it, vi } from "vitest";

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({ from: fromMock }),
}));

import {
  buildNormalizedReceiptPurchase,
  defaultChecklistItems,
  extractEodWorkItems,
  syncEodDirectivesAndDecisions,
  syncReceiptEntryToPurchases,
} from "../ops";

describe("field operations helpers", () => {
  it("provides SOP-009 pre-cover checklist items with photo requirements for each stage", () => {
    const preCover = defaultChecklistItems("pre_cover");
    expect(preCover.length).toBeGreaterThanOrEqual(4);
    expect(preCover.some((i) => i.key === "both_faces_photo")).toBe(true);

    const prePaint = defaultChecklistItems("pre_paint");
    expect(prePaint.some((i) => i.label.includes("500W raking light"))).toBe(true);
  });

  it("normalizes a company-card field receipt into a purchases row without a reimbursement bill", () => {
    const res = buildNormalizedReceiptPurchase({
      entryId: 42,
      day: "2026-10-20",
      jobId: "9146-w-hutton-dr",
      jobName: "9146 W Hutton Dr",
      billingJobId: "20000000-0000-0000-0000-000000000001",
      vendor: "Home Depot",
      amountDollars: 84.5,
      paidBy: "company",
      note: "90-minute hot mud + mesh tape",
      trade: "drywall",
      personName: "Jorge",
      personEmail: "jorge@saddlewood.crew",
    });

    expect(res.purchaseRow.source).toBe("app");
    expect(res.purchaseRow.source_key).toBe("app:entry:42:0");
    expect(res.purchaseRow.line_total_cents).toBe(8450);
    expect(res.purchaseRow.trade).toBe("drywall");
    expect(res.purchaseRow.class).toBe("COMPANY CARD");
    expect(res.reimbursementBill).toBeNull();
  });

  it("gives each receipt its own distinct trip_key when purchases strips the line index", () => {
    const r1 = buildNormalizedReceiptPurchase({
      entryId: 42,
      day: "2026-10-20",
      jobId: "9146-w-hutton-dr",
      jobName: "9146 W Hutton Dr",
      vendor: "Home Depot",
      amountDollars: 20,
      paidBy: "company",
      note: "Tape",
      personName: "Jorge",
      personEmail: "jorge@saddlewood.crew",
    });
    const r2 = buildNormalizedReceiptPurchase({
      entryId: 43,
      day: "2026-10-20",
      jobId: "9146-w-hutton-dr",
      jobName: "9146 W Hutton Dr",
      vendor: "Home Depot",
      amountDollars: 35,
      paidBy: "company",
      note: "Screws",
      personName: "Jorge",
      personEmail: "jorge@saddlewood.crew",
    });
    const tripKeyOf = (sk: string) => sk.slice(0, sk.lastIndexOf(":"));
    expect(tripKeyOf(r1.purchaseRow.source_key)).toBe("app:entry:42");
    expect(tripKeyOf(r2.purchaseRow.source_key)).toBe("app:entry:43");
    expect(tripKeyOf(r1.purchaseRow.source_key)).not.toBe(tripKeyOf(r2.purchaseRow.source_key));
  });

  it("syncReceiptEntryToPurchases inserts a worker reimbursement bill and treats repeat sync (23505) as idempotent", async () => {
    const upsertCalls: unknown[] = [];
    const billInsertCalls: unknown[] = [];
    let repeatSync = false;

    fromMock.mockImplementation((table: string) => {
      if (table === "jobs") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { id: "20000000-0000-0000-0000-000000000001" }, error: null }),
            }),
          }),
        };
      }
      if (table === "purchases") {
        return {
          upsert: async (row: unknown, opts: unknown) => {
            upsertCalls.push({ row, opts });
            return { error: null };
          },
        };
      }
      if (table === "bills") {
        return {
          insert: async (row: unknown) => {
            billInsertCalls.push(row);
            return repeatSync
              ? { error: { code: "23505", message: "duplicate key value violates unique constraint" } }
              : { error: null };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    });

    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const input = {
      entryId: 105,
      day: "2026-10-20",
      jobId: "9146-w-hutton-dr",
      jobName: "9146 W Hutton Dr",
      vendor: "Home Depot",
      amountDollars: 52.75,
      paidBy: "me" as const,
      note: "Corner bead",
      trade: "drywall",
      personName: "Carlos",
      personEmail: "carlos@saddlewood.crew",
    };

    await syncReceiptEntryToPurchases(input);
    expect(upsertCalls).toHaveLength(1);
    expect(billInsertCalls).toHaveLength(1);
    expect((billInsertCalls[0] as { bill_number: string; purchase_trip_key: string }).bill_number).toBe("REIMB-ENTRY-105");
    expect((billInsertCalls[0] as { purchase_trip_key: string }).purchase_trip_key).toBe("app:entry:105");
    expect(errSpy).not.toHaveBeenCalled();

    repeatSync = true;
    await syncReceiptEntryToPurchases(input);
    expect(billInsertCalls).toHaveLength(2);
    expect(errSpy).not.toHaveBeenCalled();

    errSpy.mockRestore();
  });

  it("logs console.error when Supabase calls fail in syncReceiptEntryToPurchases or syncEodDirectivesAndDecisions", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === "jobs") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: { message: "jobs failed" } }),
            }),
          }),
        };
      }
      if (table === "purchases") {
        return {
          upsert: async () => ({ error: { message: "purchases failed" } }),
        };
      }
      if (table === "bills") {
        return {
          insert: async () => ({ error: { code: "42P01", message: "bills failed" } }),
        };
      }
      if (table === "work_items") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: null, error: { message: "work_items select failed" } }),
              }),
            }),
          }),
          // The insert returns the new id (pm-report's cleanup reads it): insert().select().single().
          insert: () => ({ select: () => ({ single: async () => ({ data: null, error: { code: "23502", message: "work_items insert failed" } }) }) }),
        };
      }
      if (table === "change_orders") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: null, error: { message: "change_orders select failed" } }),
              }),
            }),
          }),
          // The insert returns the new id (pm-report's cleanup reads it): insert().select().single().
          insert: () => ({ select: () => ({ single: async () => ({ data: null, error: { code: "23502", message: "change_orders insert failed" } }) }) }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    });

    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await syncReceiptEntryToPurchases({
      entryId: 106,
      day: "2026-10-20",
      jobId: "9146-w-hutton-dr",
      jobName: "9146 W Hutton Dr",
      vendor: "Home Depot",
      amountDollars: 15,
      paidBy: "me",
      note: "Shims",
      personName: "Carlos",
      personEmail: "carlos@saddlewood.crew",
    });
    expect(errSpy).toHaveBeenCalledWith("syncReceiptEntryToPurchases jobs lookup failed:", { message: "jobs failed" });
    expect(errSpy).toHaveBeenCalledWith("syncReceiptEntryToPurchases purchases upsert failed:", { message: "purchases failed" });
    expect(errSpy).toHaveBeenCalledWith("syncReceiptEntryToPurchases bills insert failed:", { code: "42P01", message: "bills failed" });

    errSpy.mockClear();
    await syncEodDirectivesAndDecisions({
      entryId: 107,
      day: "2026-10-20",
      jobId: "9146-w-hutton-dr",
      jobName: "9146 W Hutton Dr",
      done: "",
      asked: "Super asked for extra blocking",
      decision: "",
      stuck: "",
      createdBy: "jorge@saddlewood.crew",
    });
    expect(errSpy).toHaveBeenCalledWith("syncEodDirectivesAndDecisions jobs lookup failed:", { message: "jobs failed" });
    expect(errSpy).toHaveBeenCalledWith("syncEodDirectivesAndDecisions work_items lookup failed:", { message: "work_items select failed" });
    expect(errSpy).toHaveBeenCalledWith("syncEodDirectivesAndDecisions work_items insert failed:", { code: "23502", message: "work_items insert failed" });
    errSpy.mockRestore();
  });

  it("normalizes an out-of-pocket ('me') field receipt into both purchases and a reimbursement bill", () => {
    const res = buildNormalizedReceiptPurchase({
      entryId: 99,
      day: "2026-10-20",
      jobId: "9146-w-hutton-dr",
      jobName: "9146 W Hutton Dr",
      billingJobId: "20000000-0000-0000-0000-000000000001",
      vendor: "Westside Building Material",
      amountDollars: 64.25,
      paidBy: "me",
      note: "2 boxes of 093V vinyl control joint",
      trade: "drywall",
      personName: "Carlos",
      personEmail: "carlos@saddlewood.crew",
    });

    expect(res.purchaseRow.class).toBe("REIMBURSEMENT");
    expect(res.reimbursementBill).not.toBeNull();
    expect(res.reimbursementBill?.kind).toBe("reimbursement");
    expect(res.reimbursementBill?.amount_cents).toBe(6425);
    expect(res.reimbursementBill?.due_on).toBe("2026-10-23");
    expect(res.reimbursementBill?.purchase_trip_key).toBe("app:entry:99");
  });

  it("extracts CO awaiting price and owner ASK decision items from EOD daily logs", () => {
    const items = extractEodWorkItems({
      entryId: 77,
      day: "2026-10-20",
      jobId: "9146-w-hutton-dr",
      jobName: "9146 W Hutton Dr",
      billingJobId: "20000000-0000-0000-0000-000000000001",
      done: "Hung 38 sheets of 5/8 Type X.\nASK: Should we fur out the north niche 1.5in for flush tile?",
      asked: "GC superintendent asked to add sound attenuation batts in powder room wall.",
      decision: "",
      stuck: "",
      createdBy: "jorge@saddlewood.crew",
    });

    expect(items).toHaveLength(2);
    const co = items.find((i) => i.kind === "co_price");
    const dec = items.find((i) => i.kind === "decision");
    expect(co?.role).toBe("decisions");
    expect(co?.title).toContain("CO awaiting price");
    expect(dec?.role).toBe("decisions");
    expect(dec?.title).toContain("Should we fur out the north niche 1.5in for flush tile?");
  });
});
