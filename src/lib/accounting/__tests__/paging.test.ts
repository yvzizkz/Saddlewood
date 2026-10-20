import { beforeEach, describe, expect, it, vi } from "vitest";

import { readAll } from "@/lib/supabase/paged";

// PostgREST hands back at most max_rows (1000) per request whatever .limit()
// asks. Purchases and Payables page with .range() until a short page, so a
// long period keeps every row; past the cap they say so instead of showing a
// short total.

const MAX_ROWS = 1000;
type Row = Record<string, unknown>;
const { db } = vi.hoisted(() => ({ db: { tables: {} as Record<string, Row[]>, ranges: [] as [string, number, number][] } }));

// A stand-in table that caps every response at max_rows, as PostgREST does.
function from(table: string) {
  let range: [number, number] | null = null;
  const b = {
    select: () => b,
    gte: () => b,
    lte: () => b,
    neq: () => b,
    is: () => b,
    eq: () => b,
    order: () => b,
    limit: () => b,
    range: (a: number, z: number) => ((range = [a, z]), db.ranges.push([table, a, z]), b),
    then: (ok: (v: unknown) => unknown) => {
      const all = db.tables[table] ?? [];
      const slice = range ? all.slice(range[0], range[1] + 1) : all;
      return Promise.resolve({ data: slice.slice(0, MAX_ROWS), error: null }).then(ok);
    },
  };
  return b;
}

vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => ({ from }) }));
vi.mock("@/lib/crew/purchaseQueries", () => ({ listUnmatchedPurchases: async () => ({ names: [] }) }));
vi.mock("../trades", async (orig) => ({ ...(await orig<typeof import("../trades")>()), listTrades: async () => [] }));

import { loadPurchases } from "../purchases";
import { loadPayables } from "../payables";

const line = (i: number) => ({
  source: "hd",
  source_key: `hd:20260${(i % 9) + 1}01:1:0:${i}`,
  purchased_on: "2026-05-01",
  vendor: "Home Depot",
  store: "",
  order_ref: "",
  job_name_raw: "",
  job_key: "",
  job_id: null,
  trade: "general",
  department: "",
  class: "",
  sku: "",
  description: `line ${i}`,
  qty: 1,
  line_total_cents: 100,
  meta: {},
});

beforeEach(() => {
  db.ranges = [];
  db.tables = {
    purchases: Array.from({ length: 2_345 }, (_, i) => line(i)),
    bills: Array.from({ length: 1_200 }, (_, i) => ({ id: `b${i}`, bill_number: `${i}`, kind: "vendor", vendor_name: "V", status: "open", waiver_status: "not_required", amount_cents: 100, retainage_cents: 0, issued_on: "2026-05-01", payment_terms: "net_30", trade: "general" })),
    bill_payments: Array.from({ length: 1_100 }, (_, i) => ({ id: `p${i}`, bill_id: `b${i}`, paid_on: "2026-05-02", amount_cents: 100, fee_cents: 0, method: "melio" })),
    crew_jobs: [],
    jobs: [],
    subs: [],
  };
});

describe("readAll", () => {
  it("reads every row across pages under max_rows, and flags a read stopped by the cap", async () => {
    const page = (a: number, z: number) => from("purchases").range(a, z) as unknown as PromiseLike<{ data: Row[] | null; error: null }>;
    expect(await readAll(page, "purchases")).toMatchObject({ capped: false });
    expect((await readAll(page, "purchases")).rows).toHaveLength(2_345);
    const capped = await readAll(page, "purchases", { maxPages: 2 });
    expect(capped.rows).toHaveLength(2_000);
    expect(capped.capped).toBe(true);
  });

  it("stops on an exact multiple of the page size with one empty page", async () => {
    db.tables.purchases = db.tables.purchases.slice(0, 2_000);
    const page = (a: number, z: number) => from("purchases").range(a, z) as unknown as PromiseLike<{ data: Row[] | null; error: null }>;
    expect(await readAll(page, "purchases")).toMatchObject({ capped: false });
    expect((await readAll(page, "purchases")).rows).toHaveLength(2_000);
  });
});

describe("loadPurchases and loadPayables", () => {
  it("return every purchase line, bill and payment past 1,000, with no cap warning", async () => {
    const p = await loadPurchases("2026-01-01", "2026-12-31");
    expect(p.rows).toHaveLength(2_345);
    expect(p.capped).toBe(false);
    expect(db.ranges.filter(([t]) => t === "purchases").map(([, a, z]) => [a, z])).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);

    const ap = await loadPayables("2026-05-10");
    expect(ap.rows).toHaveLength(1_200);
    expect(ap.payments).toHaveLength(1_100);
    expect(ap.capped).toBe(false);
  });

  it("treats missing and expired sub COIs as held and excludes them from the Friday pay run, while valid COIs pass", async () => {
    db.tables.subs = [
      { id: "sub-valid", name: "Valid Sub", coi_expires_on: "2027-01-01", w9_on_file: true },
      { id: "sub-expired", name: "Expired Sub", coi_expires_on: "2026-04-01", w9_on_file: true },
      { id: "sub-missing", name: "Missing Sub", coi_expires_on: null, w9_on_file: true },
    ];
    db.tables.bills = [
      { id: "b-valid", bill_number: "V-1", kind: "sub", sub_id: "sub-valid", vendor_name: "Valid Sub", status: "open", waiver_status: "conditional_received", amount_cents: 100_00, retainage_cents: 0, issued_on: "2026-05-01", due_on: "2026-05-10", payment_terms: "friday_run", trade: "general" },
      { id: "b-expired", bill_number: "E-1", kind: "sub", sub_id: "sub-expired", vendor_name: "Expired Sub", status: "open", waiver_status: "conditional_received", amount_cents: 200_00, retainage_cents: 0, issued_on: "2026-05-01", due_on: "2026-05-10", payment_terms: "friday_run", trade: "general" },
      { id: "b-missing", bill_number: "M-1", kind: "sub", sub_id: "sub-missing", vendor_name: "Missing Sub", status: "open", waiver_status: "conditional_received", amount_cents: 300_00, retainage_cents: 0, issued_on: "2026-05-01", due_on: "2026-05-10", payment_terms: "friday_run", trade: "general" },
    ];
    db.tables.bill_payments = [];

    const ap = await loadPayables("2026-05-10");
    const byId = Object.fromEntries(ap.rows.map((r) => [r.id, r]));

    expect(byId["b-valid"]).toMatchObject({ coiStatus: "valid", isOnHold: false, dueByFriday: true });
    expect(byId["b-expired"]).toMatchObject({ coiStatus: "expired", isOnHold: true, dueByFriday: false });
    expect(byId["b-missing"]).toMatchObject({ coiStatus: "missing", isOnHold: true, dueByFriday: false });
    expect(byId["b-missing"].holdReason).toMatch(/COI missing/i);
  });
});
