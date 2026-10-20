import { beforeEach, describe, expect, it, vi } from "vitest";

import { computeDraw, type ProgressLine } from "../progress";

// Progress billing against a stand-in database: a read that fails is an error
// (not "no draws"), a draft whose rows can't be saved is taken back out, a
// draft draw can be discarded (its change orders back to signed), Award's
// deposit is credited so the job bills 100%, and a saved opening is the whole
// truth.

type Row = Record<string, unknown>;
const { db } = vi.hoisted(() => ({ db: { t: {} as Record<string, Row[]>, fail: {} as Record<string, string>, nextId: 1 } }));

function from(table: string) {
  const filters: ((r: Row) => boolean)[] = [];
  let mode: "select" | "update" | "delete" | "insert" = "select";
  let patch: Row | null = null;
  let ins: Row[] = [];
  const rows = () => (db.t[table] ?? []).filter((r) => filters.every((f) => f(r)));
  const run = () => {
    if (db.fail[`${table}:${mode}`]) return { data: null, error: { message: db.fail[`${table}:${mode}`] } };
    if (mode === "insert") return (db.t[table].push(...ins), { data: null, error: null });
    if (mode === "delete") return ((db.t[table] = db.t[table].filter((r) => !filters.every((f) => f(r)))), { data: null, error: null });
    const hit = rows();
    if (mode === "update") for (const r of hit) Object.assign(r, patch);
    if (table === "sov_progress") return { data: hit.map((r) => ({ ...r, documents: db.t.documents.find((d) => d.id === r.document_id) })), error: null };
    return { data: hit, error: null };
  };
  const b = {
    select: () => b,
    insert: (r: Row | Row[]) => ((mode = "insert"), (ins = Array.isArray(r) ? r : [r]), b),
    update: (p: Row) => ((mode = "update"), (patch = p), b),
    delete: () => ((mode = "delete"), b),
    eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), b),
    in: (c: string, v: unknown[]) => (filters.push((r) => v.includes(r[c])), b),
    maybeSingle: async () => {
      const res = run();
      return { data: (res.data as Row[] | null)?.[0] ?? null, error: res.error };
    },
    then: (ok: (v: unknown) => unknown) => Promise.resolve(run()).then(ok),
  };
  return b;
}

vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => ({ from }) }));
vi.mock("@/lib/crew/time", () => ({ localDay: () => "2026-10-20" }));
vi.mock("../documents", () => ({
  usedNumbers: async () => [],
  createDraft: async (i: { number: string; jobId: string }) => {
    const d = { id: `doc${db.nextId++}`, number: i.number || "D-1", status: "draft", created_at: new Date().toISOString(), job_id: i.jobId };
    db.t.documents.push(d);
    return d;
  },
}));

import { createDrawDraft, discardDraw, loadProgress, setOpening } from "../progressStore";

const JOB = "job-1";
const job = (billing: Row) => ({ id: JOB, name: "Powell", address: "", client_id: "c1", number_prefix: "3526", billing });
const SOV = [
  { description: "Framing", amountCents: 100_000, kind: "section" },
  { description: "Drywall", amountCents: 100_000, kind: "section" },
];

beforeEach(() => {
  db.fail = {};
  db.nextId = 1;
  db.t = {
    jobs: [job({ sov: SOV })],
    clients: [{ id: "c1", billing: {} }],
    change_orders: [],
    sov_progress: [],
    documents: [],
  };
});

describe("loadProgress", () => {
  it("throws when the draws, change orders or client can't be read", async () => {
    for (const t of ["sov_progress", "change_orders", "clients"]) {
      db.fail = { [`${t}:select`]: "connection reset" };
      await expect(loadProgress(JOB), t).rejects.toThrow(/connection reset/);
    }
  });
});

describe("createDrawDraft", () => {
  it("takes the draft back out when its rows can't be saved", async () => {
    db.fail = { "sov_progress:insert": 'relation "public.sov_progress" does not exist' };
    await expect(createDrawDraft(JOB, { "sov:0": 50 }, "lando")).rejects.toThrow(/sov_progress insert/);
    expect(db.t.documents).toEqual([]);
  });
});

describe("discardDraw", () => {
  it("deletes the draft and its rows and puts a change order it billed back to signed", async () => {
    db.t.change_orders = [{ id: 7, job_id: JOB, number: "CO-1", title: "Soffit", amount_cents: 20_000, status: "signed", billed_document_id: null }];
    const made = await createDrawDraft(JOB, { "sov:0": 50, "co:7": 100 }, "lando");
    expect(db.t.change_orders[0]).toMatchObject({ status: "billed", billed_document_id: made.documentId });
    await expect(createDrawDraft(JOB, { "sov:1": 10 }, "lando")).rejects.toThrow(/Issue it or discard it/);

    expect(await discardDraw(JOB)).toBe(made.number);
    expect(db.t.documents).toEqual([]);
    expect(db.t.sov_progress).toEqual([]);
    expect(db.t.change_orders[0]).toMatchObject({ status: "signed", billed_document_id: null });
    expect((await loadProgress(JOB)).openDraft).toBeNull();
  });
});

describe("the deposit", () => {
  it("is credited across the draws so a job taken to 100% bills the contract once", async () => {
    db.t.jobs = [job({ sov: SOV, award: { depositId: "dep" } })];
    db.t.documents.push({ id: "dep", number: "3526-01", status: "issued", total_cents: 20_000, created_at: "2026-09-01T00:00:00Z" });
    let net = 20_000; // the deposit invoice
    for (const asked of [{ "sov:0": 30 }, { "sov:0": 75, "sov:1": 40 }, { "sov:0": 100, "sov:1": 100 }] as Record<string, number>[]) {
      const made = await createDrawDraft(JOB, asked, "lando");
      net += made.draw.dueCents;
      db.t.documents.find((d) => d.id === made.documentId)!.status = "issued";
    }
    expect(net).toBe(200_000);
    const after = await loadProgress(JOB);
    expect(after.deposit).toMatchObject({ cents: 20_000, appliedCents: 20_000 });
  });

  it("credits pro rata of what is left to bill, and all of it on the last draw", () => {
    const lines: ProgressLine[] = [{ key: "sov:0", description: "All", scheduledCents: 100_000, billedToDateCents: 0, pctToDate: 0, kind: "sov" }];
    expect(computeDraw(lines, { "sov:0": 25 }, 0, { cents: 10_000, appliedCents: 0 }).depositCents).toBe(2_500);
    expect(computeDraw(lines, { "sov:0": 100 }, 0, { cents: 10_000, appliedCents: 0 }).depositCents).toBe(10_000);
    expect(computeDraw(lines, { "sov:0": 25 }, 0, null).depositCents).toBe(0);
  });
});

describe("setOpening", () => {
  it("keeps every line as sent, zeros included, and a legacy billedPct no longer comes back", async () => {
    db.t.jobs = [job({ sov: [{ label: "Framing", cents: 100_000, billedPct: 60 }, { label: "Drywall", cents: 100_000, billedPct: 30 }] })];
    expect((await loadProgress(JOB)).opening).toEqual({ "sov:0": 60, "sov:1": 30 });
    await setOpening(JOB, { "sov:0": 0, "sov:1": 45 }, "lando");
    const after = await loadProgress(JOB);
    expect(after.opening).toEqual({ "sov:0": 0, "sov:1": 45 });
    expect(after.lines.map((l) => l.pctToDate)).toEqual([0, 45]);
  });
});
