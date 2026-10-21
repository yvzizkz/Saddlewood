import { beforeEach, describe, expect, it, vi } from "vitest";

// Voiding an invoice that billed a change order puts the change order back to
// signed, so it is owed again on Changes and the schedule of values. Against a
// stand-in for the two tables that really filters and updates.

type Row = Record<string, unknown>;

const { db } = vi.hoisted(() => ({ db: { tables: {} as Record<string, Row[]> } }));

function from(table: string) {
  const filters: ((r: Row) => boolean)[] = [];
  let patch: Row | null = null;
  const run = () => {
    const hit = (db.tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
    if (patch) for (const r of hit) Object.assign(r, patch);
    return hit;
  };
  const b = {
    update(p: Row) {
      patch = p;
      return b;
    },
    eq(col: string, v: unknown) {
      filters.push((r) => r[col] === v);
      return b;
    },
    select: () => b,
    maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
    then: (ok: (v: { error: null }) => unknown) => Promise.resolve((run(), { error: null })).then(ok),
  };
  return b;
}

vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => ({ from }) }));

import { voidDocument } from "../documents";

const DOC = "d0000000-0000-4000-8000-000000000001";
const OTHER = "d0000000-0000-4000-8000-000000000002";

beforeEach(() => {
  db.tables = {
    documents: [{ id: DOC, kind: "invoice", status: "issued", number: "9146-04", snapshot: {}, total_cents: 225000 }],
    change_orders: [
      { id: 1, status: "billed", billed_document_id: DOC },
      { id: 2, status: "billed", billed_document_id: OTHER },
      { id: 3, status: "signed", billed_document_id: null },
    ],
  };
});

describe("voidDocument", () => {
  it("puts a change order the invoice billed back to signed, and leaves the others", async () => {
    await voidDocument(DOC, "wrong amount");
    expect(db.tables.documents[0].status).toBe("void");
    expect(db.tables.change_orders).toEqual([
      { id: 1, status: "signed", billed_document_id: null },
      { id: 2, status: "billed", billed_document_id: OTHER },
      { id: 3, status: "signed", billed_document_id: null },
    ]);
  });

  it("touches no change order when the document was not issued", async () => {
    db.tables.documents[0].status = "draft";
    await expect(voidDocument(DOC, "x")).rejects.toThrow("only an issued document can be voided");
    expect(db.tables.change_orders[0].status).toBe("billed");
  });
});
