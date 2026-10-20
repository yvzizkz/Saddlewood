import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The Mac's door for Home Depot purchases, tested at the route: the agent
// token and nothing else opens it; a bad line is dropped and counted; every
// line is upserted with its job (from the aliases) and its trade (from the
// map); the Mac is told what nobody has answered for.

const TOKEN = "test-token-with-enough-length-1234";
const LANDO = "lando@saddlewoodcontracting.com";

const { session, db } = vi.hoisted(() => ({
  session: { email: null as string | null },
  db: {
    aliases: [] as { alias: string; jobId: string | null }[],
    rules: [] as { department: string; class: string; trade: string }[],
    jobs: [] as { id: string; name: string; active: boolean }[],
    upserted: [] as Record<string, unknown>[][],
    down: null as string | null,
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: session.email ? { id: "u1", email: session.email } : null }, error: null }) },
  }),
}));

vi.mock("@/lib/crew/queries", () => ({ listJobs: async () => db.jobs }));

vi.mock("@/lib/crew/purchaseQueries", () => ({
  listAliases: async () => {
    if (db.down) throw new Error(db.down);
    return db.aliases;
  },
  listTradeMap: async () => db.rules,
  upsertPurchases: async (rows: Record<string, unknown>[]) => {
    db.upserted.push(rows);
    return rows.length;
  },
}));

import { POST } from "../purchases/route";

function req(body: unknown, headers: Record<string, string> = {}, raw = false) {
  return new Request("http://localhost/api/bot/purchases", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: raw ? (body as string) : JSON.stringify(body),
  }) as never;
}
const bearer = { Authorization: `Bearer ${TOKEN}` };

const LINE = { source: "hd", sourceKey: "hd:20260812:674:0:6220:1", purchasedOn: "2026-08-12", jobNameRaw: "PT LOMA", department: "LUMBER", lineTotalCents: 5000 };

beforeEach(() => {
  session.email = null;
  db.aliases = [{ alias: "pt loma", jobId: "point-loma" }];
  db.rules = [{ department: "LUMBER", class: "", trade: "framing" }];
  db.jobs = [];
  db.upserted = [];
  db.down = null;
  vi.stubEnv("OPS_AGENT_TOKEN", TOKEN);
  vi.stubEnv("INTERNAL_ALLOWED_EMAILS", LANDO);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/bot/purchases", () => {
  it("opens for the agent token only", async () => {
    expect((await POST(req({ lines: [LINE] }))).status).toBe(401);
    session.email = LANDO;
    expect((await POST(req({ lines: [LINE] }))).status).toBe(401);
    expect(db.upserted).toEqual([]);
    expect((await POST(req({ lines: [LINE] }, bearer))).status).toBe(200);
  });

  it("refuses what is not a post of lines", async () => {
    expect((await POST(req("{not json", bearer, true))).status).toBe(400);
    expect((await POST(req({ rows: [] }, bearer))).status).toBe(400);
    const res = await POST(req({ lines: Array.from({ length: 2001 }, () => LINE) }, bearer));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/2000/);
  });

  it("upserts every line with its job and trade, drops and counts bad rows, and reports the unmatched names", async () => {
    const res = await POST(
      req(
        {
          lines: [
            LINE,
            { ...LINE, sourceKey: "hd:20260812:674:0:6220:2", jobNameRaw: "Pt Loma,", department: "PAINT", lineTotalCents: 1000 },
            { ...LINE, sourceKey: "hd:20260813:674:0:6300:1", jobNameRaw: "POINT LOMA", lineTotalCents: 2000 },
            { ...LINE, sourceKey: "hd:20260813:674:0:6300:2", jobNameRaw: "POINT LOMA", lineTotalCents: 500 },
            { ...LINE, sourceKey: "hd:20260813:674:0:6301:1", jobNameRaw: "7425 E Gainey Ranch #45", lineTotalCents: 9000, qty: 3, sku: "1001", meta: { line: 1 } },
            { ...LINE, sourceKey: "bad", purchasedOn: "yesterday" },
            { ...LINE, sourceKey: "" },
            "not a line",
          ],
        },
        bearer,
      ),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      upserted: 5,
      linked: 2,
      dropped: 3,
      unmatched: [
        { name: "7425 E Gainey Ranch #45", lines: 1, cents: 9000 },
        { name: "POINT LOMA", lines: 2, cents: 2500 },
      ],
    });
    expect(db.upserted).toHaveLength(1);
    expect(db.upserted[0].map((r) => [r.sourceKey, r.jobKey, r.jobId, r.trade])).toEqual([
      ["hd:20260812:674:0:6220:1", "pt loma", "point-loma", "framing"],
      ["hd:20260812:674:0:6220:2", "pt loma", "point-loma", "general"],
      ["hd:20260813:674:0:6300:1", "point loma", null, "framing"],
      ["hd:20260813:674:0:6300:2", "point loma", null, "framing"],
      ["hd:20260813:674:0:6301:1", "7425 e gainey ranch 45", null, "framing"],
    ]);
    expect(db.upserted[0][4]).toMatchObject({ vendor: "Home Depot", qty: 3, sku: "1001", meta: { line: 1 } });
  });

  it("files a line under its own jobId, or under the active job whose name was typed, with no alias", async () => {
    db.jobs = [
      { id: "bambi", name: "6402 E Bambi Drive", active: true },
      { id: "old", name: "Old Job", active: false },
    ];
    const res = await POST(
      req(
        {
          lines: [
            { source: "app", sourceKey: "app:7", purchasedOn: "2026-10-19", jobId: "bambi", jobNameRaw: "", lineTotalCents: 1200 },
            { ...LINE, jobNameRaw: "6402 E BAMBI DRIVE" },
            { ...LINE, sourceKey: "hd:20260812:674:0:6220:9", jobNameRaw: "Old Job", lineTotalCents: 300 },
          ],
        },
        bearer,
      ),
    );
    expect(await res.json()).toEqual({ ok: true, upserted: 3, linked: 2, dropped: 0, unmatched: [{ name: "Old Job", lines: 1, cents: 300 }] });
    expect(db.upserted[0].map((r) => [r.sourceKey, r.jobId])).toEqual([
      ["app:7", "bambi"],
      ["hd:20260812:674:0:6220:1", "bambi"],
      ["hd:20260812:674:0:6220:9", null],
    ]);
    expect(db.upserted[0][0]).not.toHaveProperty("given");
  });

  it("keeps a name set aside quiet, and says when the tables are not there yet", async () => {
    db.aliases = [{ alias: "jury steel studs quote 1900982", jobId: null }];
    const res = await POST(req({ lines: [{ ...LINE, jobNameRaw: "jury steel studs quote 1900982" }] }, bearer));
    expect(await res.json()).toEqual({ ok: true, upserted: 1, linked: 0, dropped: 0, unmatched: [] });
    expect(db.upserted[0][0]).toMatchObject({ jobId: null, meta: { ignored: true } });

    db.down = 'relation "public.job_aliases" does not exist';
    const missing = await POST(req({ lines: [LINE] }, bearer));
    expect(missing.status).toBe(503);
    expect((await missing.json()).error).toMatch(/0022/);
  });
});
