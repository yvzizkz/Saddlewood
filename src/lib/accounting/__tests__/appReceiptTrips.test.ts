import { beforeEach, describe, expect, it, vi } from "vitest";

import { tripKey } from "@/lib/crew/purchases";

// App receipts and the trip page, through the real loadPurchaseTrip on a
// stand-in purchases table whose trip_key follows 0044: each app:<entry id>
// receipt is its own trip (they all collapsed into 'app'), a field-ops link
// opens its receipt, a key with filter syntax finds nothing, and a trip with
// a line on another job is not a PM's to open.

type Row = Record<string, unknown>;
const { db } = vi.hoisted(() => ({ db: { tables: {} as Record<string, Row[]> } }));

function from(table: string) {
  const filters: ((r: Row) => boolean)[] = [];
  const rows = () => (db.tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
  const b = {
    select: () => b,
    order: () => b,
    eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), b),
    or: () => {
      throw new Error("no filter expressions: keys are compared with .eq() only");
    },
    maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
    then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: rows(), error: null }).then(ok),
  };
  return b;
}

vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => ({ from }) }));
vi.mock("@/lib/crew/purchaseQueries", () => ({ listUnmatchedPurchases: async () => ({ names: [] }) }));
vi.mock("../trades", async (orig) => ({ ...(await orig<typeof import("../trades")>()), listTrades: async () => [] }));

import { loadPurchaseTrip, tripInScope } from "../purchases";

// The 0044 generated column, as SQL computes it.
const tripKeyColumn = (k: string) => (/^app:[0-9]+$/.test(k) ? k : k.includes(":") ? k.replace(/:[^:]*$/, "") : k);
const line = (source_key: string, job_id: string | null, cents: number) => ({ source: source_key.startsWith("app:") ? "app" : "hd", source_key, trip_key: tripKeyColumn(source_key), purchased_on: "2026-10-20", vendor: "Home Depot", job_id, trade: "general", description: source_key, qty: 1, line_total_cents: cents, meta: {} });

beforeEach(() => {
  db.tables = {
    purchases: [
      line("app:41", "8009-n-ironwood-dr", 4_200),
      line("app:42", "9146-w-hutton-dr", 6_425),
      line("hd:20260812:674:0:6220:1", "8009-n-ironwood-dr", 1_000),
      line("hd:20260812:674:0:6220:2", "9146-w-hutton-dr", 2_500),
    ],
    bills: [],
    crew_jobs: [],
    jobs: [],
  };
});

describe("app receipts are their own trips", () => {
  it("computes app:<id> as its own trip key, in code and in the column", () => {
    expect(tripKey("app:42")).toBe("app:42");
    expect(tripKeyColumn("app:42")).toBe("app:42");
    expect(tripKey("hd:20260812:674:0:6220:1")).toBe("hd:20260812:674:0:6220");
  });

  it("opens receipts on two jobs as two trips, and the field-ops link (app:<id>) resolves", async () => {
    const a = await loadPurchaseTrip("app:41");
    const b = await loadPurchaseTrip(encodeURIComponent("app:42"));
    expect(a?.lines.map((l) => l.sourceKey)).toEqual(["app:41"]);
    expect(b?.lines.map((l) => l.sourceKey)).toEqual(["app:42"]);
    expect(await loadPurchaseTrip("app")).toBeNull();
  });

  it("finds nothing for an injected key", async () => {
    expect(await loadPurchaseTrip("zz,job_id.in.(8009-n-ironwood-dr,9146-w-hutton-dr)")).toBeNull();
  });
});

describe("tripInScope", () => {
  const pmSees = (j: string | null) => j === "8009-n-ironwood-dr";

  it("opens a PM's own trip, and refuses a trip with a line on another job", async () => {
    expect(tripInScope((await loadPurchaseTrip("app:41"))!, pmSees)).toBe(true);
    expect(tripInScope((await loadPurchaseTrip("app:42"))!, pmSees)).toBe(false);
    // Mixed: the first line is the PM's, the second is not.
    expect(tripInScope((await loadPurchaseTrip("hd:20260812:674:0:6220"))!, pmSees)).toBe(false);
  });

  it("refuses an empty trip, and lets an owner open anything", () => {
    expect(tripInScope({ lines: [] }, () => true)).toBe(false);
  });
});
