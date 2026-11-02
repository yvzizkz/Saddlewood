import { beforeEach, describe, expect, it, vi } from "vitest";

// Price it › Save. A change order priced on the register before it had a
// document keeps that price when its draft is made. Taking every price off one
// that was priced puts it back to waiting for its price (a priced change order
// always has an amount: change_orders_priced_check, enforced by the stand-in
// below), and a draft that cannot be written leaves the register as it was.

type Row = Record<string, unknown>;

const { db, drafts } = vi.hoisted(() => ({
  db: { tables: {} as Record<string, Row[]> },
  drafts: { docs: new Map<string, Row>(), failUpdate: false },
}));

const pricedCheck = (r: Row) => ["requested", "rejected", "void"].includes(r.status as string) || r.amount_cents !== null;

function from(table: string) {
  const filters: ((r: Row) => boolean)[] = [];
  let patch: Row | null = null;
  const run = () => {
    const hit = (db.tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
    if (patch) {
      if (table === "change_orders" && hit.some((r) => !pricedCheck({ ...r, ...patch }))) return { data: null, error: { message: 'violates check constraint "change_orders_priced_check"' } };
      for (const r of hit) Object.assign(r, patch);
    }
    // Copies, as the real client returns: what was read never changes under the caller.
    return { data: hit.map((r) => ({ ...r })), error: null };
  };
  const b = {
    insert(rows: Row | Row[]) {
      (db.tables[table] ??= []).push(...(Array.isArray(rows) ? rows : [rows]));
      return Promise.resolve({ error: null });
    },
    update(p: Row) {
      patch = p;
      return b;
    },
    eq(col: string, v: unknown) {
      filters.push((r) => r[col] === v);
      return b;
    },
    is(col: string, v: unknown) {
      filters.push((r) => (r[col] ?? null) === v);
      return b;
    },
    in(col: string, vs: unknown[]) {
      filters.push((r) => vs.includes(r[col]));
      return b;
    },
    select: () => b,
    order: () => b,
    maybeSingle: async () => {
      const r = run();
      return { data: r.data?.[0] ?? null, error: r.error };
    },
    then: (ok: (v: unknown) => unknown) => Promise.resolve(run()).then(ok),
  };
  return b;
}

vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => ({ from }) }));
vi.mock("../deliver", () => ({ deliver: async () => ({ status: 200, body: { ok: true, sent: false } }) }));
vi.mock("../documents", () => ({
  getDocument: async (id: string) => drafts.docs.get(id) ?? null,
  ensurePreviewToken: async (d: unknown) => d,
  createDraft: async (d: Row) => {
    const doc = { ...d, id: "doc-new", status: "draft", previewToken: "p", totalCents: 0 };
    drafts.docs.set(doc.id, doc);
    return doc;
  },
  updateDraft: async (id: string, p: Row) => {
    if (drafts.failUpdate) throw new Error("documents update failed");
    return Object.assign(drafts.docs.get(id)!, p);
  },
  totalOf: (s: { lines?: { amountCents: number }[] }) => (s.lines ?? []).reduce((t, l) => t + l.amountCents, 0),
}));
vi.mock("../exhibits", () => ({ listExhibits: async () => [] }));
vi.mock("@/lib/jobs/hub", () => ({ listJobRefs: async () => [], jobKeyOf: () => null }));
vi.mock("../coIntakeStore", () => ({ nextChangeOrderNumberFor: async () => "8009-CO11" }));

import { loadPriceIt, savePrices } from "../coPriceStore";

const co = () => db.tables.change_orders[0];
const priced = { id: 7, job_id: "j", crew_job_id: null, number: "8009-CO11", title: "Hose bib", detail: "", status: "priced", amount_cents: 48500, requested_on: "2026-10-30", requested_by: "Chris Turner (AFT)", priced_at: "2026-10-31T17:00:00Z", priced_by: "marco@saddlewoodcontracting.com" };
const zero = { title: "Hose bib", note: "", lines: [{ description: "Hose bib", note: "", amountCents: 0, noCharge: false }] };

beforeEach(() => {
  drafts.docs.clear();
  drafts.failUpdate = false;
  db.tables = { jobs: [{ id: "j", name: "Ironwood", address: null, number_prefix: "8009", client_id: null }], change_orders: [], change_order_events: [], client_contacts: [] };
});

describe("Price it: a change order priced before it had a document", () => {
  it("starts its draft at the price on the register, not $0", async () => {
    db.tables.change_orders = [{ ...priced, document_id: null }];
    const p = await loadPriceIt(7, "marco");
    expect(p.doc.snapshot.lines).toEqual([{ description: "Hose bib", amountCents: 48500 }]);
    expect(co().document_id).toBe("doc-new");
  });
});

describe("savePrices: every price taken off", () => {
  beforeEach(() => {
    db.tables.change_orders = [{ ...priced, document_id: "doc-1" }];
    drafts.docs.set("doc-1", { id: "doc-1", status: "draft", title: "Hose bib", previewToken: "p", snapshot: { lines: [{ description: "Hose bib", amountCents: 48500 }] } });
  });

  it("puts a priced one back to waiting for its price, with no amount and no one who priced it", async () => {
    await savePrices(7, zero, "marco");
    expect(co()).toMatchObject({ status: "requested", amount_cents: null, priced_at: null, priced_by: "" });
    expect((drafts.docs.get("doc-1")!.snapshot as { lines: { amountCents: number }[] }).lines[0].amountCents).toBe(0);
    expect(db.tables.change_order_events.map((e) => e.kind)).toEqual(["updated"]);
  });

  it("leaves the register as it was when the draft cannot be written", async () => {
    drafts.failUpdate = true;
    await expect(savePrices(7, zero, "marco")).rejects.toThrow("documents update failed");
    expect(co()).toMatchObject({ status: "priced", amount_cents: 48500, priced_by: "marco@saddlewoodcontracting.com" });
  });

  it("keeps a priced one priced at its new total", async () => {
    await savePrices(7, { ...zero, lines: [{ ...zero.lines[0], amountCents: 52000 }] }, "marco");
    expect(co()).toMatchObject({ status: "priced", amount_cents: 52000 });
  });
});
