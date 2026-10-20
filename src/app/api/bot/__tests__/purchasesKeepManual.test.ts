import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A re-sync from the Mac keeps what a person set by hand: the trade they
// picked (trade_manual) and the job they put a trip on (job_manual). Through
// POST /api/bot/purchases with the real upsert, against a stand-in purchases
// table that keeps rows by source_key.

const TOKEN = "test-token-with-enough-length-1234";
type Row = Record<string, unknown>;
const { db } = vi.hoisted(() => ({ db: { purchases: new Map<string, Row>() } }));

function from(table: string) {
  let keys: string[] | null = null;
  let manualOnly = false;
  const read = () => {
    if (table === "job_aliases") return [{ alias: "pt loma", job_id: "point-loma" }];
    if (table === "trade_map") return [{ department: "LUMBER", class: "", trade: "framing" }];
    const all = [...db.purchases.values()];
    return all.filter((r) => (!keys || keys.includes(r.source_key as string)) && (!manualOnly || r.trade_manual || r.job_manual));
  };
  const b = {
    select: () => b,
    in: (_c: string, v: string[]) => ((keys = v), b),
    or: () => ((manualOnly = true), b),
    eq: () => ((manualOnly = true), b),
    upsert: async (rows: Row[]) => {
      // ON CONFLICT (source_key) DO UPDATE: the sent columns replace, the rest stay.
      for (const r of rows) db.purchases.set(r.source_key as string, { trade_manual: false, job_manual: false, ...db.purchases.get(r.source_key as string), ...r });
      return { error: null };
    },
    then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: read(), error: null }).then(ok),
  };
  return b;
}

vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => ({ from }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: null }, error: null }) } }) }));
vi.mock("@/lib/crew/queries", () => ({ listJobs: async () => [] }));

import { POST } from "../purchases/route";

const post = (lines: unknown[]) =>
  POST(new Request("http://localhost/api/bot/purchases", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` }, body: JSON.stringify({ lines }) }) as never);

const LINE = { source: "hd", sourceKey: "hd:20260812:674:0:6220:1", purchasedOn: "2026-08-12", jobNameRaw: "PT LOMA", department: "LUMBER", lineTotalCents: 5000 };

beforeEach(() => {
  db.purchases.clear();
  vi.stubEnv("OPS_AGENT_TOKEN", TOKEN);
});
afterEach(() => vi.unstubAllEnvs());

describe("re-posting a line through POST /api/bot/purchases", () => {
  it("keeps a manual trade and a manual job", async () => {
    expect((await post([LINE])).status).toBe(200);
    expect(db.purchases.get(LINE.sourceKey)).toMatchObject({ trade: "framing", job_id: "point-loma" });

    // A person re-tags the line and puts its trip on another job.
    Object.assign(db.purchases.get(LINE.sourceKey)!, { trade: "drywall", trade_manual: true, job_id: "emerson", job_manual: true });

    expect((await post([LINE])).status).toBe(200);
    expect(db.purchases.get(LINE.sourceKey)).toMatchObject({ trade: "drywall", trade_manual: true, job_id: "emerson", job_manual: true });
  });

  it("still updates lines nobody touched", async () => {
    await post([LINE]);
    await post([{ ...LINE, lineTotalCents: 6000 }]);
    expect(db.purchases.get(LINE.sourceKey)).toMatchObject({ trade: "framing", job_id: "point-loma", line_total_cents: 6000 });
  });
});
