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
import type { CoRow } from "@/lib/billing/registers";
import { OTHER_JOB } from "@/lib/crew/types";
import { changeOrderItems } from "@/lib/tasks/feed";

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
              in: () => ({
                is: () => ({ limit: () => ({ maybeSingle: async () => ({ data: null, error: { message: "change_orders select failed" } }) }) }),
                eq: () => ({
                  limit: () => ({ maybeSingle: async () => ({ data: null, error: { message: "change_orders select failed" } }) }),
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
    type Co = Record<string, unknown>;
    /** A stand-in for work_items and change_orders that applies the lookup's filters to the rows it holds. */
    function tables(seed: Co[] = []) {
      const cos: Co[] = [...seed];
      const workItems: Record<string, unknown>[] = [];
      const lookup = (rows: Co[]) => {
        const tests: ((r: Co) => boolean)[] = [];
        const q = {
          eq: (col: string, v: unknown) => (tests.push((r) => r[col] === v), q),
          in: (col: string, v: unknown[]) => (tests.push((r) => v.includes(r[col])), q),
          is: (col: string, v: unknown) => (tests.push((r) => (r[col] ?? null) === v), q),
          limit: () => q,
          maybeSingle: async () => ({ data: rows.find((r) => tests.every((t) => t(r))) ?? null, error: null }),
        };
        return q;
      };
      fromMock.mockImplementation((table: string) => {
        if (table === "work_items") {
          return {
            select: () => lookup([]),
            insert: (row: Record<string, unknown>) => {
              workItems.push(row);
              return { select: () => ({ single: async () => ({ data: { id: 900 }, error: null }) }) };
            },
          };
        }
        if (table === "change_orders") {
          return {
            select: () => lookup(cos),
            insert: (row: Co) => {
              const id = 900 + cos.length;
              cos.push({ id, status: "requested", ...row });
              return { select: () => ({ single: async () => ({ data: { id }, error: null }) }) };
            },
          };
        }
        if (table === "change_order_events") return { insert: async () => ({ error: null }) };
        if (table === "jobs") return { select: () => lookup([]) };
        throw new Error(`unexpected table ${table}`);
      });
      return { cos, workItems };
    }
    const other = (jobName: string, entryId = 77) => ({ ...EOD, entryId, jobId: OTHER_JOB, jobName, billingJobId: undefined, asked: "Add a header over the side door" });
    /** The Tasks row a change order makes, as the register would read it on no job. */
    const taskOf = (c: Co) =>
      changeOrderItems(
        [{ id: `r${c.id}`, registerId: c.id as number, number: "", title: c.title as string, jobKey: null, job: "", status: "requested", amountCents: null, requestedOn: "2026-10-20", sentOn: null, ageDays: 0, documentId: null, billedDocumentId: null, source: "directive" } as CoRow],
        { priceWithinDays: 2, followUpDays: 5 },
        "2026-10-20",
      )[0];

    it("makes a change order and no task of its own: the register's task is the one", async () => {
      const { cos, workItems } = tables();
      const res = await syncEodDirectivesAndDecisions({ ...EOD, asked: "GC asked to add sound batts in the powder room wall." });
      expect(workItems).toEqual([]);
      expect(cos).toHaveLength(1);
      expect(cos[0]).toMatchObject({ title: "GC asked to add sound batts in the powder room wall.", source: "directive" });
      expect(res).toEqual({ workItemIds: [], changeOrderId: 900 });
    });

    it("keeps the ASK decision on the same log", async () => {
      const { workItems } = tables();
      await syncEodDirectivesAndDecisions({ ...EOD, asked: "Add batts", decision: "ASK: T&M or CO?" });
      expect(workItems.map((w) => w.kind)).toEqual(["decision"]);
    });

    it("does not repeat one still open on the job", async () => {
      const { cos } = tables([{ id: 41, title: "Add batts", status: "priced", crew_job_id: EOD.jobId, job_id: EOD.billingJobId }]);
      const res = await syncEodDirectivesAndDecisions({ ...EOD, asked: "Add batts" });
      expect(cos).toHaveLength(1);
      expect(res.changeOrderId).toBe(41);
    });

    it.each(["billed", "rejected", "void"])("makes a new one when the last was %s", async (status) => {
      const { cos } = tables([{ id: 41, title: "Add batts", status, crew_job_id: EOD.jobId, job_id: EOD.billingJobId }]);
      await syncEodDirectivesAndDecisions({ ...EOD, asked: "Add batts" });
      expect(cos).toHaveLength(2);
    });

    it("carries the typed Other-job name to the change order and its task", async () => {
      const { cos } = tables();
      await syncEodDirectivesAndDecisions(other("Smith garage"));
      expect(cos[0]).toMatchObject({ title: "Smith garage: Add a header over the side door", job_id: null, crew_job_id: null });
      expect(taskOf(cos[0]).title).toBe("Price: Smith garage: Add a header over the side door");
    });

    it("keeps a job's title plain: the job is already on the row", async () => {
      const { cos } = tables();
      await syncEodDirectivesAndDecisions({ ...EOD, asked: "Add batts" });
      expect(cos[0].title).toBe("Add batts");
    });

    it("stays inside the title limit with a long name and a long ask", async () => {
      const { cos } = tables();
      await syncEodDirectivesAndDecisions({ ...other("S".repeat(300)), asked: "A".repeat(300) });
      expect(cos[0].title).toHaveLength(200);
      expect(String(cos[0].title).startsWith(`${"S".repeat(80)}: A`)).toBe(true);
    });

    it("the same ask on two Other jobs is two change orders and two tasks", async () => {
      const { cos } = tables();
      await syncEodDirectivesAndDecisions(other("Smith garage", 77));
      await syncEodDirectivesAndDecisions(other("Jones casita", 78));
      expect(cos.map((c) => c.title)).toEqual(["Smith garage: Add a header over the side door", "Jones casita: Add a header over the side door"]);
      expect(cos.map((c) => taskOf(c).id)).toEqual(["co900", "co901"]);
    });

    it("a retry of the same Other-job log stays one", async () => {
      const { cos } = tables();
      const first = await syncEodDirectivesAndDecisions(other("Smith garage"));
      const again = await syncEodDirectivesAndDecisions(other("Smith garage"));
      expect(cos).toHaveLength(1);
      expect(again.changeOrderId).toBe(first.changeOrderId);
    });

    it("an Other-job log does not match an open one on a billing job with no crew link", async () => {
      const title = "Smith garage: Add a header over the side door";
      const { cos } = tables([{ id: 41, title, status: "requested", crew_job_id: null, job_id: EOD.billingJobId }]);
      const res = await syncEodDirectivesAndDecisions(other("Smith garage"));
      expect(cos).toHaveLength(2);
      expect(res.changeOrderId).not.toBe(41);
    });

    it("a billing job with no crew link only repeats its own", async () => {
      const other2 = "20000000-0000-0000-0000-000000000002";
      const { cos } = tables([{ id: 41, title: "Add batts", status: "requested", crew_job_id: null, job_id: other2 }]);
      const base = { ...EOD, jobId: "", asked: "Add batts" };
      const first = await syncEodDirectivesAndDecisions(base);
      const again = await syncEodDirectivesAndDecisions(base);
      expect(cos).toHaveLength(2);
      expect(cos[1]).toMatchObject({ title: "Add batts", job_id: EOD.billingJobId, crew_job_id: null });
      expect(again.changeOrderId).toBe(first.changeOrderId);
    });
  });
});
