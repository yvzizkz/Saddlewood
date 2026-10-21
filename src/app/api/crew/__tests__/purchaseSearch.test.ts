import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { emptySections, type BotSections } from "@/lib/bot/types";

// Finding a purchase at the two doors (0026): an owner searches every job; a
// project manager (money.view, projects.mine) only the jobs he is on, and the
// scope comes from his seat, never from the query string; the Mac's token
// gets the same answer for an owner who asked the bot. Before the migration
// both say so (503).

const TOKEN = "test-token-with-enough-length-1234";
const LANDO = "lando@saddlewoodcontracting.com";
const ELI = "eli@example.com";

type Person = { email: string; name: string; lang: string; active: boolean; lastSeenAt: null; group: string; perms: string[] };

const { session, people, db, spies } = vi.hoisted(() => ({
  session: { user: null as { email: string; app_metadata?: Record<string, unknown> } | null },
  people: new Map<string, Person>(),
  db: {
    jobs: [
      { id: "point-loma", name: "Point Loma", active: true },
      { id: "bambi", name: "6402 E Bambi Drive", active: true },
    ],
    assignments: [] as { jobId: string; email: string; role: string }[],
    aliases: [{ alias: "pt loma", jobId: "point-loma" }],
  },
  spies: { run: vi.fn(), readState: vi.fn() },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: session.user ? { id: "u1", ...session.user } : null }, error: null }) } }),
}));

vi.mock("@/lib/crew/queries", () => ({
  getPerson: async (email: string) => people.get(email) ?? null,
  listJobPeople: async (f: { email?: string } = {}) => db.assignments.filter((a) => !f.email || a.email === f.email),
  listBillingJobs: async () => [],
  listJobs: async () => db.jobs,
  getJob: async (id: string) => db.jobs.find((j) => j.id === id) ?? null,
  touchSeen: async () => {},
}));

vi.mock("@/lib/bot/queries", () => ({ readState: spies.readState }));

vi.mock("@/lib/crew/purchaseQueries", () => ({
  runPurchaseSearch: spies.run,
  listAliases: async () => db.aliases,
  listTradeMap: async () => [],
  upsertPurchases: async () => 0,
}));

import { GET as botGet } from "../../bot/purchases/route";
import { GET } from "../purchases/search/route";

function req(path: string, headers: Record<string, string> = {}) {
  return new Request(`http://localhost${path}`, { headers }) as never;
}
const bearer = { Authorization: `Bearer ${TOKEN}` };

const ROW = {
  tripKey: "hd:20260812:674:0:1",
  rank: 0.5,
  totalTrips: 1,
  tripCents: 3400,
  tripLines: 2,
  sourceKey: "hd:20260812:674:0:1:1",
  purchasedOn: "2026-08-12",
  store: "674",
  vendor: "Home Depot",
  jobId: "point-loma",
  jobName: "Point Loma",
  jobNameRaw: "PT LOMA",
  trade: "drywall",
  description: "1/2 in. x 4 ft. x 8 ft. UltraLight Drywall",
  sku: "1001",
  qty: 2,
  lineTotalCents: 2400,
  matched: true,
};

const asOwner = () => (session.user = { email: LANDO });
const asPm = () => (session.user = { email: ELI, app_metadata: { sw_role: "crew" } });

beforeEach(() => {
  session.user = null;
  people.clear();
  people.set(ELI, { email: ELI, name: "Eli", lang: "en", active: true, lastSeenAt: null, group: "pm", perms: ["crew.view", "projects.view", "projects.mine", "money.view"] });
  db.assignments = [{ jobId: "point-loma", email: ELI, role: "pm" }];
  spies.run.mockReset();
  spies.run.mockResolvedValue([ROW]);
  spies.readState.mockReset();
  const sections: BotSections = emptySections();
  sections.people = { [LANDO]: { name: "Lando", role: "owner" } };
  spies.readState.mockResolvedValue({ sections, bridge: { seenAt: null, agentSeenAt: null, reportedAt: null } });
  vi.stubEnv("OPS_AGENT_TOKEN", TOKEN);
  vi.stubEnv("INTERNAL_ALLOWED_EMAILS", LANDO);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/crew/purchases/search", () => {
  it("is shut without money.view: nobody signed in, the agent token, a seat without the switch", async () => {
    expect((await GET(req("/api/crew/purchases/search?q=drywall"))).status).toBe(403);
    expect((await GET(req("/api/crew/purchases/search?q=drywall", bearer))).status).toBe(403);
    asPm();
    people.get(ELI)!.perms = ["crew.view", "projects.mine"];
    expect((await GET(req("/api/crew/purchases/search?q=drywall"))).status).toBe(403);
    expect(spies.run).not.toHaveBeenCalled();
  });

  it("needs words, a known trade and real dates", async () => {
    asOwner();
    expect((await GET(req("/api/crew/purchases/search?q="))).status).toBe(400);
    expect((await GET(req("/api/crew/purchases/search?q=%20%20"))).status).toBe(400);
    expect((await GET(req("/api/crew/purchases/search?q=screws&trade=bananas"))).status).toBe(400);
    expect((await GET(req("/api/crew/purchases/search?q=screws&from=yesterday"))).status).toBe(400);
    expect((await GET(req("/api/crew/purchases/search?q=screws&job=../x"))).status).toBe(400);
    expect(spies.run).not.toHaveBeenCalled();
  });

  it("answers an owner across every job, trips with the matched lines", async () => {
    asOwner();
    const res = await GET(req("/api/crew/purchases/search?q=ultralight%20drywall%20august&trade=drywall"));
    expect(res.status).toBe(200);
    expect(spies.run).toHaveBeenCalledTimes(1);
    expect(spies.run.mock.calls[0][0]).toMatchObject({ words: ["ultralight", "drywall"], mode: "full-text", jobIds: null, trade: "drywall", from: expect.stringMatching(/-08-01$/), to: expect.stringMatching(/-08-31$/) });
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, total: 1, took: "full-text", filters: { jobId: null, jobName: null } });
    expect(body.trips).toEqual([
      {
        tripKey: "hd:20260812:674:0:1",
        purchasedOn: "2026-08-12",
        store: "674",
        vendor: "Home Depot",
        jobId: "point-loma",
        jobName: "Point Loma",
        trades: ["drywall"],
        totalCents: 3400,
        lineCount: 2,
        lines: [{ description: "1/2 in. x 4 ft. x 8 ft. UltraLight Drywall", sku: "1001", qty: 2, lineTotalCents: 2400, trade: "drywall", matched: true }],
      },
    ]);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("keeps a project manager to the jobs he is on, whatever the query string says", async () => {
    asPm();
    expect((await GET(req("/api/crew/purchases/search?q=drywall"))).status).toBe(200);
    expect(spies.run.mock.calls[0][0]).toMatchObject({ jobIds: ["point-loma"] });
    // His own job, picked: fine. Another job: the same as no job at all, and no search is run.
    expect((await GET(req("/api/crew/purchases/search?q=drywall&job=point-loma"))).status).toBe(200);
    expect(spies.run.mock.calls[1][0]).toMatchObject({ jobIds: ["point-loma"] });
    expect((await GET(req("/api/crew/purchases/search?q=drywall&job=bambi"))).status).toBe(404);
    expect((await GET(req("/api/crew/purchases/search?q=drywall&job=no-such-job"))).status).toBe(404);
    expect(spies.run).toHaveBeenCalledTimes(2);
    // Typing another job's name does not widen anything: it is just words.
    await GET(req("/api/crew/purchases/search?q=bambi%20drywall"));
    expect(spies.run.mock.calls[2][0]).toMatchObject({ words: ["bambi", "drywall"], jobIds: ["point-loma"] });
    // A manager on no job yet sees nothing.
    db.assignments = [];
    const none = await GET(req("/api/crew/purchases/search?q=drywall"));
    expect(none.status).toBe(200);
    expect(spies.run.mock.calls[3][0]).toMatchObject({ jobIds: [] });
  });

  it("narrows an owner to a job typed by name, or picked, and 404s a job that does not exist", async () => {
    asOwner();
    const typed = await GET(req("/api/crew/purchases/search?q=pt%20loma%20screws"));
    expect((await typed.json()).filters).toEqual({ from: null, to: null, jobId: "point-loma", jobName: "Point Loma" });
    expect(spies.run.mock.calls[0][0]).toMatchObject({ words: ["screws"], jobIds: ["point-loma"] });
    expect((await GET(req("/api/crew/purchases/search?q=screws&job=bambi"))).status).toBe(200);
    expect(spies.run.mock.calls[1][0]).toMatchObject({ jobIds: ["bambi"] });
    expect((await GET(req("/api/crew/purchases/search?q=screws&job=no-such-job"))).status).toBe(404);
  });

  it("switches to close matches when full text finds nothing, and says so", async () => {
    asOwner();
    spies.run.mockResolvedValueOnce([]).mockResolvedValueOnce([{ ...ROW, rank: 0.4 }]);
    const res = await GET(req("/api/crew/purchases/search?q=drywal"));
    expect(spies.run).toHaveBeenCalledTimes(2);
    expect(spies.run.mock.calls[1][0]).toMatchObject({ mode: "fuzzy" });
    expect(await res.json()).toMatchObject({ ok: true, took: "fuzzy", total: 1 });
  });

  it("says the search is not switched on before migration 0026, and hides any other failure", async () => {
    asOwner();
    spies.run.mockRejectedValueOnce(new Error("purchases search failed: Could not find the function public.purchases_search(p_from, p_jobs) in the schema cache"));
    const missing = await GET(req("/api/crew/purchases/search?q=drywall"));
    expect(missing.status).toBe(503);
    expect((await missing.json()).error).toMatch(/0026/);
    spies.run.mockRejectedValueOnce(new Error("purchases search failed: connection reset by 10.0.0.1"));
    const broke = await GET(req("/api/crew/purchases/search?q=drywall"));
    expect(broke.status).toBe(500);
    expect((await broke.json()).error).not.toMatch(/10\.0\.0\.1/);
  });
});

describe("GET /api/bot/purchases", () => {
  it("opens for the agent token only, and needs words", async () => {
    expect((await botGet(req("/api/bot/purchases?q=drywall"))).status).toBe(401);
    asOwner();
    expect((await botGet(req("/api/bot/purchases?q=drywall"))).status).toBe(401);
    expect((await botGet(req("/api/bot/purchases?q=", bearer))).status).toBe(400);
    expect((await botGet(req("/api/bot/purchases?q=drywall&trade=bananas", bearer))).status).toBe(400);
    expect((await botGet(req("/api/bot/purchases?q=drywall&from=August", bearer))).status).toBe(400);
    expect(spies.run).not.toHaveBeenCalled();
  });

  it("answers the Mac across every job in the same shape as the app, with a job, trade, dates and limit", async () => {
    session.user = null;
    const res = await botGet(req("/api/bot/purchases?q=ultralight&job=point-loma&trade=drywall&from=2026-08-01&to=2026-08-31&limit=5", bearer));
    expect(res.status).toBe(200);
    expect(spies.run.mock.calls[0][0]).toEqual({ words: ["ultralight"], mode: "full-text", jobIds: ["point-loma"], trade: "drywall", from: "2026-08-01", to: "2026-08-31", trips: 5, lines: 40 });
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, total: 1, took: "full-text", filters: { from: "2026-08-01", to: "2026-08-31", jobId: "point-loma", jobName: "Point Loma" } });
    expect(body.trips[0]).toMatchObject({ tripKey: "hd:20260812:674:0:1", totalCents: 3400, lines: [{ matched: true }] });
  });

  it("tells the Mac to wait before migration 0026", async () => {
    spies.run.mockRejectedValueOnce(new Error("purchases search failed: Could not find the function public.purchases_search in the schema cache"));
    const res = await botGet(req("/api/bot/purchases?q=drywall", bearer));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/0026/);
  });
});
