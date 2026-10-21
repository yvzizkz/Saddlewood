import { beforeEach, describe, expect, it, vi } from "vitest";

// The job money card's read, after #37 met the redesign stack: one answer
// carries the stack's money (with canOpen, so an owner can open each invoice)
// and #37's year from Joist and Buildertrend (0050). Neither may drop the other.

const BILLING = "0f8a2b6e-1c3d-4e5f-8a9b-0c1d2e3f4a5b";

const { s } = vi.hoisted(() => ({
  s: {
    viewer: null as null | { role: "owner" | "member"; email: string },
    history: null as unknown,
    historyDown: false,
  },
}));

vi.mock("@/lib/crew/auth", () => ({ requireSwitch: async () => s.viewer }));
vi.mock("@/lib/crew/scope", () => ({
  visibleBillingJobs: async () => null,
  visibleCrewJobs: async () => null,
  inScope: () => true,
}));
vi.mock("@/lib/billing/jobMoneyLoad", () => ({
  loadJobMoney: async (ids: string[]) => ({ jobs: ids.map((id) => ({ jobId: id, contractCents: 42_000_000, billedCents: 29_850_000, open: [] })) }),
}));
vi.mock("@/lib/crew/purchaseQueries", () => ({
  crewJobOfBillingJob: async () => "powell",
  loadMaterial: async () => ({ trips: 0 }),
}));
vi.mock("@/lib/crew/queries", () => ({ getJob: async (id: string) => ({ id }) }));
vi.mock("@/lib/crew/jobHistoryQueries", () => ({
  loadHistory: async () => {
    if (s.historyDown) throw new Error('relation "public.job_history" does not exist');
    return s.history;
  },
}));

import { GET } from "../money/route";

const req = (q: string) => ({ nextUrl: new URL(`http://localhost/api/crew/projects/money?${q}`) }) as never;
const HISTORY = { year: 2026, joist: null, labor: { source: "buildertrend", asOf: "2026-10-20", jobToDate: true, hours: 812, people: [] }, notes: [], readAt: "2026-10-20T15:00:00Z" };

describe("GET /api/crew/projects/money", () => {
  beforeEach(() => {
    s.viewer = { role: "owner", email: "lando@saddlewoodcontracting.com" };
    s.history = HISTORY;
    s.historyDown = false;
  });

  it("answers with the money, material, the year's history and canOpen together", async () => {
    const res = await GET(req(`job=${BILLING}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, money: { jobId: BILLING }, material: { trips: 0 }, history: HISTORY, crewJobId: "powell", canOpen: true });
  });

  it("lets only an owner open invoices; a project manager still gets the history", async () => {
    s.viewer = { role: "member", email: "eli.pm@example.com" };
    const body = await (await GET(req(`job=${BILLING}`))).json();
    expect(body.canOpen).toBe(false);
    expect(body.history).toEqual(HISTORY);
  });

  it("opens before 0050 is applied: no history, not an error, and canOpen still rides along", async () => {
    s.historyDown = true;
    const body = await (await GET(req("crewJob=powell"))).json();
    expect(body).toMatchObject({ ok: true, money: null, history: null, crewJobId: "powell", canOpen: true });
  });

  it("refuses a viewer without the switch", async () => {
    s.viewer = null;
    expect((await GET(req(`job=${BILLING}`))).status).toBe(403);
  });
});
