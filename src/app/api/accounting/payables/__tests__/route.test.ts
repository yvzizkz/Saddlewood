import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// PATCH /api/accounting/payables against a stand-in for bills, subs and
// bill_payments: payments refused on held and expired-COI bills, the waiver
// statement passed through to the 0031 guard, a payment never writes a
// waiver, and a COI hold clears only once the COI is current.

type Row = Record<string, unknown>;
const { db } = vi.hoisted(() => ({ db: { tables: {} as Record<string, Row[]> } }));

function from(table: string) {
  const filters: ((r: Row) => boolean)[] = [];
  let patch: Row | null = null;
  let insert: Row | null = null;
  const rows = () => (db.tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
  const run = () => {
    if (insert) {
      // 0031's bill_payments_guard: a sub bill payment needs waiver_collected.
      const bill = db.tables.bills.find((b) => b.id === insert!.bill_id)!;
      if (table === "bill_payments" && bill.kind === "sub" && !insert.waiver_collected) return { data: null, error: { message: "subcontractor bill payment requires waiver_collected = true (SOP-004)" } };
      db.tables[table].push({ voided_at: null, ...insert });
      return { data: null, error: null };
    }
    const hit = rows();
    if (patch) for (const r of hit) Object.assign(r, patch);
    return { data: hit, error: null };
  };
  const b = {
    select: () => b,
    insert: (r: Row) => ((insert = r), b),
    update: (p: Row) => ((patch = p), b),
    eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), b),
    is: (c: string, v: unknown) => (filters.push((r) => (r[c] ?? null) === v), b),
    maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
    then: (ok: (v: unknown) => unknown) => Promise.resolve(run()).then(ok),
  };
  return b;
}

vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => ({ from }) }));
vi.mock("@/lib/crew/auth", () => ({ getViewer: async () => ({ kind: "staff", email: "lando@example.com" }), viewerIsOwner: async () => true }));
vi.mock("@/lib/crew/time", () => ({ localDay: () => "2026-10-20" }));

import { PATCH } from "../route";

const req = (body: unknown) => new NextRequest("http://localhost/api/accounting/payables", { method: "PATCH", body: JSON.stringify(body) });

beforeEach(() => {
  db.tables = {
    subs: [
      { id: "s-ok", coi_expires_on: "2027-01-01" },
      { id: "s-old", coi_expires_on: "2026-09-30" },
      { id: "s-missing", coi_expires_on: null },
    ],
    bills: [
      { id: "b-open", kind: "sub", sub_id: "s-ok", status: "open", waiver_status: "conditional_received", amount_cents: 100_000 },
      { id: "b-held", kind: "sub", sub_id: "s-ok", status: "hold_waiver", waiver_status: "missing", amount_cents: 100_000 },
      { id: "b-coi", kind: "sub", sub_id: "s-old", status: "hold_coi", waiver_status: "conditional_received", amount_cents: 100_000 },
      { id: "b-vendor", kind: "vendor", sub_id: null, status: "open", waiver_status: "not_required", amount_cents: 50_000 },
      { id: "b-coi-missing", kind: "sub", sub_id: "s-missing", status: "hold_coi", waiver_status: "conditional_received", amount_cents: 100_000 },
      { id: "b-open-no-coi", kind: "sub", sub_id: "s-missing", status: "open", waiver_status: "conditional_received", amount_cents: 100_000 },
    ],
    bill_payments: [],
  };
});

describe("record_payment", () => {
  it("refuses a bill on hold, one whose sub's COI is expired, and one whose sub's COI is missing", async () => {
    expect((await PATCH(req({ action: "record_payment", billId: "b-held", amountCents: 100_000, waiverCollected: true }))).status).toBe(409);
    expect((await PATCH(req({ action: "record_payment", billId: "b-coi", amountCents: 100_000, waiverCollected: true }))).status).toBe(409);
    expect((await PATCH(req({ action: "record_payment", billId: "b-coi-missing", amountCents: 100_000, waiverCollected: true }))).status).toBe(409);
    expect((await PATCH(req({ action: "record_payment", billId: "b-open-no-coi", amountCents: 100_000, waiverCollected: true }))).status).toBe(409);
    expect(db.tables.bill_payments).toHaveLength(0);
  });

  it("asks for the waiver statement on a sub bill, then passes it through without writing a waiver", async () => {
    expect((await PATCH(req({ action: "record_payment", billId: "b-open", amountCents: 100_000 }))).status).toBe(400);
    const res = await PATCH(req({ action: "record_payment", billId: "b-open", amountCents: 100_000, waiverCollected: true }));
    expect(res.status).toBe(200);
    expect(db.tables.bill_payments[0]).toMatchObject({ bill_id: "b-open", waiver_collected: true });
    expect(db.tables.bills[0]).toMatchObject({ status: "paid", waiver_status: "conditional_received" });
  });

  it("pays a vendor bill with no waiver and leaves its waiver status alone", async () => {
    expect((await PATCH(req({ action: "record_payment", billId: "b-vendor", amountCents: 20_000 }))).status).toBe(200);
    expect(db.tables.bill_payments[0]).toMatchObject({ waiver_collected: false });
    expect(db.tables.bills[3]).toMatchObject({ status: "partial", waiver_status: "not_required" });
  });
});

describe("update_bill", () => {
  it("won't clear a COI hold while the COI is expired or missing, and clears a waiver hold only", async () => {
    expect((await PATCH(req({ action: "update_bill", billId: "b-coi", clearHold: "coi" }))).status).toBe(409);
    expect(db.tables.bills[2].status).toBe("hold_coi");
    expect((await PATCH(req({ action: "update_bill", billId: "b-coi-missing", clearHold: "coi" }))).status).toBe(409);
    expect(db.tables.bills[4].status).toBe("hold_coi");
    expect((await PATCH(req({ action: "update_bill", billId: "b-held", clearHold: "waiver" }))).status).toBe(200);
    expect(db.tables.bills[1]).toMatchObject({ status: "scheduled", waiver_status: "conditional_received" });
  });

  it("refuses a status that isn't settable, and scheduling a held or missing-COI bill", async () => {
    expect((await PATCH(req({ action: "update_bill", billId: "b-open", status: "paid" }))).status).toBe(400);
    expect((await PATCH(req({ action: "update_bill", billId: "b-coi", status: "scheduled" }))).status).toBe(409);
    expect((await PATCH(req({ action: "update_bill", billId: "b-open-no-coi", status: "scheduled" }))).status).toBe(409);
    expect((await PATCH(req({ action: "update_bill", billId: "b-open", status: "disputed" }))).status).toBe(200);
    expect((await PATCH(req({ action: "update_bill", billId: "b-open", status: "hold" }))).status).toBe(400);
  });

  it("puts a sub bill back on waiver hold, owing the waiver again", async () => {
    expect((await PATCH(req({ action: "update_bill", billId: "b-open", status: "hold_waiver" }))).status).toBe(200);
    expect(db.tables.bills[0]).toMatchObject({ status: "hold_waiver", waiver_status: "missing" });
  });
});
