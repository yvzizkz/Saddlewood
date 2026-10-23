import { beforeEach, describe, expect, it, vi } from "vitest";

// The two reads behind the money card's Material block and the Mac's
// purchasesToday, against a stand-in for the purchases table that really
// filters: which rows each asks for, and that the 90-day low is read from the
// days before, never from the day itself.

type Row = Record<string, unknown>;
type InCall = { col: string; keys: unknown[]; cols: string };

const { db } = vi.hoisted(() => ({
  db: {
    rows: [] as Row[],
    calls: [] as string[],
    inCalls: [] as InCall[],
    upserted: [] as Row[],
    failJobManual: false,
  },
}));

function from(table: string) {
  const filters: ((r: Row) => boolean)[] = [];
  const asked: string[] = [table];
  let selectedCols = "";
  let limit = Infinity;
  const b = {
    select(cols = "") {
      selectedCols = cols;
      return b;
    },
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
    or(expr: string) {
      asked.push(`or(${expr})`);
      filters.push((r) => Boolean(r.trade_manual || r.job_manual));
      return b;
    },
    in(col: string, vs: unknown[]) {
      asked.push(`${col} in ${vs.join(",")}`);
      db.inCalls.push({ col, keys: [...vs], cols: selectedCols });
      const set = new Set(vs);
      filters.push((r) => set.has(r[col]));
      return b;
    },
    // .is("meta->>coveredBy", null): a receipt a Pro Xtra trip covers is left out.
    is(col: string, v: null) {
      const [c, key] = col.split("->>");
      filters.push((r) => ((key ? (r[c] as Record<string, unknown> | undefined)?.[key] : r[c]) ?? null) === v);
      return b;
    },
    order: () => b,
    limit(n: number) {
      limit = n;
      return b;
    },
    async upsert(rows: Row[]) {
      db.upserted.push(...rows);
      return { error: null };
    },
    then(resolve: (v: { data: Row[] | null; error: { message: string } | null }) => void) {
      db.calls.push(asked.join(" "));
      if (db.failJobManual && selectedCols.includes("job_manual")) {
        resolve({ data: null, error: { message: "column purchases.job_manual does not exist" } });
        return;
      }
      resolve({ data: db.rows.filter((r) => filters.every((f) => f(r))).slice(0, limit), error: null });
    },
  };
  return b;
}

vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => ({ from }) }));

import { MANUAL_KEY_BATCH, loadMaterial, loadPurchasesToday, upsertPurchases } from "../purchaseQueries";
import type { PurchaseRow } from "../purchases";

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
  db.inCalls = [];
  db.upserted = [];
  db.failJobManual = false;
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

function purchaseRow(i: number): PurchaseRow {
  return {
    source: "hd",
    sourceKey: `hd:20260812:674:0:6220:${i}`,
    purchasedOn: "2026-08-12",
    vendor: "Home Depot",
    store: "674",
    orderRef: "6220",
    jobNameRaw: "PT LOMA",
    jobKey: "pt loma",
    jobId: "point-loma",
    trade: "framing",
    department: "LUMBER",
    class: "",
    sku: "1001",
    description: "2x4 stud",
    qty: 1,
    lineTotalCents: 1000,
    meta: { ignored: true },
  };
}

describe("upsertPurchases manualEdits batching", () => {
  it("sub-chunks .in('source_key', ...) to at most MANUAL_KEY_BATCH for >500 keys and keeps manual edits across sub-chunks", async () => {
    const incoming = Array.from({ length: 550 }, (_, i) => purchaseRow(i));
    db.rows = [
      row({ source_key: incoming[5].sourceKey, purchased_on: "2026-08-12", trade: "drywall", trade_manual: true, job_manual: false }),
      row({ source_key: incoming[150].sourceKey, purchased_on: "2026-08-12", job_id: "emerson", trade_manual: false, job_manual: true }),
      row({ source_key: incoming[250].sourceKey, purchased_on: "2026-08-12", trade: "insulation", job_id: "gainey", trade_manual: true, job_manual: true }),
      row({ source_key: incoming[520].sourceKey, purchased_on: "2026-08-12", trade: "trim", trade_manual: true, job_manual: false }),
    ];

    const count = await upsertPurchases(incoming);
    expect(count).toBe(550);

    const sourceKeyCalls = db.inCalls.filter((c) => c.col === "source_key");
    expect(sourceKeyCalls.length).toBe(Math.ceil(550 / MANUAL_KEY_BATCH));
    for (const call of sourceKeyCalls) {
      expect(call.keys.length).toBeGreaterThan(0);
      expect(call.keys.length).toBeLessThanOrEqual(MANUAL_KEY_BATCH);
    }

    const union = new Set(sourceKeyCalls.flatMap((c) => c.keys as string[]));
    expect(union).toEqual(new Set(incoming.map((r) => r.sourceKey)));

    const byKey = new Map(db.upserted.map((r) => [r.source_key as string, r]));
    expect(byKey.get(incoming[5].sourceKey)).toMatchObject({ trade: "drywall", job_id: "point-loma" });
    expect(byKey.get(incoming[150].sourceKey)).toMatchObject({ trade: "framing", job_id: "emerson", meta: {} });
    expect(byKey.get(incoming[250].sourceKey)).toMatchObject({ trade: "insulation", job_id: "gainey", meta: {} });
    expect(byKey.get(incoming[520].sourceKey)).toMatchObject({ trade: "trim", job_id: "point-loma" });
    expect(byKey.get(incoming[350].sourceKey)).toMatchObject({ trade: "framing", job_id: "point-loma" });
  });

  it("enforces the same MANUAL_KEY_BATCH limit on the pre-0042 fallback query and preserves manual trades", async () => {
    db.failJobManual = true;
    const incoming = Array.from({ length: 550 }, (_, i) => purchaseRow(i));
    db.rows = [
      row({ source_key: incoming[12].sourceKey, purchased_on: "2026-08-12", trade: "drywall", trade_manual: true }),
      row({ source_key: incoming[220].sourceKey, purchased_on: "2026-08-12", trade: "insulation", trade_manual: true }),
      row({ source_key: incoming[530].sourceKey, purchased_on: "2026-08-12", trade: "trim", trade_manual: true }),
    ];

    const count = await upsertPurchases(incoming);
    expect(count).toBe(550);

    const sourceKeyCalls = db.inCalls.filter((c) => c.col === "source_key");
    for (const call of sourceKeyCalls) {
      expect(call.keys.length).toBeGreaterThan(0);
      expect(call.keys.length).toBeLessThanOrEqual(MANUAL_KEY_BATCH);
    }

    const fallbackCalls = sourceKeyCalls.filter((c) => !c.cols.includes("job_manual"));
    expect(fallbackCalls.length).toBe(Math.ceil(550 / MANUAL_KEY_BATCH));
    const fallbackUnion = new Set(fallbackCalls.flatMap((c) => c.keys as string[]));
    expect(fallbackUnion).toEqual(new Set(incoming.map((r) => r.sourceKey)));

    const byKey = new Map(db.upserted.map((r) => [r.source_key as string, r]));
    expect(byKey.get(incoming[12].sourceKey)).toMatchObject({ trade: "drywall" });
    expect(byKey.get(incoming[220].sourceKey)).toMatchObject({ trade: "insulation" });
    expect(byKey.get(incoming[530].sourceKey)).toMatchObject({ trade: "trim" });
  });
});
