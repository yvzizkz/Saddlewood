import { beforeEach, describe, expect, it, vi } from "vitest";

// closeWatchesFromRecords against stand-in tables that answer like PostgREST:
// at most max_rows (1,000) per request whatever is asked, in insertion order
// unless ordered, a page at a time with .range(). A job with 1,100 progress
// invoices before its deposit: read whole, the paid deposit keeps the watch
// closed; cut at row 1,000, the deposit would be missing and read as unpaid.

const MAX_ROWS = 1000;
type Row = Record<string, unknown>;
const { tables, paid } = vi.hoisted(() => ({ tables: {} as Record<string, Row[]>, paid: new Map<string, number>() }));

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
  const orders: string[] = [];
  let range: [number, number] | null = null;
  let limit = Infinity;
  let patch: Row | null = null;
  let single = false;
  const b = {
    select: () => b,
    in: (c: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[c])), b),
    eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), b),
    is: (c: string, v: unknown) => (filters.push((r) => (r[c] ?? null) === v), b),
    like: (c: string, p: string) => (filters.push((r) => String(r[c]).startsWith(p.replace(/%$/, ""))), b),
    or: (expr: string) => {
      const terms = expr.split(/,(?![^(]*\))/).map(orTerm);
      filters.push((r) => terms.some((f) => f(r)));
      return b;
    },
    order: (c: string) => (orders.push(c), b),
    range: (f: number, t: number) => ((range = [f, t]), b),
    limit: (n: number) => ((limit = n), b),
    update: (p: Row) => ((patch = p), b),
    maybeSingle: () => ((single = true), b),
    then(resolve: (v: { data: unknown; error: null }) => void) {
      let hit = (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
      if (patch) {
        hit.forEach((r) => Object.assign(r, patch));
        resolve({ data: single ? (hit[0] ?? null) : hit, error: null });
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
vi.mock("@/lib/billing/payments", () => ({
  paidByDocument: async (ids: string[]) => new Map(ids.filter((id) => paid.has(id)).map((id) => [id, { total: paid.get(id)!, byLine: new Map() }])),
}));

import { closeWatchesFromRecords } from "../watchRecords";

const JOB = "00000000-0000-4000-8000-000000000001";
const DEPOSIT = "00000000-0000-4000-8000-00000000d001";
const CLOSED_AT = "2026-10-21T15:00:00.000Z";
const day = (n: number) => new Date(Date.UTC(2026, 0, 1) + n * 60_000).toISOString();

const invoice = (n: number): Row => ({ id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`, job_id: JOB, kind: "invoice", number: `4821-${n}`, title: `Progress ${n}`, status: "issued", total_cents: 1_000, supersedes: null, created_at: day(n) });
const deposit = (over: Row = {}): Row => ({ id: DEPOSIT, job_id: JOB, kind: "invoice", number: "4821-01", title: "Deposit", status: "issued", total_cents: 500_000, supersedes: null, created_at: day(5_000), ...over });

beforeEach(() => {
  paid.clear();
  tables.jobs = [{ id: JOB, billing: { award: {} } }];
  tables.job_watches = [{ id: 1, job_id: JOB, kind: "deposit", done_at: CLOSED_AT, done_by: "record: 4821-01 paid in full" }];
  // 1,100 other invoices first, so a read cut at row 1,000 never reaches the deposit.
  tables.documents = Array.from({ length: 1_100 }, (_, n) => invoice(n + 1));
});

describe("closeWatchesFromRecords reads the deposit whatever else the job has", () => {
  it("keeps a record-closed watch closed when its paid deposit comes after 1,100 other invoices", async () => {
    tables.documents.push(deposit());
    paid.set(DEPOSIT, 500_000);
    expect(await closeWatchesFromRecords()).toEqual({ closed: 0, reopened: 0 });
    expect(tables.job_watches[0]).toMatchObject({ done_at: CLOSED_AT, done_by: "record: 4821-01 paid in full" });
  });

  it("finds the deposit the award names, whatever its title", async () => {
    tables.documents.push(deposit({ title: "Initial payment" }));
    tables.jobs[0].billing = { award: { depositId: DEPOSIT } };
    paid.set(DEPOSIT, 500_000);
    expect(await closeWatchesFromRecords()).toEqual({ closed: 0, reopened: 0 });
    expect(tables.job_watches[0].done_at).toBe(CLOSED_AT);
  });

  it("leaves a record-closed watch closed, done_at kept, when no deposit invoice is found", async () => {
    expect(await closeWatchesFromRecords()).toEqual({ closed: 0, reopened: 0 });
    expect(tables.job_watches[0]).toMatchObject({ done_at: CLOSED_AT, done_by: "record: 4821-01 paid in full" });
  });

  it("opens it again when the deposit is found and no longer paid", async () => {
    tables.documents.push(deposit());
    expect(await closeWatchesFromRecords()).toEqual({ closed: 0, reopened: 1 });
    expect(tables.job_watches[0]).toMatchObject({ done_at: null, done_by: "" });
  });

  it("closes an open watch once the deposit is paid, past 1,100 other invoices", async () => {
    tables.job_watches[0] = { id: 1, job_id: JOB, kind: "deposit", done_at: null, done_by: "" };
    tables.documents.push(deposit());
    paid.set(DEPOSIT, 500_000);
    expect(await closeWatchesFromRecords([JOB], new Date(CLOSED_AT))).toEqual({ closed: 1, reopened: 0 });
    expect(tables.job_watches[0]).toMatchObject({ done_at: CLOSED_AT, done_by: "record: 4821-01 paid in full" });
  });
});

describe("closeWatchesFromRecords, the agreement watch (T130)", () => {
  const AGR = "00000000-0000-4000-8000-00000000a001";
  const AGR2 = "00000000-0000-4000-8000-00000000a002";
  const agreement = (over: Row = {}): Row => ({ id: AGR, job_id: JOB, kind: "agreement", number: "A4821-AGR", status: "issued", revision: 1, created_at: day(6_000), ...over });
  const signed = (documentId: string, role = "client"): Row => ({ id: 1, document_id: documentId, kind: "signed", detail: { role } });

  beforeEach(() => {
    tables.job_watches = [{ id: 7, job_id: JOB, kind: "agreement", done_at: null, done_by: "" }];
    tables.document_events = [];
  });

  it("closes the watch once the client signed the issued agreement", async () => {
    tables.documents.push(agreement());
    tables.document_events.push(signed(AGR));
    expect(await closeWatchesFromRecords([JOB], new Date(CLOSED_AT))).toEqual({ closed: 1, reopened: 0 });
    expect(tables.job_watches[0]).toMatchObject({ done_at: CLOSED_AT, done_by: "record: A4821-AGR signed by the client" });
  });

  it("our own signature alone, or an unsigned agreement, closes nothing", async () => {
    tables.documents.push(agreement());
    tables.document_events.push(signed(AGR, "company"));
    expect(await closeWatchesFromRecords([JOB])).toEqual({ closed: 0, reopened: 0 });
    expect(tables.job_watches[0].done_at).toBeNull();
  });

  it("reads the latest revision: a signed one voided and redrafted opens the watch again", async () => {
    tables.job_watches[0] = { id: 7, job_id: JOB, kind: "agreement", done_at: CLOSED_AT, done_by: "record: A4821-AGR signed by the client" };
    tables.documents.push(agreement({ status: "void" }), agreement({ id: AGR2, status: "draft", revision: 2, created_at: day(6_001) }));
    tables.document_events.push(signed(AGR));
    expect(await closeWatchesFromRecords([JOB])).toEqual({ closed: 0, reopened: 1 });
    expect(tables.job_watches[0]).toMatchObject({ done_at: null, done_by: "" });
  });

  it("an owner's reopen stands even with the agreement signed", async () => {
    tables.job_watches[0] = { id: 7, job_id: JOB, kind: "agreement", done_at: null, done_by: "reopened by Marco" };
    tables.documents.push(agreement());
    tables.document_events.push(signed(AGR));
    expect(await closeWatchesFromRecords([JOB])).toEqual({ closed: 0, reopened: 0 });
  });
});
