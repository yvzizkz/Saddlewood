import { beforeEach, describe, expect, it, vi } from "vitest";

// Intake keys a change order by its thread and item key. The same thread and
// key under another job (a corrected job, or one thread covering two jobs) is
// refused with 409 before anything is written, so job A's draft keeps its
// number, name, address and lines. The same job again still rewrites it.
// Against a stand-in for the tables and drafts that really filters and updates.

type Row = Record<string, unknown>;

const { db, docs } = vi.hoisted(() => ({
  db: { tables: {} as Record<string, Row[]>, nextId: 1 },
  docs: new Map<string, { id: string; number: string; title: string; status: string; snapshot: Record<string, unknown>; jobId: string }>(),
}));

function from(table: string) {
  const filters: ((r: Row) => boolean)[] = [];
  let patch: Row | null = null;
  let insert: Row | null = null;
  let del = false;
  const run = () => {
    const rows = (db.tables[table] ??= []);
    if (insert) {
      const row = { id: db.nextId++, ...insert };
      rows.push(row);
      return [row];
    }
    const hit = rows.filter((r) => filters.every((f) => f(r)));
    if (patch) for (const r of hit) Object.assign(r, patch);
    if (del) db.tables[table] = rows.filter((r) => !hit.includes(r));
    return hit;
  };
  const b = {
    insert(r: Row) {
      insert = r;
      return b;
    },
    update(p: Row) {
      patch = p;
      return b;
    },
    delete() {
      del = true;
      return b;
    },
    eq(col: string, v: unknown) {
      filters.push((r) => r[col] === v);
      return b;
    },
    select: () => b,
    single: async () => ({ data: run()[0] ?? null, error: null }),
    maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
    then: (ok: (v: { data: Row[]; error: null }) => unknown) => Promise.resolve({ data: run(), error: null }).then(ok),
  };
  return b;
}

vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => ({ from }) }));

vi.mock("@/lib/jobs/hub", () => ({
  getJobRef: async (key: string) =>
    ({
      a: { key: "a", name: "Ironwood", address: "8009 N Ironwood Dr", billingId: "job-a", crewId: null },
      b: { key: "b", name: "Saguaro", address: "12 E Saguaro Rd", billingId: "job-b", crewId: null },
    })[key] ?? null,
}));

vi.mock("../documents", () => {
  class DocumentError extends Error {
    constructor(
      message: string,
      readonly status: number,
    ) {
      super(message);
    }
  }
  return {
    DocumentError,
    usedNumbers: async (_kind: string, jobId: string) => [...docs.values()].filter((d) => d.jobId === jobId).map((d) => d.number),
    createDraft: async (d: { jobId: string; number: string; title: string; snapshot: Record<string, unknown> }) => {
      const doc = { id: `doc-${docs.size + 1}`, number: d.number, title: d.title, status: "draft", snapshot: d.snapshot, jobId: d.jobId };
      docs.set(doc.id, doc);
      return doc;
    },
    getDocument: async (id: string) => docs.get(id) ?? null,
    updateDraft: async (id: string, p: { title: string; snapshot: Record<string, unknown> }) => Object.assign(docs.get(id)!, p),
  };
});

import { IntakeError, runIntake } from "../coIntakeStore";
import type { Intake } from "../coIntake";

const lvl = (description: string) => ({ key: "lvl", title: "LVL at openings", lines: [{ description }] });
const request = (job: string, description = "Single LVL, 4 openings"): Intake => ({
  sourceRef: "thread-1030",
  job,
  requestedBy: "Chris Turner (AFT)",
  requestedOn: "2026-10-30",
  items: [lvl(description)],
});

beforeEach(() => {
  docs.clear();
  db.nextId = 1;
  db.tables = {
    jobs: [
      { id: "job-a", name: "Ironwood", address: "8009 N Ironwood Dr", number_prefix: "8009", client_id: null },
      { id: "job-b", name: "Saguaro", address: "12 E Saguaro Rd", number_prefix: "12", client_id: null },
    ],
    change_orders: [],
    change_order_events: [],
  };
});

/** Job A's row and draft, as they are now. */
const jobA = () => {
  const row = db.tables.change_orders.find((r) => r.job_id === "job-a")!;
  const doc = docs.get(row.document_id as string)!;
  return { number: row.number, title: row.title, docNumber: doc.number, job: doc.snapshot.job, lines: doc.snapshot.lines };
};

describe("change-order intake: one thread item is one change order on one job", () => {
  it("still rewrites the untouched draft when the same job sends it again", async () => {
    const [made] = await runIntake(request("a"), "bot");
    expect(made).toMatchObject({ action: "created", number: "8009-CO1" });
    const [again] = await runIntake(request("a", "Single LVL, 5 openings"), "bot");
    expect(again).toMatchObject({ action: "updated", number: "8009-CO1", changeOrderId: made.changeOrderId });
    expect(jobA().lines).toEqual([{ description: "Single LVL, 5 openings", amountCents: 0 }]);
  });

  it("refuses the same thread re-posted with a corrected job, and leaves job A's draft as it was", async () => {
    await runIntake(request("a"), "bot");
    const before = jobA();
    const err = await runIntake(request("b", "Double LVL"), "bot").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(IntakeError);
    expect(err).toMatchObject({ status: 409, message: expect.stringContaining('thread thread-1030 item "lvl" is already 8009-CO1 on Ironwood') });
    expect(jobA()).toEqual(before);
    expect(jobA().job).toEqual({ name: "Ironwood", address: "8009 N Ironwood Dr" });
    expect(db.tables.change_orders).toHaveLength(1);
    expect(docs.size).toBe(1);
  });

  it("refuses one thread covering two jobs with the same key, and writes none of that request", async () => {
    await runIntake(request("a"), "bot");
    const before = jobA();
    const both: Intake = { ...request("b"), items: [{ key: "door", title: "Widen the door", lines: [{ description: "Header" }] }, lvl("Saguaro LVL")] };
    await expect(runIntake(both, "bot")).rejects.toMatchObject({ status: 409 });
    expect(jobA()).toEqual(before);
    // Not even the item that was new: a refused request leaves nothing half taken in.
    expect(db.tables.change_orders.map((r) => r.source_key)).toEqual(["lvl"]);
    expect(db.tables.change_order_events.filter((e) => e.kind === "updated")).toEqual([]);
  });
});
