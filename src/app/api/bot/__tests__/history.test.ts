import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The Mac's door for this year on each job (0050), tested at the route: the
// agent token and nothing else opens it; a summary that does not parse is
// dropped and counted; a job that is not a field job comes back as unknown;
// a missing table says which migration.

const TOKEN = "test-token-with-enough-length-1234";
const LANDO = "lando@saddlewoodcontracting.com";

const { session, db } = vi.hoisted(() => ({
  session: { email: null as string | null },
  db: {
    jobs: [] as { id: string; name: string; active: boolean }[],
    upserted: [] as { crewJobId: string }[][],
    down: null as string | null,
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: session.email ? { id: "u1", email: session.email } : null }, error: null }) },
  }),
}));

vi.mock("@/lib/crew/queries", () => ({
  listJobs: async () => {
    if (db.down) throw new Error(db.down);
    return db.jobs;
  },
}));

vi.mock("@/lib/crew/jobHistoryQueries", () => ({
  upsertHistory: async (rows: { crewJobId: string }[]) => {
    db.upserted.push(rows);
    return rows.length;
  },
}));

import { POST } from "../history/route";

function req(body: unknown, headers: Record<string, string> = {}, raw = false) {
  return new Request("http://localhost/api/bot/history", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: raw ? (body as string) : JSON.stringify(body),
  }) as never;
}
const bearer = { Authorization: `Bearer ${TOKEN}` };

const SUMMARY = {
  year: 2026,
  joist: {
    asOf: "2026-10-20",
    paidCents: 7500000,
    payments: 3,
    lastPaidOn: "2026-10-09",
    estimates: { count: 2, cents: 4210700 },
    approved: { count: 1, cents: 1988186 },
    changeOrders: { count: 2, cents: 3728186 },
    invoices: 4,
    docs: [{ kind: "invoice", number: "8009-13", title: "", date: "2026-10-12", totalCents: 964300, paidCents: 0, status: "draft" }],
  },
  labor: null,
  notes: [],
};
const JOB = { crewJobId: "8009-n-ironwood", asOf: "2026-10-20T18:00:00Z", summary: SUMMARY };

beforeEach(() => {
  session.email = null;
  db.jobs = [{ id: "8009-n-ironwood", name: "8009 N Ironwood", active: true }];
  db.upserted = [];
  db.down = null;
  vi.stubEnv("OPS_AGENT_TOKEN", TOKEN);
  vi.stubEnv("INTERNAL_ALLOWED_EMAILS", LANDO);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/bot/history", () => {
  it("opens for the agent token only", async () => {
    expect((await POST(req({ jobs: [JOB] }))).status).toBe(401);
    session.email = LANDO;
    expect((await POST(req({ jobs: [JOB] }))).status).toBe(401);
    expect(db.upserted).toEqual([]);
    expect((await POST(req({ jobs: [JOB] }, bearer))).status).toBe(200);
  });

  it("refuses what is not a post of jobs", async () => {
    expect((await POST(req("{not json", bearer, true))).status).toBe(400);
    expect((await POST(req({ rows: [] }, bearer))).status).toBe(400);
    expect((await POST(req({ jobs: Array.from({ length: 101 }, () => JOB) }, bearer))).status).toBe(400);
  });

  it("saves known jobs, drops bad summaries, and names the jobs that are not field jobs", async () => {
    const bad = { ...JOB, summary: { ...SUMMARY, joist: { ...SUMMARY.joist, paidCents: 1.5 } } };
    const res = await POST(req({ jobs: [JOB, bad, { ...JOB, crewJobId: "5203-n-monte-vista" }] }, bearer));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, saved: 1, dropped: 1, unknown: ["5203-n-monte-vista"] });
    expect(db.upserted[0].map((r) => r.crewJobId)).toEqual(["8009-n-ironwood"]);
  });

  it("says which migration is missing", async () => {
    db.down = 'relation "public.job_history" does not exist';
    const res = await POST(req({ jobs: [JOB] }, bearer));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/0050/);
  });
});
