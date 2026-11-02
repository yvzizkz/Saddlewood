import { beforeEach, describe, expect, it, vi } from "vitest";

// Price it › Send: the register moves to sent (priced on the way, with who and
// when, and a line each on the timeline) only once the email has gone; a dry
// run, a refusal or a mail service that is down leaves it as it was. Against
// a stand-in for the tables and for the billing send path.

type Row = Record<string, unknown>;

const { db, mail } = vi.hoisted(() => ({
  db: { tables: {} as Record<string, Row[]> },
  mail: { result: { status: 200, body: { ok: true, sent: true, emailId: "em_1" } as Record<string, unknown> }, calls: [] as Record<string, unknown>[] },
}));

function from(table: string) {
  const filters: ((r: Row) => boolean)[] = [];
  let patch: Row | null = null;
  const run = () => {
    const hit = (db.tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
    if (patch) for (const r of hit) Object.assign(r, patch);
    return hit;
  };
  const b = {
    insert(row: Row | Row[]) {
      (db.tables[table] ??= []).push(...(Array.isArray(row) ? row : [row]));
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
    in(col: string, vs: unknown[]) {
      filters.push((r) => vs.includes(r[col]));
      return b;
    },
    select: () => b,
    maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
    then: (ok: (v: { error: null }) => unknown) => Promise.resolve((run(), { error: null })).then(ok),
  };
  return b;
}

const DOC = {
  id: "d0000000-0000-4000-8000-000000000010",
  kind: "change_order",
  status: "draft",
  number: "8009-CO10",
  title: "Shear wall",
  clientId: null,
  totalCents: 300000,
  previewToken: "p",
  snapshot: {
    lines: [
      { description: "Hold-downs", amountCents: 180000 },
      { description: "Plywood, about 120 sq ft", amountCents: 120000 },
    ],
  },
};

vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => ({ from }) }));
vi.mock("../deliver", () => ({
  deliver: async (_actor: string, _doc: unknown, input: Record<string, unknown>) => {
    mail.calls.push(input);
    return input.confirm === true ? mail.result : { status: 200, body: { ok: true, sent: false, preview: {} } };
  },
}));
vi.mock("../documents", () => ({
  getDocument: async () => db.tables.doc[0],
  ensurePreviewToken: async (d: unknown) => d,
  createDraft: async () => {
    throw new Error("not here");
  },
  updateDraft: async () => {
    throw new Error("not here");
  },
  totalOf: () => 0,
}));
vi.mock("../exhibits", () => ({ listExhibits: async () => [] }));
vi.mock("@/lib/jobs/hub", () => ({ listJobRefs: async () => [], jobKeyOf: () => null }));
vi.mock("../coIntakeStore", () => ({ nextChangeOrderNumberFor: async () => "8009-CO10" }));

import { followUpChangeOrder, PriceError, sendChangeOrder } from "../coPriceStore";

const co = () => db.tables.change_orders[0];
const events = () => (db.tables.change_order_events ?? []).map((e) => e.kind);

beforeEach(() => {
  mail.result = { status: 200, body: { ok: true, sent: true, emailId: "em_1" } };
  mail.calls = [];
  db.tables = {
    doc: [structuredClone(DOC)],
    change_orders: [{ id: 7, job_id: "j", crew_job_id: null, number: "8009-CO10", title: "Shear wall", detail: "", status: "requested", amount_cents: null, requested_on: "2026-10-30", requested_by: "Chris Turner (AFT)", priced_at: null, document_id: DOC.id }],
    change_order_events: [],
  };
});

describe("sendChangeOrder", () => {
  const msg = { to: ["chris@aft.example"], subject: "s", body: "b" };

  it("a dry run sends nothing and moves nothing", async () => {
    const r = await sendChangeOrder(7, msg, "marco@saddlewoodcontracting.com");
    expect(r.body).toMatchObject({ sent: false });
    expect(co().status).toBe("requested");
    expect(events()).toEqual([]);
  });

  it("once it has gone: priced and sent, with the total, who and when, and both on the timeline", async () => {
    await sendChangeOrder(7, { ...msg, confirm: true }, "marco@saddlewoodcontracting.com");
    expect(co()).toMatchObject({ status: "sent", amount_cents: 300000, priced_by: "marco@saddlewoodcontracting.com" });
    expect(typeof co().priced_at).toBe("string");
    expect(events()).toEqual(["priced", "sent"]);
  });

  it("if the mail does not leave, the register stays where it was", async () => {
    mail.result = { status: 503, body: { ok: false, error: "mail service is not set up" } };
    const r = await sendChangeOrder(7, { ...msg, confirm: true }, "marco");
    expect(r.status).toBe(503);
    expect(co().status).toBe("requested");
    expect(events()).toEqual([]);
  });

  it("refuses before the send path while a line has no price or a blank is left", async () => {
    db.tables.doc[0].snapshot = { lines: [{ description: "Hold-downs", amountCents: 180000 }, { description: "Plywood, about ___ sq ft", amountCents: 0 }] };
    await expect(sendChangeOrder(7, { ...msg, confirm: true }, "marco")).rejects.toMatchObject({
      status: 409,
      blockers: ["Line 2 has no price. Price it, or mark it no charge.", "Line 2 still has a blank to fill."],
    });
    expect(mail.calls).toEqual([]);
    expect(co().status).toBe("requested");
  });

  it("a change order already sent is not sent again", async () => {
    co().status = "sent";
    await expect(sendChangeOrder(7, { ...msg, confirm: true }, "marco")).rejects.toBeInstanceOf(PriceError);
    expect(mail.calls).toEqual([]);
  });
});

describe("followUpChangeOrder", () => {
  const msg = { to: ["chris@aft.example"], subject: "Following up", body: "b" };
  const sentOne = () => {
    Object.assign(co(), { status: "sent" });
    db.tables.doc[0].status = "issued";
  };

  it("only follows up on one that is out and not signed", async () => {
    await expect(followUpChangeOrder(7, msg, "marco")).rejects.toMatchObject({ status: 409, message: "It has not been sent yet." });
    co().status = "signed";
    await expect(followUpChangeOrder(7, msg, "marco")).rejects.toMatchObject({ status: 409 });
    expect(mail.calls).toEqual([]);
  });

  it("checks first and sends nothing; once sent, the register stays sent and the timeline has the follow-up", async () => {
    sentOne();
    expect((await followUpChangeOrder(7, msg, "marco")).body).toMatchObject({ sent: false });
    expect(events()).toEqual([]);
    await followUpChangeOrder(7, { ...msg, confirm: true }, "marco");
    expect(co().status).toBe("sent");
    expect(db.tables.change_order_events).toEqual([{ change_order_id: 7, kind: "sent", actor: "marco", detail: { documentId: DOC.id, emailId: "em_1", to: msg.to, followUp: true } }]);
  });

  it("a follow-up that does not leave is not on the timeline", async () => {
    sentOne();
    mail.result = { status: 503, body: { ok: false, error: "mail service is not set up" } };
    expect((await followUpChangeOrder(7, { ...msg, confirm: true }, "marco")).status).toBe(503);
    expect(events()).toEqual([]);
  });
});
