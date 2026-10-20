import { beforeEach, describe, expect, it, vi } from "vitest";

// The two reads behind the money card's Material block and the Mac's
// purchasesToday, against a stand-in for the purchases table that really
// filters: which rows each asks for, and that the 90-day low is read from the
// days before, never from the day itself.

type Row = Record<string, unknown>;

const { db } = vi.hoisted(() => ({ db: { rows: [] as Row[], calls: [] as string[] } }));

function from(table: string) {
  const filters: ((r: Row) => boolean)[] = [];
  const asked: string[] = [table];
  let limit = Infinity;
  const b = {
    select: () => b,
    gte(col: string, v: string) {
      asked.push(`${col}>=${v}`);
      filters.push((r) => (r[col] as string) >= v);
      return b;
    },
    lte(col: string, v: string) {
      asked.push(`${col}<=${v}`);
      filters.push((r) => (r[col] as string) <= v);
      return b;
    },
    eq(col: string, v: unknown) {
      asked.push(`${col}=${v}`);
      filters.push((r) => r[col] === v);
      return b;
    },
    in(col: string, vs: unknown[]) {
      asked.push(`${col} in ${vs.join(",")}`);
      filters.push((r) => vs.includes(r[col]));
      return b;
    },
    order: () => b,
    limit(n: number) {
      limit = n;
      return b;
    },
    then(resolve: (v: { data: Row[]; error: null }) => void) {
      db.calls.push(asked.join(" "));
      resolve({ data: db.rows.filter((r) => filters.every((f) => f(r))).slice(0, limit), error: null });
    },
  };
  return b;
}

vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => ({ from }) }));

import { loadMaterial, loadPurchasesToday } from "../purchaseQueries";

function row(over: Partial<Row> & { source_key: string; purchased_on: string }): Row {
  return {
    source: "hd",
    vendor: "Home Depot",
    store: "674",
    order_ref: "",
    job_name_raw: "PT LOMA",
    job_key: "pt loma",
    job_id: "point-loma",
    trade: "general",
    department: "",
    class: "",
    sku: "",
    description: "",
    qty: "1",
    line_total_cents: 1000,
    meta: null,
    ...over,
  };
}

beforeEach(() => {
  db.rows = [];
  db.calls = [];
});

describe("loadMaterial", () => {
  it("reads twelve months of one job's lines and rolls them", async () => {
    db.rows = [
      row({ source_key: "hd:20260812:674:0:1:1", purchased_on: "2026-08-12", trade: "framing", line_total_cents: 50000 }),
      row({ source_key: "hd:20260812:674:0:1:2", purchased_on: "2026-08-12", trade: "drywall", line_total_cents: 2000 }),
      row({ source_key: "hd:20250812:674:0:1:1", purchased_on: "2025-08-12", trade: "framing", line_total_cents: 99900 }),
      row({ source_key: "hd:20260901:674:0:2:1", purchased_on: "2026-09-01", job_id: "gainey", line_total_cents: 99900 }),
    ];
    const m = await loadMaterial("point-loma", "2026-10-19");
    expect(db.calls).toEqual(["purchases purchased_on>=2025-10-19 purchased_on<=2026-10-19 job_id=point-loma"]);
    expect(m).toEqual({ since: "2025-10-19", trips: 1, smallTrips: 0, spentCents: 52000, returnsCents: 0, byTrade: [{ trade: "framing", cents: 50000 }, { trade: "drywall", cents: 2000 }], lastOn: "2026-08-12" });
  });
});

describe("loadPurchasesToday", () => {
  it("reads the day, then the 90 days before it for the skus bought, and flags", async () => {
    db.rows = [
      row({ source_key: "hd:20260812:674:0:1:1", purchased_on: "2026-08-12", sku: "1001", qty: "2", line_total_cents: 1200, description: "Screws" }),
      row({ source_key: "hd:20260812:674:0:1:2", purchased_on: "2026-08-12", sku: "", qty: "1", line_total_cents: 300 }),
      row({ source_key: "hd:20260801:674:0:9:1", purchased_on: "2026-08-01", sku: "1001", qty: "10", line_total_cents: 4000 }), // 4.00
      row({ source_key: "hd:20260501:674:0:9:1", purchased_on: "2026-05-01", sku: "1001", qty: "10", line_total_cents: 1000 }), // 1.00, too old
      row({ source_key: "hd:20260812:674:0:2:1", purchased_on: "2026-08-12", job_id: null, job_key: "gainey 45", job_name_raw: "Gainey #45", sku: "1001", qty: "1", line_total_cents: 450 }),
    ];
    const out = await loadPurchasesToday("2026-08-12", [{ id: "point-loma", name: "Point Loma" }]);
    expect(db.calls).toEqual([
      "purchases purchased_on>=2026-08-12 purchased_on<=2026-08-12",
      "purchases purchased_on>=2026-05-14 purchased_on<=2026-08-11 sku in 1001",
    ]);
    expect(out).toEqual([
      { jobId: "point-loma", jobName: "Point Loma", trips: 1, smallTrips: 1, spentCents: 1500, returnsCents: 0, flags: [{ description: "Screws", sku: "1001", paidCents: 600, lowCents: 400, lowOn: "2026-08-01" }] },
      { jobId: "", jobName: "Gainey #45", trips: 1, smallTrips: 1, spentCents: 450, returnsCents: 0, flags: [] },
    ]);
  });

  it("asks nothing more on a day with no purchases", async () => {
    expect(await loadPurchasesToday("2026-08-12", [])).toEqual([]);
    expect(db.calls).toHaveLength(1);
  });
});
