import { beforeEach, describe, expect, it, vi } from "vitest";

import { computeDraw, type ProgressLine } from "../progress";

// Progress billing against a stand-in database: a read that fails is an error
// (not "no draws"), a draft whose rows can't be saved is taken back out, a
// draft draw can be discarded (its change orders back to signed), Award's
// deposit is credited so the job bills 100%, a saved opening is the whole
// truth, and a line is keyed by its sov_lines id, whatever its place.

type Row = Record<string, unknown>;
const { db } = vi.hoisted(() => ({ db: { t: {} as Record<string, Row[]>, fail: {} as Record<string, string>, nextId: 1 } }));

function from(table: string) {
  const filters: ((r: Row) => boolean)[] = [];
  let sortBy: string | null = null;
  let mode: "select" | "update" | "delete" | "insert" = "select";
  let patch: Row | null = null;
  let ins: Row[] = [];
  const rows = () => (db.t[table] ?? []).filter((r) => filters.every((f) => f(r)));
  const run = () => {
    if (db.fail[`${table}:${mode}`]) return { data: null, error: { message: db.fail[`${table}:${mode}`] } };
    if (mode === "insert") return (db.t[table].push(...ins), { data: null, error: null });
    if (mode === "delete") return ((db.t[table] = db.t[table].filter((r) => !filters.every((f) => f(r)))), { data: null, error: null });
    const hit = rows();
    if (sortBy) hit.sort((x, y) => Number(x[sortBy!]) - Number(y[sortBy!]));
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
    order: (c: string) => ((sortBy = c), b),
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
// Ids that are not the positions, so a key by index would miss.
const SOV = [
  { id: 41, job_id: JOB, position: 0, description: "Framing", amount_cents: 100_000, kind: "section" },
  { id: 42, job_id: JOB, position: 1, description: "Drywall", amount_cents: 100_000, kind: "section" },
];
const [FRAMING, DRYWALL] = ["line:41", "line:42"];

beforeEach(() => {
  db.fail = {};
  db.nextId = 1;
  db.t = {
    jobs: [job({})],
    sov_lines: SOV.map((l) => ({ ...l })),
    clients: [{ id: "c1", billing: {} }],
    change_orders: [],
    change_order_events: [],
    sov_progress: [],
    documents: [],
  };
});

describe("loadProgress", () => {
  it("throws when the draws, change orders or client can't be read", async () => {
    for (const t of ["sov_progress", "sov_lines", "change_orders", "clients"]) {
      db.fail = { [`${t}:select`]: "connection reset" };
      await expect(loadProgress(JOB), t).rejects.toThrow(/connection reset/);
    }
  });
});

describe("createDrawDraft", () => {
  it("takes the draft back out when its rows can't be saved", async () => {
    db.fail = { "sov_progress:insert": 'relation "public.sov_progress" does not exist' };
    await expect(createDrawDraft(JOB, { [FRAMING]: 50 }, "lando")).rejects.toThrow(/sov_progress insert/);
    expect(db.t.documents).toEqual([]);
  });
});

describe("discardDraw", () => {
  it("deletes the draft and its rows and puts a change order it billed back to signed", async () => {
    db.t.change_orders = [{ id: 7, job_id: JOB, number: "CO-1", title: "Soffit", amount_cents: 20_000, status: "signed", billed_document_id: null }];
    const made = await createDrawDraft(JOB, { [FRAMING]: 50, "co:7": 100 }, "lando");
    expect(db.t.change_orders[0]).toMatchObject({ status: "billed", billed_document_id: made.documentId });
    await expect(createDrawDraft(JOB, { [DRYWALL]: 10 }, "lando")).rejects.toThrow(/Issue it or discard it/);

    expect(await discardDraw(JOB)).toBe(made.number);
    expect(db.t.documents).toEqual([]);
    expect(db.t.sov_progress).toEqual([]);
    expect(db.t.change_orders[0]).toMatchObject({ status: "signed", billed_document_id: null });
    expect(db.t.change_order_events.map((e) => [e.change_order_id, e.kind, (e.detail as Row).why ?? (e.detail as Row).invoice])).toEqual([
      [7, "billed", made.number],
      [7, "updated", `draft draw ${made.number} was discarded`],
    ]);
    expect((await loadProgress(JOB)).openDraft).toBeNull();
  });
});

describe("the deposit", () => {
  it("is credited across the draws so a job taken to 100% bills the contract once", async () => {
    db.t.jobs = [job({ award: { depositId: "dep" } })];
    db.t.documents.push({ id: "dep", number: "3526-01", status: "issued", total_cents: 20_000, created_at: "2026-09-01T00:00:00Z" });
    let net = 20_000; // the deposit invoice
    for (const asked of [{ [FRAMING]: 30 }, { [FRAMING]: 75, [DRYWALL]: 40 }, { [FRAMING]: 100, [DRYWALL]: 100 }] as Record<string, number>[]) {
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
  it("keeps every line as sent, zeros included", async () => {
    db.t.jobs = [job({ sovOpening: { [FRAMING]: 60, [DRYWALL]: 30 } })];
    expect((await loadProgress(JOB)).opening).toEqual({ [FRAMING]: 60, [DRYWALL]: 30 });
    await setOpening(JOB, { [FRAMING]: 0, [DRYWALL]: 45 }, "lando");
    const after = await loadProgress(JOB);
    expect(after.opening).toEqual({ [FRAMING]: 0, [DRYWALL]: 45 });
    expect(after.lines.map((l) => l.pctToDate)).toEqual([0, 45]);
  });

  it("refuses an index key from before the move", async () => {
    await expect(setOpening(JOB, { "sov:0": 50 }, "lando")).rejects.toThrow(/No line sov:0/);
  });
});

describe("the schedule of values", () => {
  it("lists the lines in their place and keys each by its id, so a draw follows the line, not the slot", async () => {
    db.t.sov_lines = [
      { id: 42, job_id: JOB, position: 0, description: "Drywall", amount_cents: 100_000, kind: "section" },
      { id: 41, job_id: JOB, position: 1, description: "Framing", amount_cents: 100_000, kind: "section" },
      { id: 50, job_id: "other", position: 0, description: "Not this job", amount_cents: 5_000, kind: "section" },
    ];
    const made = await createDrawDraft(JOB, { [FRAMING]: 50 }, "lando");
    expect(db.t.sov_progress).toEqual([expect.objectContaining({ document_id: made.documentId, line_key: FRAMING, description: "Framing", amount_cents: 50_000 })]);
    const after = await loadProgress(JOB);
    expect(after.lines.map((l) => [l.key, l.description, l.billedToDateCents])).toEqual([
      [DRYWALL, "Drywall", 0],
      [FRAMING, "Framing", 50_000],
    ]);
  });
});
