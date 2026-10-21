import { beforeEach, describe, expect, it, vi } from "vitest";

// The trip page's lookup, against a stand-in purchases table that filters as
// PostgREST does: a trip key from a link opens its lines (it was shortened a
// second time and 404'd), a line's source key opens its trip, the bill is
// found by the trip the lines are on, and a key with commas or parentheses is
// only ever compared, never parsed as a filter.

type Row = Record<string, unknown>;
const { db } = vi.hoisted(() => ({ db: { tables: {} as Record<string, Row[]>, orCalls: [] as string[] } }));

function from(table: string) {
  const filters: ((r: Row) => boolean)[] = [];
  const rows = () => (db.tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
  const b = {
    select: () => b,
    order: () => b,
    limit: () => b,
    eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), b),
    or: (expr: string) => (db.orCalls.push(expr), b),
    maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
    then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: rows(), error: null }).then(ok),
  };
  return b;
}

vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => ({ from }) }));
vi.mock("@/lib/crew/purchaseQueries", () => ({ listUnmatchedPurchases: async () => ({ names: [] }) }));
vi.mock("../trades", async (orig) => ({ ...(await orig<typeof import("../trades")>()), listTrades: async () => [] }));

import { loadPurchaseTrip } from "../purchases";

// trip_key is the source key up to its last colon (the 0026 generated column).
const line = (source_key: string, cents: number, job_id: string | null = null) => ({
  source: "hd",
  source_key,
  trip_key: source_key.slice(0, source_key.lastIndexOf(":")),
  purchased_on: "2026-10-20",
  vendor: "Home Depot",
  job_id,
  trade: "general",
  description: source_key,
  qty: 1,
  line_total_cents: cents,
  meta: {},
});

beforeEach(() => {
  db.orCalls = [];
  db.tables = {
    purchases: [
      line("hd:20260812:674:0:6220:1", 1000),
      line("hd:20260812:674:0:6220:2", 2500),
      line("hd:seed:20261020:0404:01:9001:1", 4000),
      line("hd:seed:20261020:0404:01:9001:2", 600),
      line("hd:20260812:674:0:9999:1", 777),
    ],
    bills: [{ id: "b1", bill_number: "R-1", status: "open", amount_cents: 3500, purchase_trip_key: "hd:20260812:674:0:6220" }],
    crew_jobs: [],
    jobs: [],
  };
});

describe("loadPurchaseTrip", () => {
  it("opens a trip from the trip key in a link, with its linked bill", async () => {
    const t = await loadPurchaseTrip("hd:20260812:674:0:6220");
    expect(t?.lines.map((l) => l.sourceKey)).toEqual(["hd:20260812:674:0:6220:1", "hd:20260812:674:0:6220:2"]);
    expect(t?.totalCents).toBe(3500);
    expect(t?.linkedBill).toMatchObject({ id: "b1", billNumber: "R-1" });
  });

  it("opens the seed trip hd:seed:20261020:0404:01:9001, URL-encoded or not", async () => {
    expect((await loadPurchaseTrip("hd:seed:20261020:0404:01:9001"))?.lines).toHaveLength(2);
    expect((await loadPurchaseTrip(encodeURIComponent("hd:seed:20261020:0404:01:9001")))?.lines).toHaveLength(2);
  });

  it("opens a line's whole trip from its source key", async () => {
    const t = await loadPurchaseTrip("hd:20260812:674:0:6220:2");
    expect(t?.tripKey).toBe("hd:20260812:674:0:6220");
    expect(t?.lines).toHaveLength(2);
  });

  it("finds nothing for a key with filter syntax in it, and never builds a filter expression", async () => {
    expect(await loadPurchaseTrip("zz,trip_key.eq.hd:20260812:674:0:6220")).toBeNull();
    expect(await loadPurchaseTrip("zz,job_id.in.(MINE,OTHER)")).toBeNull();
    expect(db.orCalls).toEqual([]);
  });
});
