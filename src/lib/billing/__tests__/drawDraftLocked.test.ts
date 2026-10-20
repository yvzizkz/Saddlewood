import { beforeEach, describe, expect, it, vi } from "vitest";

// A progress draw's draft can't have its lines, total, job or kind changed:
// sov_progress records what the draw billed per line, and an edited invoice
// would bill the client something else while every later draw kept counting
// the original. Its title or due date can still change, and ordinary drafts
// stay editable.

type Row = Record<string, unknown>;
const { db } = vi.hoisted(() => ({ db: { tables: {} as Record<string, Row[]> } }));

function from(table: string) {
  const filters: ((r: Row) => boolean)[] = [];
  let patch: Row | null = null;
  const rows = () => (db.tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
  const b = {
    select: () => b,
    update: (p: Row) => ((patch = p), b),
    eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), b),
    is: (c: string, v: unknown) => (filters.push((r) => (r[c] ?? null) === v), b),
    limit: () => b,
    maybeSingle: async () => {
      const hit = rows();
      if (patch) for (const r of hit) Object.assign(r, patch);
      return { data: hit[0] ?? null, error: null };
    },
    then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: rows(), error: null }).then(ok),
  };
  return b;
}

vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => ({ from }) }));

import { updateDraft } from "../documents";

const DRAW = "d0000000-0000-4000-8000-000000000001";
const PLAIN = "d0000000-0000-4000-8000-000000000002";
const doc = (id: string) => ({ id, kind: "invoice", status: "draft", token: null, number: id === DRAW ? "3526-09" : "3526-10", title: "Draft", snapshot: { lines: [{ description: "Framing", amountCents: 825_000 }] }, total_cents: 825_000, job_id: "j1", client_id: "c1" });
const SNAP = { lines: [{ description: "Framing", amountCents: 500_000 }] } as never;

beforeEach(() => {
  db.tables = {
    documents: [doc(DRAW), doc(PLAIN)],
    sov_progress: [{ id: 1, document_id: DRAW, line_key: "sov:0", amount_cents: 825_000 }],
  };
});

describe("updateDraft on a progress draw", () => {
  it("refuses new lines, a new job or a new kind, and leaves the draft as it was", async () => {
    await expect(updateDraft(DRAW, { snapshot: SNAP })).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/Discard it on the job's Money tab/) });
    await expect(updateDraft(DRAW, { jobId: "j2" })).rejects.toMatchObject({ status: 409 });
    await expect(updateDraft(DRAW, { kind: "statement" } as never)).rejects.toMatchObject({ status: 409 });
    expect(db.tables.documents[0]).toMatchObject({ total_cents: 825_000, job_id: "j1", kind: "invoice" });
  });

  it("still lets its title or due date change", async () => {
    const d = await updateDraft(DRAW, { title: "Progress draw #4" });
    expect(d.title).toBe("Progress draw #4");
  });

  it("leaves an ordinary draft editable", async () => {
    await updateDraft(PLAIN, { snapshot: SNAP });
    expect(db.tables.documents[1].total_cents).toBe(500_000);
  });
});
