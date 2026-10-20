import { beforeEach, describe, expect, it, vi } from "vitest";

// The two reads behind "Which job is this?" and finding a purchase (0026),
// against a stand-in for the tables and for purchases_search(): the card
// window is measured from the newest purchase in the table, the older names
// are counted, ?all=1 shows every name; and the search sends the database
// exactly what the parser decided.

type Row = Record<string, unknown>;

const { db } = vi.hoisted(() => ({
  db: {
    tables: {} as Record<string, Row[]>,
    calls: [] as string[],
    rpc: [] as { fn: string; args: Record<string, unknown> }[],
    rpcRows: [] as Row[],
    rpcError: null as string | null,
  },
}));

function from(table: string) {
  const rows = db.tables[table] ?? [];
  let limit = Infinity;
  let order: { col: string; asc: boolean } | null = null;
  const b = {
    select: () => b,
    order(col: string, o?: { ascending?: boolean }) {
      order = { col, asc: o?.ascending ?? true };
      return b;
    },
    limit(n: number) {
      limit = n;
      return b;
    },
    then(resolve: (v: { data: Row[]; error: null }) => void) {
      db.calls.push(`${table}${order ? ` by ${order.col} ${order.asc ? "asc" : "desc"}` : ""}${Number.isFinite(limit) ? ` limit ${limit}` : ""}`);
      const out = [...rows];
      if (order) {
        // Postgres sorts a numeric column as numbers, however PostgREST then spells it.
        const { col, asc } = order;
        const v = (r: Row) => (typeof r[col] === "string" && r[col] !== "" && !Number.isNaN(Number(r[col])) ? Number(r[col]) : (r[col] as number | string));
        out.sort((a, c) => (v(a) < v(c) ? -1 : v(a) > v(c) ? 1 : 0) * (asc ? 1 : -1));
      }
      resolve({ data: out.slice(0, limit), error: null });
    },
  };
  return b;
}

async function rpc(fn: string, args: Record<string, unknown>) {
  db.rpc.push({ fn, args });
  return db.rpcError ? { data: null, error: { message: db.rpcError } } : { data: db.rpcRows, error: null };
}

vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => ({ from, rpc }) }));

import { listUnmatchedPurchases, newestPurchaseDay, runPurchaseSearch } from "../purchaseQueries";

function name(key: string, lastOn: string, cents: number): Row {
  return { job_key: key, name: key.toUpperCase(), trips: "1", lines: "2", cents: String(cents), last_on: lastOn, first_on: "2024-01-01" };
}

beforeEach(() => {
  db.tables = {};
  db.calls = [];
  db.rpc = [];
  db.rpcRows = [];
  db.rpcError = null;
});

describe("listUnmatchedPurchases", () => {
  it("offers the names whose last purchase is within 90 days of the newest purchase, and counts the rest", async () => {
    db.tables.purchases = [{ purchased_on: "2026-08-12" }, { purchased_on: "2026-10-19" }, { purchased_on: "2025-02-01" }];
    db.tables.purchases_unmatched = [
      name("old 1", "2026-07-20", 90000), // 91 days before the newest: older
      name("new 1", "2026-10-01", 5000),
      name("edge", "2026-07-21", 100), // exactly 90 days: still a card
      name("old 2", "2025-03-01", 700),
    ];
    const out = await listUnmatchedPurchases();
    expect(db.calls).toEqual(["purchases by purchased_on desc limit 1", "purchases_unmatched by cents desc limit 5000"]);
    expect(out.newestOn).toBe("2026-10-19");
    expect(out.names.map((n) => [n.key, n.cents, n.lastOn])).toEqual([
      ["new 1", 5000, "2026-10-01"],
      ["edge", 100, "2026-07-21"],
    ]);
    expect(out.older).toBe(2);
    expect(out.olderCents).toBe(90700);
    expect(out.names[0]).toEqual({ key: "new 1", name: "NEW 1", trips: 1, lines: 2, cents: 5000, lastOn: "2026-10-01", firstOn: "2024-01-01" });
  });

  it("shows every name with all, and everything when there is no newest purchase to measure from", async () => {
    db.tables.purchases = [{ purchased_on: "2026-10-19" }];
    db.tables.purchases_unmatched = [name("old 1", "2025-03-01", 700), name("new 1", "2026-10-01", 5000)];
    const all = await listUnmatchedPurchases({ all: true });
    expect(all.names.map((n) => n.key)).toEqual(["new 1", "old 1"]);
    expect(all.older).toBe(0);
    expect(all.olderCents).toBe(0);

    db.tables.purchases = [];
    const none = await listUnmatchedPurchases();
    expect(none.newestOn).toBeNull();
    expect(none.names).toHaveLength(2);
    expect(none.older).toBe(0);
    expect(await newestPurchaseDay()).toBeNull();
  });
});

describe("runPurchaseSearch", () => {
  it("calls purchases_search with the words, mode, scope, trade, dates and sizes, and reads the rows back", async () => {
    db.rpcRows = [
      {
        trip_key: "hd:20260812:674:0:1",
        rank: "0.6079",
        total_trips: "3",
        trip_cents: "5000",
        trip_lines: "2",
        source_key: "hd:20260812:674:0:1:1",
        purchased_on: "2026-08-12",
        store: "674",
        vendor: "Home Depot",
        job_id: "point-loma",
        job_name: "Point Loma",
        job_name_raw: "PT LOMA",
        trade: "drywall",
        description: "Drywall",
        sku: "1001",
        qty: "2",
        line_total_cents: 2400,
        matched: true,
      },
    ];
    const rows = await runPurchaseSearch({ words: ["drywall"], mode: "fuzzy", jobIds: ["point-loma"], trade: "drywall", from: "2026-08-01", to: null, trips: 50, lines: 40 });
    expect(db.rpc).toEqual([
      {
        fn: "purchases_search",
        args: { p_words: ["drywall"], p_mode: "fuzzy", p_jobs: ["point-loma"], p_trade: "drywall", p_from: "2026-08-01", p_to: null, p_trips: 50, p_lines: 40 },
      },
    ]);
    expect(rows).toEqual([
      {
        tripKey: "hd:20260812:674:0:1",
        rank: 0.6079,
        totalTrips: 3,
        tripCents: 5000,
        tripLines: 2,
        sourceKey: "hd:20260812:674:0:1:1",
        purchasedOn: "2026-08-12",
        store: "674",
        vendor: "Home Depot",
        jobId: "point-loma",
        jobName: "Point Loma",
        jobNameRaw: "PT LOMA",
        trade: "drywall",
        description: "Drywall",
        sku: "1001",
        qty: 2,
        lineTotalCents: 2400,
        matched: true,
      },
    ]);
  });

  it("passes the database's refusal up with its message", async () => {
    db.rpcError = "Could not find the function public.purchases_search in the schema cache";
    await expect(runPurchaseSearch({ words: [], mode: "full-text", jobIds: null, trade: "", from: null, to: null, trips: 50, lines: 40 })).rejects.toThrow(/schema cache/);
  });
});
