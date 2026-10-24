import { beforeEach, describe, expect, it, vi } from "vitest";

// A Joist payment someone already entered on Money by hand is refused as a
// possible duplicate, not recorded a second time (SHIP review of #56). Through
// the real recordBotPayment, Receivables' collected view and the deposit
// watch, against stand-in tables.

type Row = Record<string, unknown>;
const { db } = vi.hoisted(() => ({ db: { tables: {} as Record<string, Row[]>, seq: 0 } }));

/** One PostgREST .or() term: col.eq.v, col.not.is.null, col.in.(a,b). */
function orTerm(t: string): (r: Row) => boolean {
  const m = /^(\w+)\.(eq\.(.*)|not\.is\.null|in\.\((.*)\))$/.exec(t);
  if (!m) throw new Error(`stand-in: unknown or() term ${t}`);
  const [, c, op, eq, list] = m;
  if (op === "not.is.null") return (r) => r[c] != null;
  if (eq !== undefined) return (r) => String(r[c]) === eq;
  const vs = list.split(",");
  return (r) => vs.includes(String(r[c]));
}

function from(table: string) {
  const filters: ((r: Row) => boolean)[] = [];
  let patch: Row | null = null;
  let inserted: Row[] | null = null;
  let order: { col: string; asc: boolean } | null = null;
  let offset = 0;
  let limit = Infinity;
  const rows = () => (db.tables[table] ??= []);
  const run = (): Row[] => {
    if (inserted) return inserted;
    let out = rows().filter((r) => filters.every((f) => f(r)));
    if (patch) {
      for (const r of out) Object.assign(r, patch);
      out = out.map((r) => ({ ...r }));
    }
    if (order) {
      const { col, asc } = order;
      out = [...out].sort((a, b) => String(a[col]).localeCompare(String(b[col])) * (asc ? 1 : -1));
    }
    return out.slice(offset, offset + limit).map((r) => ({ ...r }));
  };
  const b = {
    select: () => b,
    eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), b),
    in: (c: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[c])), b),
    is: (c: string, v: unknown) => (filters.push((r) => (r[c] ?? null) === v), b),
    gte: (c: string, v: string) => (filters.push((r) => String(r[c]) >= v), b),
    lte: (c: string, v: string) => (filters.push((r) => String(r[c]) <= v), b),
    like: (c: string, pat: string) => (filters.push((r) => String(r[c]).startsWith(pat.replace(/%$/, ""))), b),
    // The deposit watch reads its candidate invoices with .or() a page at a time (#46).
    or: (expr: string) => {
      const terms = expr.split(/,(?![^(]*\))/).map(orTerm);
      filters.push((r) => terms.some((f) => f(r)));
      return b;
    },
    order: (col: string, o?: { ascending?: boolean }) => ((order = { col, asc: o?.ascending !== false }), b),
    range: (f: number, t: number) => ((offset = f), (limit = t - f + 1), b),
    limit: (n: number) => ((limit = n), b),
    update: (p: Row) => ((patch = p), b),
    insert: (input: Row | Row[]) => {
      const defaults: Row = table === "payments" ? { source: "app", external_ref: null, voided_at: null, void_reason: "", fee_cents: 0, recorded_at: new Date().toISOString() } : {};
      inserted = (Array.isArray(input) ? input : [input]).map((r) => ({ id: `new-${++db.seq}`, ...defaults, ...r }));
      rows().push(...inserted.map((r) => ({ ...r })));
      return b;
    },
    single: async () => ({ data: run()[0] ?? null, error: null }),
    maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
    then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve({ data: run(), error: null }).then(ok, bad),
  };
  return b;
}

vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => ({ from }) }));

import { recordBotPayment, type BotPayment } from "../botPayments";
import { loadCollected } from "@/lib/accounting/receivables";
import { closeWatchesFromRecords } from "@/lib/sales/watchRecords";
import { paidByDocument } from "../payments";

const JOB = "00000000-0000-4000-8000-0000000000a1";
const DOC = "00000000-0000-4000-8000-0000000000d1";
const CLIENT = "00000000-0000-4000-8000-0000000000c1";

/** A $6,000 deposit invoice, $3,000 of it already entered on Money by hand: $3,000 still open. */
function seed(money: Partial<Row> = {}) {
  db.seq = 0;
  db.tables = {
    clients: [{ id: CLIENT, name: "AFT" }],
    jobs: [{ id: JOB, name: "Powell", crew_job_id: null, billing: null }],
    documents: [{ id: DOC, job_id: JOB, client_id: CLIENT, kind: "invoice", status: "issued", number: "8009-10", title: "Deposit", total_cents: 600_000, supersedes: null, created_at: "2026-10-01T00:00:00Z" }],
    payments: [
      {
        id: "money-1", client_id: CLIENT, received_on: "2026-10-15", amount_cents: 300_000, fee_cents: 0, method: "check", reference: "chk 1042", note: "", evidence: "",
        recorded_by: "Marco", recorded_at: "2026-10-15T18:00:00Z", voided_at: null, void_reason: "", source: "app", external_ref: null, ...money,
      },
    ],
    payment_allocations: [{ payment_id: "money-1", document_id: DOC, line_index: null, amount_cents: 300_000 }],
    job_watches: [{ id: 1, job_id: JOB, kind: "deposit", done_at: null, done_by: "" }],
  };
}

const P: BotPayment = { pNumber: 8, invoice: "AFT123-8009-10", client: "AFT", amountCents: 300_000, receivedOn: "2026-10-16", method: "melio", joistId: "j8", evidence: "Melio" };

const totals = async () => ({
  paid: (await paidByDocument([DOC])).get(DOC)?.total ?? 0,
  collected: (await loadCollected("2026-09-01", "2026-11-30")).reduce((s, r) => s + r.amountCents, 0),
  payments: db.tables.payments.length,
});

beforeEach(() => seed());

describe("a bot payment that matches a hand-entered Money payment", () => {
  it("(a) is refused as a possible duplicate on a partly paid invoice, and nothing counts twice", async () => {
    const before = await totals();
    expect(before).toEqual({ paid: 300_000, collected: 300_000, payments: 1 });

    const r = await recordBotPayment(P, "bot");
    expect(r.status).toBe("possible_duplicate");
    expect("detail" in r && r.detail).toMatch(/possible duplicate: 8009-10 already has 3000\.00 received 2026-10-15 entered on Money \(chk 1042\)/);

    expect(await totals()).toEqual(before);
    // The deposit watch stays open: $3,000 of $6,000 is in, not all of it.
    expect(await closeWatchesFromRecords([JOB])).toEqual({ closed: 0, reopened: 0 });
    expect(db.tables.job_watches[0]).toMatchObject({ done_at: null, done_by: "" });
  });

  it("(a) the edge of the window still counts: 7 days either way", async () => {
    for (const receivedOn of ["2026-10-08", "2026-10-22"]) {
      seed();
      expect((await recordBotPayment({ ...P, receivedOn }, "bot")).status, receivedOn).toBe("possible_duplicate");
    }
  });
});

describe("what still records", () => {
  it("(b) a different amount", async () => {
    const r = await recordBotPayment({ ...P, amountCents: 250_000 }, "bot");
    expect(r.status).toBe("recorded");
    expect((await totals()).paid).toBe(550_000);
  });

  it("(b) the same amount received more than 7 days away", async () => {
    for (const receivedOn of ["2026-10-07", "2026-10-23"]) {
      seed();
      expect((await recordBotPayment({ ...P, receivedOn }, "bot")).status, receivedOn).toBe("recorded");
    }
  });

  it("(b) the deposit then paid in full closes the watch, once", async () => {
    expect((await recordBotPayment({ ...P, receivedOn: "2026-10-30" }, "bot")).status).toBe("recorded");
    expect(await totals()).toEqual({ paid: 600_000, collected: 600_000, payments: 2 });
    expect(await closeWatchesFromRecords([JOB])).toEqual({ closed: 1, reopened: 0 });
  });

  it("(c) a voided Money payment does not block it", async () => {
    seed({ voided_at: "2026-10-16T09:00:00Z", void_reason: "entered twice" });
    const r = await recordBotPayment(P, "bot");
    expect(r.status).toBe("recorded");
    expect((await totals()).paid).toBe(300_000);
  });

  it("(c) another bot payment of the same amount does not block it (only Money entries do)", async () => {
    seed({ source: "bot", external_ref: "P7" });
    expect((await recordBotPayment(P, "bot")).status).toBe("recorded");
  });
});
