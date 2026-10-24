import { beforeEach, describe, expect, it, vi } from "vitest";

// POST /d/<token>/sign (T130): the client signs the job's issued agreement on
// its link, once. Through the real route, store and proof-record code, against
// stand-in documents and document_events tables (the dedupe index refuses a
// second line with the same key, like 0012's). Push and the watch settling
// are stand-ins too.

type Row = Record<string, unknown>;
const { tables, settled } = vi.hoisted(() => ({ tables: { documents: [] as Row[], document_events: [] as Row[] }, settled: [] as unknown[] }));

function from(table: "documents" | "document_events") {
  const filters: ((r: Row) => boolean)[] = [];
  let inserted: Row | null = null;
  let single = false;
  const b = {
    select: () => b,
    eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), b),
    order: () => b,
    insert: (row: Row) => ((inserted = row), b),
    maybeSingle: () => ((single = true), b),
    then(resolve: (v: { data: unknown; error: { code: string; message: string } | null }) => void) {
      if (inserted) {
        const row = inserted;
        if (row.dedupe && tables[table].some((r) => r.dedupe === row.dedupe)) return resolve({ data: null, error: { code: "23505", message: "duplicate key" } });
        tables[table].push({ id: tables[table].length + 1, at: new Date(Date.UTC(2026, 9, 23, 18, tables[table].length)).toISOString(), ...row });
        return resolve({ data: null, error: null });
      }
      const hit = tables[table].filter((r) => filters.every((f) => f(r)));
      resolve({ data: single ? (hit[0] ?? null) : hit, error: null });
    },
  };
  return b;
}

vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => ({ from }) }));
vi.mock("@/lib/bot/push", () => ({ sendPush: async () => undefined }));
vi.mock("@/lib/crew/notify", () => ({ laneAddresses: async () => [] }));
vi.mock("@/lib/sales/watchRecords", () => ({ settleWatches: async (ids: unknown) => void settled.push(ids) }));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: () => undefined }));

import { POST } from "../sign/route";
import { snapshotHash } from "@/lib/sales/signing";

const TOKEN = "a".repeat(32);
const JOB = "00000000-0000-4000-8000-0000000000b1";
const PNG = `data:image/png;base64,${Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(200, 1)]).toString("base64")}`;
const snapshot = { job: { name: "Kitchen" }, lines: [{ description: "Contract Price", amountCents: 4712500 }], agreement: { v: 1, type: "prime_residential", text: "# AGREEMENT\n\nThe words.", proposal: { documentId: "p", number: "EST-1", revision: 1, packageName: "Premium", options: [] } } };

function agreement(over: Row = {}): Row {
  return {
    id: "00000000-0000-4000-8000-0000000000a1", kind: "agreement", job_id: JOB, client_id: null, number: "A1-AGR", title: "Agreement: Kitchen", status: "issued", revision: 1, supersedes: null,
    snapshot, total_cents: 4712500, due_date: null, token: TOKEN, issued_at: "2026-10-23T17:00:00Z", issued_by: "Marco", void_reason: "", created_at: "2026-10-23T16:00:00Z", ...over,
  };
}

const body = (over: Row = {}) => ({ name: "Heather  Client", email: "heather@example.com", method: "draw", image: PNG, agree: true, ...over });
const sign = (b: unknown, token = TOKEN) =>
  POST(new Request(`http://x/d/${token}/sign`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.9, 10.0.0.1", "user-agent": "Phone" }, body: JSON.stringify(b) }) as never, { params: Promise.resolve({ token }) });

beforeEach(() => {
  tables.documents = [agreement()];
  tables.document_events = [];
  settled.length = 0;
});

describe("POST /d/<token>/sign", () => {
  it("records the client's signature once, tied to the frozen agreement, and settles the job's watches", async () => {
    const res = await sign(body());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, signed: { name: "Heather Client" } });
    expect(tables.document_events).toHaveLength(1);
    const e = tables.document_events[0];
    expect(e).toMatchObject({ document_id: agreement().id, kind: "signed", actor: "client link", dedupe: `signed:client:${agreement().id}` });
    expect(e.detail).toMatchObject({
      role: "client",
      name: "Heather Client",
      email: "heather@example.com",
      method: "draw",
      image: PNG,
      snapshotSha256: snapshotHash(snapshot),
      ip: "203.0.113.9",
      ua: "Phone",
      totalCents: 4712500,
    });
    expect(String((e.detail as Row).consent)).toContain("agree to this agreement");
    expect(settled).toEqual([[JOB]]);
  });

  it("a second signature is refused and nothing more is written", async () => {
    expect((await sign(body())).status).toBe(200);
    const again = await sign(body({ name: "Someone Else" }));
    expect(again.status).toBe(409);
    expect((await again.json()).error).toBe("This agreement is already signed.");
    expect(tables.document_events).toHaveLength(1);
  });

  it("a void agreement takes no signature", async () => {
    tables.documents = [agreement({ status: "void" })];
    const res = await sign(body());
    expect(res.status).toBe(409);
    expect(tables.document_events).toHaveLength(0);
  });

  it("only an agreement's link signs: a proposal's, a draft's or an unknown token is a 404", async () => {
    tables.documents = [agreement({ kind: "estimate" })];
    expect((await sign(body())).status).toBe(404);
    tables.documents = [agreement({ status: "draft" })];
    expect((await sign(body())).status).toBe(404);
    tables.documents = [agreement()];
    expect((await sign(body(), "b".repeat(32))).status).toBe(404);
    expect(tables.document_events).toHaveLength(0);
  });

  it("an incomplete signature is a 400 that writes nothing", async () => {
    expect((await sign(body({ agree: false }))).status).toBe(400);
    expect((await sign(body({ name: "Al" }))).status).toBe(400);
    expect((await sign(body({ image: "data:image/png;base64,AAAA" }))).status).toBe(400);
    expect(tables.document_events).toHaveLength(0);
  });
});
