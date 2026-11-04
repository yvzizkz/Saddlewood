import { describe, expect, it, vi } from "vitest";

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));
// The Pro Xtra dedupe after a receipt's upsert has its own tests (receiptDedupe, purchaseQueries).
const { dedupeMock } = vi.hoisted(() => ({ dedupeMock: vi.fn(async () => ({ covered: 0, cleared: 0, linked: 0 })) }));
vi.mock("@/lib/crew/purchaseQueries", () => ({ dedupeReceipts: dedupeMock }));

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
import { OTHER_JOB } from "@/lib/crew/types";

describe("field operations helpers", () => {
  it("provides SOP-009 pre-cover checklist items with photo requirements for each stage", () => {
    const preCover = defaultChecklistItems("pre_cover");
    expect(preCover.length).toBeGreaterThanOrEqual(4);
    expect(preCover.some((i) => i.key === "both_faces_photo")).toBe(true);

    const prePaint = defaultChecklistItems("pre_paint");
    expect(prePaint.some((i) => i.label.includes("500W raking light"))).toBe(true);
  });

  const RECEIPT = {
    entryId: 42,
    day: "2026-10-20",
    jobId: "9146-w-hutton-dr",
    jobName: "9146 W Hutton Dr",
    billingJobId: "20000000-0000-0000-0000-000000000001",
    vendor: "Home Depot",
    amountDollars: 84.5 as number | null,
    paidBy: "company" as "company" | "me",
    note: "90-minute hot mud + mesh tape",
    trade: "drywall",
    personName: "Jorge",
    personEmail: "jorge@saddlewood.crew",
  };

  it("keys a receipt's line exactly as the bot does (app:<entry id>), one row per receipt", () => {
    const res = buildNormalizedReceiptPurchase(RECEIPT);
    expect(res.purchaseRow?.source).toBe("app");
    expect(res.purchaseRow?.source_key).toBe("app:42");
    expect(res.purchaseRow?.line_total_cents).toBe(8450);
    expect(res.purchaseRow?.trade).toBe("drywall");
    expect(res.purchaseRow?.class).toBe("COMPANY CARD");
    expect(res.reimbursementBill).toBeNull();
  });

  it("writes no line while the receipt has no amount", () => {
    expect(buildNormalizedReceiptPurchase({ ...RECEIPT, amountDollars: null }).purchaseRow).toBeNull();
    expect(buildNormalizedReceiptPurchase({ ...RECEIPT, amountDollars: 0 }).purchaseRow).toBeNull();
  });

  it("makes no reimbursement bill for a receipt paid out of pocket (the bot books it to reimburse)", () => {
    const res = buildNormalizedReceiptPurchase({ ...RECEIPT, paidBy: "me" });
    expect(res.purchaseRow?.class).toBe("REIMBURSEMENT");
    expect(res.reimbursementBill).toBeNull();
  });

  it("puts an 'Other job' receipt on no job, so it waits in Which job is this?", () => {
    const res = buildNormalizedReceiptPurchase({ ...RECEIPT, jobId: OTHER_JOB, jobName: "Smith garage" });
    expect(res.purchaseRow?.job_id).toBeNull();
    expect(res.purchaseRow?.job_key).toBe("smith garage");
  });

  it("syncReceiptEntryToPurchases upserts one row on app:<id>, writes no bill, and keeps a trade set by hand", async () => {
    const upserts: Record<string, unknown>[] = [];
    const tables: string[] = [];
    let existing: Record<string, unknown> | null = null;
    fromMock.mockImplementation((table: string) => {
      tables.push(table);
      if (table === "jobs") return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: "20000000-0000-0000-0000-000000000001" }, error: null }) }) }) };
      if (table === "purchases") {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: existing, error: null }) }) }),
          upsert: async (row: Record<string, unknown>) => (upserts.push(row), { error: null }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    // Filed with no amount: nothing written.
    await syncReceiptEntryToPurchases({ ...RECEIPT, paidBy: "me", amountDollars: null, trade: "" });
    expect(upserts).toHaveLength(0);

    // The amount is answered: the line is written, keyed as the bot keys it.
    await syncReceiptEntryToPurchases({ ...RECEIPT, paidBy: "me", amountDollars: 52.75, trade: "" });
    expect(upserts).toHaveLength(1);
    expect(upserts[0]).toMatchObject({ source_key: "app:42", line_total_cents: 5275 });

    // Someone re-tagged it and put it on a job by hand; a resync keeps both.
    existing = { trade: "framing", trade_manual: true, job_id: "8009-n-ironwood-dr", job_manual: true };
    await syncReceiptEntryToPurchases({ ...RECEIPT, paidBy: "me", amountDollars: 60, trade: "" });
    expect(upserts[1]).toMatchObject({ source_key: "app:42", line_total_cents: 6000, trade: "framing", trade_manual: true, job_id: "8009-n-ironwood-dr" });

    expect(tables).not.toContain("bills");
    expect(dedupeMock).toHaveBeenCalledWith([expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/)]);
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
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: { message: "purchases lookup failed" } }) }) }),
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
              neq: () => ({
                is: () => ({ maybeSingle: async () => ({ data: null, error: { message: "change_orders select failed" } }) }),
                eq: () => ({
                  maybeSingle: async () => ({ data: null, error: { message: "change_orders select failed" } }),
                }),
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
    expect(errSpy).toHaveBeenCalledWith("syncReceiptEntryToPurchases purchases lookup failed:", { message: "purchases lookup failed" });

    errSpy.mockClear();
    await syncEodDirectivesAndDecisions({
      entryId: 107,
      day: "2026-10-20",
      jobId: "9146-w-hutton-dr",
      jobName: "9146 W Hutton Dr",
      done: "",
      asked: "Super asked for extra blocking",
      decision: "ASK: Which backing?",
      stuck: "",
      createdBy: "jorge@saddlewood.crew",
    });
    expect(errSpy).toHaveBeenCalledWith("syncEodDirectivesAndDecisions jobs lookup failed:", { message: "jobs failed" });
    expect(errSpy).toHaveBeenCalledWith("syncEodDirectivesAndDecisions work_items lookup failed:", { message: "work_items select failed" });
    expect(errSpy).toHaveBeenCalledWith("syncEodDirectivesAndDecisions work_items insert failed:", { code: "23502", message: "work_items insert failed" });
    errSpy.mockRestore();
  });

  const EOD = {
    entryId: 77,
    day: "2026-10-20",
    jobId: "9146-w-hutton-dr",
    jobName: "9146 W Hutton Dr",
    billingJobId: "20000000-0000-0000-0000-000000000001",
    done: "Hung 38 sheets of 5/8 Type X.",
    decision: "",
    stuck: "",
    createdBy: "jorge@saddlewood.crew",
  };

  it("extracts the owner ASK decision item from EOD daily logs", () => {
    const items = extractEodWorkItems({ ...EOD, done: "Hung 38 sheets of 5/8 Type X.\nASK: Should we fur out the north niche 1.5in for flush tile?" });
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe("decision");
    expect(items[0].role).toBe("decisions");
    expect(items[0].title).toContain("Should we fur out the north niche 1.5in for flush tile?");
  });

  it("puts EOD items from an 'Other job' log on no job (no crew_jobs foreign key to break)", () => {
    const items = extractEodWorkItems({ ...EOD, jobId: OTHER_JOB, jobName: "Smith garage", billingJobId: undefined, done: "Framed", decision: "ASK: T&M or CO?" });
    expect(items).toHaveLength(1);
    expect(items[0].crew_job_id).toBeNull();
    expect(items[0].href).toBe("/app/tasks");
  });

  describe("a directive on the EOD log", () => {
    function tables(existing: { id: number } | null) {
      const written: Record<string, Record<string, unknown>[]> = { work_items: [], change_orders: [] };
      const filters: string[] = [];
      const chain = (data: unknown) => {
        const q = {
          eq: (col: string, v: unknown) => (filters.push(`${col}=${v}`), q),
          neq: (col: string, v: unknown) => (filters.push(`${col}!=${v}`), q),
          is: () => q,
          maybeSingle: async () => ({ data, error: null }),
        };
        return q;
      };
      fromMock.mockImplementation((table: string) => {
        if (table === "work_items" || table === "change_orders") {
          return {
            select: () => chain(table === "change_orders" ? existing : null),
            insert: (row: Record<string, unknown>) => {
              written[table].push(row);
              return { select: () => ({ single: async () => ({ data: { id: 900 }, error: null }) }) };
            },
          };
        }
        throw new Error(`unexpected table ${table}`);
      });
      return { written, filters };
    }

    it("makes a change order and no task of its own: the register's task is the one", async () => {
      const { written } = tables(null);
      const res = await syncEodDirectivesAndDecisions({ ...EOD, asked: "GC asked to add sound batts in the powder room wall." });
      expect(written.work_items).toEqual([]);
      expect(written.change_orders).toHaveLength(1);
      expect(written.change_orders[0]).toMatchObject({ title: "GC asked to add sound batts in the powder room wall.", source: "directive" });
      expect(res).toEqual({ workItemIds: [], changeOrderId: 900 });
    });

    it("keeps the ASK decision on the same log", async () => {
      const { written } = tables(null);
      await syncEodDirectivesAndDecisions({ ...EOD, asked: "Add batts", decision: "ASK: T&M or CO?" });
      expect(written.work_items.map((w) => w.kind)).toEqual(["decision"]);
    });

    it("does not repeat one still on the register, and looks past a voided one", async () => {
      const { written, filters } = tables({ id: 41 });
      const res = await syncEodDirectivesAndDecisions({ ...EOD, asked: "Add batts" });
      expect(written.change_orders).toEqual([]);
      expect(res.changeOrderId).toBe(41);
      expect(filters).toContain("status!=void");
    });
  });
});
