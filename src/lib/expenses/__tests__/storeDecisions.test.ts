import { beforeEach, describe, expect, it, vi } from "vitest";

// What a person decided about a bot expense survives the bot sending it
// again (Ship review of #54), against a stand-in purchases table: a line set
// aside on Tag spend ("Not a job") or dismissed ("Z12 dismiss") stays out of
// Tag spend, a resend keeps the category and who decided, and "R7" finds the
// bot's r-7 even where the old page renumbered the imported items.

type Row = Record<string, unknown>;
const { tables } = vi.hoisted(() => ({ tables: {} as Record<string, Row[]> }));

const get = (r: Row, col: string): unknown => {
  const m = /^(\w+)->>(\w+)$/.exec(col);
  if (!m) return r[col];
  const v = (r[m[1]] as Row | null)?.[m[2]];
  return v === undefined || v === null ? null : String(v);
};
function orTerm(t: string): (r: Row) => boolean {
  const m = /^(.+?)\.(eq|neq|is)\.(.+)$/.exec(t);
  if (!m) throw new Error(`stand-in: or() term ${t}`);
  const [, c, op, v] = m;
  const val = v === "null" ? null : v === "true" ? true : v;
  return (r) => {
    const x = get(r, c);
    const same = x === val || String(x) === String(val);
    return op === "neq" ? x !== null && !same : op === "is" ? (x ?? null) === val : same;
  };
}
function from(table: string) {
  const filters: ((r: Row) => boolean)[] = [];
  let patch: Row | null = null;
  let single = false;
  let limit = Infinity;
  const b = {
    select: () => b,
    eq: (c: string, v: unknown) => (filters.push((r) => get(r, c) === v || String(get(r, c)) === String(v)), b),
    neq: (c: string, v: unknown) => (filters.push((r) => get(r, c) !== v), b),
    in: (c: string, vs: unknown[]) => (filters.push((r) => vs.map(String).includes(String(get(r, c)))), b),
    is: (c: string, v: unknown) => (filters.push((r) => (get(r, c) ?? null) === v), b),
    or: (expr: string) => {
      const terms = expr.split(",").map(orTerm);
      filters.push((r) => terms.some((f) => f(r)));
      return b;
    },
    order: () => b,
    range: () => b,
    limit: (n: number) => ((limit = n), b),
    maybeSingle: () => ((single = true), b),
    update: (p: Row) => ((patch = p), b),
    upsert: async (rows: Row[]) => {
      const t = (tables[table] ??= []);
      for (const row of rows) {
        const i = t.findIndex((x) => x.source_key === row.source_key);
        if (i >= 0) t[i] = { ...t[i], ...row };
        else t.push({ job_manual: false, trade_manual: false, created_at: "2026-10-23T00:00:00Z", ...row });
      }
      return { error: null };
    },
    then(resolve: (v: { data: unknown; error: null; count?: number }) => void) {
      const hit = (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
      if (patch) hit.forEach((r) => Object.assign(r, patch));
      const rows = hit.slice(0, limit);
      resolve({ data: single ? (rows[0] ?? null) : rows, error: null, count: hit.length });
    },
  };
  return b;
}

vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => ({ from, rpc: async () => ({ data: 0, error: null }) }) }));
vi.mock("@/lib/crew/queries", () => ({ listJobs: async () => [] }));

import { isMaterialCost } from "@/lib/accounting/jobCost";
import { keepManual } from "@/lib/crew/purchaseQueries";
import { spendLine } from "../spend";
import { addExpense, categorizeExpense, untaggedSpend } from "../store";

const zelle = (over: Row = {}) => ({ id: "z-12", n: 12, source: "zelle", direction: "out", date: "2026-10-20", amount: 1250, recipient: "Ace Drywall", memo: "drywall", ...over });
const line = (key: string) => (tables.purchases ?? []).find((r) => r.source_key === key) as Row;
const KEY = "expense:z-12:1";

beforeEach(() => {
  tables.purchases = [];
  tables.job_aliases = [];
  tables.trade_map = [];
});

describe("a line set aside on Tag spend ('Not a job')", () => {
  it("stays set aside when the bot sends it again", async () => {
    await addExpense(zelle());
    expect((await untaggedSpend()).rows.map((r) => r.sourceKey)).toEqual([KEY]);
    // What /api/accounting/purchases set_aside writes.
    Object.assign(line(KEY), { job_id: null, job_manual: true, meta: { ...(line(KEY).meta as Row), ignored: true, decidedBy: "marco@x", setAside: "not_a_job" } });
    expect((await untaggedSpend()).rows).toEqual([]);

    await addExpense(zelle());
    expect(line(KEY).meta).toMatchObject({ ignored: true, decidedBy: "marco@x", setAside: "not_a_job" });
    expect((await untaggedSpend()).rows).toEqual([]);
  });

  it("keepManual keeps a person's set-aside, and still clears a set-aside on a line they put on a job", () => {
    const row = { sourceKey: "k", jobId: null, trade: "general", meta: {} } as never;
    expect(keepManual([row], [{ source_key: "k", trade: "general", job_id: null, trade_manual: false, job_manual: true, meta: { ignored: true, decidedBy: "marco@x" } }])[0]).toMatchObject({ jobId: null, meta: { ignored: true, decidedBy: "marco@x" } });
    const onJob = { sourceKey: "k", jobId: null, trade: "general", meta: { ignored: true } } as never;
    expect(keepManual([onJob], [{ source_key: "k", trade: "general", job_id: "powell", trade_manual: false, job_manual: true, meta: { ignored: true } }])[0]).toMatchObject({ jobId: "powell", meta: {} });
  });
});

describe("a dismissed item ('Z12 dismiss')", () => {
  it("stays dismissed, with its category and who decided, when the bot sends it again", async () => {
    await addExpense(zelle({ expenseType: "Materials" }));
    Object.assign(line(KEY), { meta: { ...(line(KEY).meta as Row), ignored: true, decidedBy: "lando@x" } });
    await addExpense(zelle({ expenseType: "Fuel", decidedBy: "bot" }));
    expect(line(KEY).meta).toMatchObject({ ignored: true, category: "Materials", decidedBy: "lando@x" });
    expect((await untaggedSpend()).rows).toEqual([]);
  });
});

describe("the bot's number", () => {
  it("is the one its id carries, whatever n the item says", () => {
    const s = spendLine(zelle({ id: "r-7", n: 99 }));
    expect(s.kind === "line" && s.line.meta.n).toBe(7);
  });

  it("'R7' finds r-7, not an imported item the old page numbered 7", async () => {
    // Imported by 0053 before the fix: the bot's z-3, renumbered 7 by the old page.
    tables.purchases.push({ source: "zelle", source_key: "expense:z-3:1", purchased_on: "2026-09-01", vendor: "Old", job_name_raw: "", job_id: null, job_key: "", job_manual: false, meta: { expenseId: "z-3", n: 7 }, line_total_cents: 100, created_at: "2026-10-24T00:00:00Z" });
    await addExpense(zelle({ id: "r-7", n: 7, source: "receipt", vendor: "Home Depot" }));
    const item = await categorizeExpense(7, "Powell", "Materials", "marco@x");
    expect(item?.id).toBe("r-7");
    expect(line("expense:r-7:1").job_name_raw).toBe("Powell");
    expect(line("expense:z-3:1").job_name_raw).toBe("");
  });
});

describe("job cost", () => {
  it("counts a sub bill paid by Zelle once: the bill, not the payment", () => {
    const purchases = [
      { ignored: false, source: "zelle", lineTotalCents: 125_000 },
      { ignored: false, source: "hd", lineTotalCents: 40_000 },
      { ignored: true, source: "receipt", lineTotalCents: 9_999 },
    ];
    const bills = [{ amountCents: 125_000 }];
    const cost = purchases.filter(isMaterialCost).reduce((a, r) => a + r.lineTotalCents, 0) + bills.reduce((a, b) => a + b.amountCents, 0);
    expect(cost).toBe(165_000);
  });
});
