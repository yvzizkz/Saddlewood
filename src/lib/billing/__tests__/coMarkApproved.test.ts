import { beforeEach, describe, expect, it, vi } from "vitest";

// An owner records a change order approved outside its link: who, the day,
// the proof on its document, the register signed, one timeline line, Joist
// queued. Once, only from sent or priced; a file put up for an approval that
// loses the race is taken down. Against stand-ins for the table and helpers.

type Row = Record<string, unknown>;

const { db, calls } = vi.hoisted(() => ({
  db: { rows: [] as Row[], loseRace: false },
  calls: { exhibits: [] as Row[], removed: [] as string[], events: [] as Row[], joist: [] as unknown[][] },
}));

function from() {
  const filters: ((r: Row) => boolean)[] = [];
  let patch: Row | null = null;
  const run = () => {
    const hit = db.loseRace && patch ? [] : db.rows.filter((r) => filters.every((f) => f(r)));
    if (patch) for (const r of hit) Object.assign(r, patch);
    return { data: hit.map((r) => ({ ...r })), error: null };
  };
  const b = {
    select: () => b,
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
    maybeSingle: async () => ({ data: run().data[0] ?? null, error: null }),
    then: (ok: (v: unknown) => unknown) => Promise.resolve(run()).then(ok),
  };
  return b;
}

vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => ({ from }) }));
vi.mock("../exhibits", () => ({
  addFileExhibit: async (x: Row) => {
    calls.exhibits.push(x);
    return { id: "ex-1" };
  },
  removeExhibit: async (id: string) => {
    calls.removed.push(id);
    return true;
  },
}));
vi.mock("../coEvents", () => ({ coEventsAfter: async (ids: number[], kind: string, actor: string, detail: Row) => void calls.events.push({ ids, kind, actor, detail }) }));
vi.mock("../joistSyncStore", () => ({ queueJoist: async (...a: unknown[]) => void calls.joist.push(a) }));

import { markChangeOrderApproved } from "../coApprove";

const pdf = { filename: "CO7 signed.pdf", content: Buffer.from("%PDF-1.4"), contentType: "application/pdf" };
const base = { name: "Chris Turner", signedOn: "2026-11-01", note: "Signed at the site meeting" };

beforeEach(() => {
  db.rows = [{ id: 7, status: "sent", amount_cents: 48500, document_id: "doc-7", signed_on: null }];
  db.loseRace = false;
  calls.exhibits = [];
  calls.removed = [];
  calls.events = [];
  calls.joist = [];
});

describe("markChangeOrderApproved", () => {
  it("keeps the signed copy on its document, signs the register on that day, one timeline line, Joist queued", async () => {
    const r = await markChangeOrderApproved(7, { ...base, file: pdf }, "marco@x.com", "2026-11-02");
    expect(r).toEqual({ signedOn: "2026-11-01", exhibitId: "ex-1" });
    expect(calls.exhibits[0]).toMatchObject({ documentId: "doc-7", label: "Signed copy", filename: "CO7 signed.pdf", addedBy: "marco@x.com" });
    expect(db.rows[0]).toMatchObject({ status: "signed", signed_on: "2026-11-01" });
    expect(calls.events).toEqual([{ ids: [7], kind: "signed", actor: "marco@x.com", detail: { signedOn: "2026-11-01", amountCents: 48500, name: "Chris Turner", via: "mark", proof: "ex-1", note: "Signed at the site meeting" } }]);
    expect(calls.joist).toEqual([[7, "signed"]]);
  });

  it("takes a yes with no file too", async () => {
    await markChangeOrderApproved(7, base, "marco@x.com", "2026-11-02");
    expect(calls.exhibits).toEqual([]);
    expect(calls.events[0].detail).toMatchObject({ proof: null });
  });

  it("refuses one already approved, one not open, one with no price, a future day and no name; nothing written", async () => {
    for (const [row, input, msg] of [
      [{ status: "signed" }, base, "already approved"],
      [{ status: "billed" }, base, "already approved"],
      [{ status: "rejected" }, base, "cannot be approved"],
      [{ status: "priced", amount_cents: null }, base, "Price it first"],
      [{}, { ...base, signedOn: "2026-11-03" }, "cannot be in the future"],
      [{}, { ...base, name: " " }, "Say who approved it"],
    ] as [Row, typeof base, string][]) {
      db.rows = [{ id: 7, status: "sent", amount_cents: 48500, document_id: "doc-7", ...row }];
      await expect(markChangeOrderApproved(7, { ...input, file: pdf }, "marco@x.com", "2026-11-02")).rejects.toThrow(msg);
    }
    expect([calls.exhibits, calls.events, calls.joist]).toEqual([[], [], []]);
  });

  it("takes the file back down when someone else moved it first", async () => {
    db.loseRace = true;
    await expect(markChangeOrderApproved(7, { ...base, file: pdf }, "marco@x.com", "2026-11-02")).rejects.toMatchObject({ status: 409 });
    expect(calls.removed).toEqual(["ex-1"]);
    expect(calls.events).toEqual([]);
  });
});
