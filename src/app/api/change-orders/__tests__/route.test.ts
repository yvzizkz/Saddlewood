import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// A change order is billed on an invoice, or its money leaves Tasks, Changes
// and the schedule without ever being billed. Against a stand-in for the two
// tables the step reads and writes.

type Row = Record<string, unknown>;

const { db, coEventsAfter, queueJoist } = vi.hoisted(() => ({
  db: { co: null as Row | null, doc: null as Row | null, job: null as Row | null, updates: [] as Row[] },
  coEventsAfter: vi.fn(),
  queueJoist: vi.fn(),
}));

function from(table: string) {
  const one = { eq: () => one, maybeSingle: async () => ({ data: table === "documents" ? db.doc : table === "jobs" ? db.job : db.co, error: null }) };
  return {
    select: () => one,
    update(patch: Row) {
      db.updates.push(patch);
      return { eq: async () => ({ error: null }) };
    },
  };
}

vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => ({ from }) }));
vi.mock("@/lib/crew/auth", () => ({ requireOwner: async () => ({ email: "ilene@saddlewoodcontracting.com", name: "Ilene" }) }));
vi.mock("@/lib/billing/coEvents", () => ({ coEventsAfter: (...a: unknown[]) => coEventsAfter(...a) }));
vi.mock("@/lib/billing/joistSyncStore", () => ({ queueJoist: (...a: unknown[]) => queueJoist(...a) }));
vi.mock("@/lib/billing/coIntakeStore", () => ({ nextChangeOrderNumberFor: async () => "CO-1" }));
vi.mock("@/lib/jobs/access", () => ({ jobForWrite: async () => null, workSeat: async () => null }));

import { PATCH } from "../route";

const INVOICE = "a1000001-0000-4000-8000-000000008014";
const patch = (body: Row) => PATCH(new NextRequest("http://x/api/change-orders", { method: "PATCH", body: JSON.stringify(body) }));

beforeEach(() => {
  db.co = { id: 7, status: "signed", number: "8009-CO7", job_id: "job-1", amount_cents: 124000 };
  db.doc = { number: "8009-14", kind: "invoice", status: "issued", job_id: "job-1" };
  db.job = null;
  db.updates = [];
  coEventsAfter.mockReset();
  queueJoist.mockReset();
});

describe("PATCH /api/change-orders: billed", () => {
  it("refuses billed with no invoice, and changes nothing", async () => {
    const res = await patch({ id: 7, status: "billed" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/which invoice/);
    expect(db.updates).toEqual([]);
    expect(coEventsAfter).not.toHaveBeenCalled();
  });

  it("refuses something that is not a document id", async () => {
    expect((await patch({ id: 7, status: "billed", billedDocumentId: "8009-14" })).status).toBe(400);
    expect((await patch({ id: 7, status: "billed", billedDocumentId: [INVOICE] })).status).toBe(400);
    expect(db.updates).toEqual([]);
  });

  it.each([
    ["no such document", null],
    ["a draft", { number: "8009-15", kind: "invoice", status: "draft", job_id: "job-1" }],
    ["a void invoice", { number: "8009-15", kind: "invoice", status: "void", job_id: "job-1" }],
    ["the change order's own document", { number: "8009-CO7", kind: "change_order", status: "issued", job_id: "job-1" }],
    ["another job's invoice", { number: "4125-03", kind: "invoice", status: "issued", job_id: "job-2" }],
  ])("refuses %s", async (_what, doc) => {
    db.doc = doc;
    expect((await patch({ id: 7, status: "billed", billedDocumentId: INVOICE })).status).toBe(409);
    expect(db.updates).toEqual([]);
  });

  it("refuses a change order with no billing job", async () => {
    db.co = { ...db.co, job_id: null };
    db.doc = { ...db.doc, job_id: null };
    expect((await patch({ id: 7, status: "billed", billedDocumentId: INVOICE })).status).toBe(409);
  });

  it("refuses a crew job's change order when that job still has no billing record", async () => {
    db.co = { ...db.co, job_id: null, crew_job_id: "crew-1" };
    expect((await patch({ id: 7, status: "billed", billedDocumentId: INVOICE })).status).toBe(409);
    expect(db.updates).toEqual([]);
  });

  it("bills a crew job's change order on the billing job it has since, and puts it on that job", async () => {
    db.co = { ...db.co, job_id: null, crew_job_id: "crew-1" };
    db.job = { id: "job-1" };
    const res = await patch({ id: 7, status: "billed", billedDocumentId: INVOICE });
    expect(res.status).toBe(200);
    expect(db.updates).toEqual([{ status: "billed", job_id: "job-1", billed_document_id: INVOICE }]);
  });

  it("closes a no-charge change order with no invoice: there is nothing to bill", async () => {
    db.co = { ...db.co, amount_cents: 0 };
    const res = await patch({ id: 7, status: "billed" });
    expect(res.status).toBe(200);
    expect(db.updates).toEqual([{ status: "billed" }]);
    expect(coEventsAfter).toHaveBeenCalledWith([7], "billed", "ilene@saddlewoodcontracting.com", { invoiceId: null, invoice: "" });
  });

  it("closes a no-charge one on a job with no billing record", async () => {
    db.co = { ...db.co, amount_cents: 0, job_id: null };
    expect((await patch({ id: 7, status: "billed" })).status).toBe(200);
  });

  it("still checks an invoice if one is named on a no-charge change order", async () => {
    db.co = { ...db.co, amount_cents: 0 };
    expect((await patch({ id: 7, status: "billed", billedDocumentId: "8009-14" })).status).toBe(400);
    expect(db.updates).toEqual([]);
  });

  it("does not let an unpriced change order close as no charge", async () => {
    db.co = { ...db.co, amount_cents: null };
    expect((await patch({ id: 7, status: "billed" })).status).toBe(400);
  });

  it("bills it on an issued invoice of its job, and names the invoice on the timeline", async () => {
    const res = await patch({ id: 7, status: "billed", billedDocumentId: INVOICE });
    expect(res.status).toBe(200);
    expect(db.updates).toEqual([{ status: "billed", billed_document_id: INVOICE }]);
    expect(coEventsAfter).toHaveBeenCalledWith([7], "billed", "ilene@saddlewoodcontracting.com", { invoiceId: INVOICE, invoice: "8009-14" });
  });

  it("takes no invoice on any other step", async () => {
    db.co = { ...db.co, status: "sent" };
    const res = await patch({ id: 7, status: "signed", billedDocumentId: INVOICE });
    expect(res.status).toBe(200);
    expect(db.updates[0]).not.toHaveProperty("billed_document_id");
  });
});

describe("PATCH /api/change-orders: signed", () => {
  it("dates it the day it is in Phoenix, not in UTC", async () => {
    vi.useFakeTimers({ now: new Date("2026-11-04T02:00:00Z"), toFake: ["Date"] }); // 7 PM on the 3rd in Phoenix
    try {
      db.co = { ...db.co, status: "sent" };
      await patch({ id: 7, status: "signed" });
      expect(db.updates[0].signed_on).toBe("2026-11-03");
    } finally {
      vi.useRealTimers();
    }
  });
});
