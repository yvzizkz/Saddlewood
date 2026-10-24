import { beforeEach, describe, expect, it, vi } from "vitest";

// dedupeReceipts against a stand-in purchases table that answers like
// PostgREST: at most max_rows (1,000) per request whatever .limit() asks,
// in insertion order unless ordered, a page at a time with .range(). One
// Home Depot trip of 1,200 lines and the app receipt it already covers: read
// whole, the mark holds; cut at row 1,000, the trip totals short and the mark
// would be cleared. A read past readAll's cap changes nothing.

const MAX_ROWS = 1000;
type Row = Record<string, unknown>;
const { db, paged } = vi.hoisted(() => ({ db: { rows: [] as Row[], updates: [] as { patch: Row; key: unknown }[] }, paged: { maxPages: undefined as number | undefined } }));

function from() {
  const filters: ((r: Row) => boolean)[] = [];
  const orders: string[] = [];
  let range: [number, number] | null = null;
  let limit = Infinity;
  let patch: Row | null = null;
  const b = {
    select: () => b,
    in: (c: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[c])), b),
    eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), b),
    is: (c: string, v: unknown) => (filters.push((r) => (r[c] ?? null) === v), b),
    order: (c: string) => (orders.push(c), b),
    range: (f: number, t: number) => ((range = [f, t]), b),
    limit: (n: number) => ((limit = n), b),
    update: (p: Row) => ((patch = p), b),
    then(resolve: (v: { data: Row[] | null; error: null }) => void) {
      let hit = db.rows.filter((r) => filters.every((f) => f(r)));
      if (patch) {
        for (const r of hit) db.updates.push({ patch: patch!, key: r.source_key });
        hit.forEach((r) => Object.assign(r, patch));
        resolve({ data: hit, error: null });
        return;
      }
      if (orders.length) hit = [...hit].sort((x, y) => orders.reduce((d, c) => d || String(x[c]).localeCompare(String(y[c])), 0));
      if (range) hit = hit.slice(range[0], range[1] + 1);
      resolve({ data: hit.slice(0, Math.min(limit, MAX_ROWS)), error: null });
    },
  };
  return b;
}

vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => ({ from }) }));
vi.mock("@/lib/supabase/paged", async (orig) => {
  const real = await orig<typeof import("@/lib/supabase/paged")>();
  return { ...real, readAll: (page: Parameters<typeof real.readAll>[0], what: string) => real.readAll(page, what, { maxPages: paged.maxPages }) };
});

import { dedupeReceipts } from "../purchaseQueries";

const DAY = "2026-10-01";
const TRIP = `hd:${DAY}:0459:12:77001`;

beforeEach(() => {
  paged.maxPages = undefined;
  db.updates = [];
  // The receipt first, so a read cut at row 1,000 still has it but not the whole trip.
  db.rows = [
    { source: "app", source_key: "app:501", purchased_on: DAY, vendor: "Home Depot", line_total_cents: 129_960, job_id: "j1", meta: { coveredBy: TRIP }, trip_key: "app:501", job_manual: false },
    ...Array.from({ length: 1200 }, (_, n) => ({
      source: "hd",
      source_key: `${TRIP}:${n + 1}`,
      purchased_on: DAY,
      vendor: "HOME DEPOT #0459",
      line_total_cents: 100,
      job_id: "j1",
      meta: {},
      trip_key: TRIP,
      job_manual: false,
    })),
  ];
});

describe("dedupeReceipts reads every line of the days", () => {
  it("keeps the mark on a receipt whose trip runs past row 1,000 (1,200 lines, $1,200 + 8.3% tax)", async () => {
    const r = await dedupeReceipts([DAY]);
    expect(r).toEqual({ covered: 0, cleared: 0, linked: 0, capped: false });
    expect(db.rows[0].meta).toEqual({ coveredBy: TRIP });
    expect(db.updates).toEqual([]);
  });

  it("marks the receipt when the trip arrives in more than one page", async () => {
    db.rows[0].meta = {};
    const r = await dedupeReceipts([DAY]);
    expect(r.covered).toBe(1);
    expect(db.rows[0].meta).toEqual({ coveredBy: TRIP });
  });

  it("leaves every mark as it is when a read hits the page cap", async () => {
    paged.maxPages = 1;
    const r = await dedupeReceipts([DAY]);
    expect(r).toEqual({ covered: 0, cleared: 0, linked: 0, capped: true });
    expect(db.rows[0].meta).toEqual({ coveredBy: TRIP });
    expect(db.updates).toEqual([]);
  });
});
