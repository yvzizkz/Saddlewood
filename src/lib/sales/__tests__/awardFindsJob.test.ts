import { beforeEach, describe, expect, it, vi } from "vitest";

// Award after + Job (PR #38 review): + Job makes a field job and its billing
// half. When the sale is awarded with the address written differently, or
// with none on either side, Award must take that pair over, not make a second
// billing job and a <slug>-2 field job (or hit jobs_name_address_uidx). A pair
// already awarded is never taken over. Through the real awardPreview, which
// says which billing job and field job Award will use (it inserts only when
// they come back empty), on a stand-in database that filters as PostgREST does.

type Row = Record<string, unknown>;
const { db } = vi.hoisted(() => ({ db: { tables: {} as Record<string, Row[]> } }));

// ilike with no wildcards left after escaping: an exact match ignoring case.
const ilike = (v: unknown, pattern: string) => typeof v === "string" && v.toLowerCase() === pattern.replace(/\\([%_\\])/g, "$1").toLowerCase();

function from(table: string) {
  const filters: ((r: Row) => boolean)[] = [];
  const rows = () => (db.tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
  const b = {
    select: () => b,
    eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), b),
    neq: (c: string, v: unknown) => (filters.push((r) => r[c] !== v), b),
    is: (c: string, v: unknown) => (filters.push((r) => (r[c] ?? null) === v), b),
    ilike: (c: string, p: string) => (filters.push((r) => ilike(r[c], p)), b),
    limit: () => b,
    maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
    then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: rows(), error: null }).then(ok),
  };
  return b;
}

const OPP = {
  id: "00000000-0000-4000-8000-000000000042",
  number: "26-0042",
  title: "Test Dr remodel",
  stage: "won",
  kind: "remodel",
  source: "referral",
  contact: { name: "Dana", email: "", phone: "" },
  address: "4821 e test dr, Scottsdale AZ 85251",
  clientId: null,
  jobId: null,
  valueCents: 5_000_000,
  probability: null,
  owner: "Marco",
  nextStep: "",
  nextStepOn: null,
  bidDue: null,
  lostReason: "",
  notes: "",
  tags: [],
  externalRef: null,
};
const { opp } = vi.hoisted(() => ({ opp: { current: {} as Record<string, unknown> } }));

vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => ({ from }) }));
vi.mock("../store", async (orig) => ({
  ...(await orig<typeof import("../store")>()),
  getOpportunityDetail: async () => ({ opportunity: opp.current, proposals: [] }),
}));
vi.mock("@/lib/policies/store", async () => ({ loadPolicies: async () => ({ values: (await import("@/lib/policies/rules")).POLICY_DEFAULTS }) }));
vi.mock("@/lib/crew/queries", () => ({ listPeople: async () => [] }));
vi.mock("@/lib/billing/documents", () => ({ usedNumbers: async () => [] }));

import { awardPreview } from "../awardStore";

// What + Job leaves behind: a field job and its billing half (pairBillingJob stores no address as NULL).
function plusJob(name: string, address: string | null, billing: Row = {}) {
  db.tables.crew_jobs = [{ id: "4821-e-test-dr", name, address: address ?? "", active: true }];
  db.tables.jobs = [{ id: "b-plusjob", name, address, client_id: null, crew_job_id: "4821-e-test-dr", number_prefix: "4821", billing }];
}

beforeEach(() => {
  opp.current = { ...OPP };
  db.tables = { clients: [], jobs: [], crew_jobs: [] };
});

describe("Award after + Job", () => {
  it("(a) takes over the + Job pair when the address and casing differ: one billing job, one field job", async () => {
    plusJob("4821 E Test Dr", "4821 E Test Dr, Phoenix");
    const p = await awardPreview(OPP.id);
    expect(p.existing).toMatchObject({ jobId: "b-plusjob", crewJobId: "4821-e-test-dr", awarded: false });
    expect(p.conflict).toBe("");
    // The billing job is updated with Award's name and address (awardJob writes plan.job onto existing.jobId).
    expect(p.plan.job.name).toBe("4821 e test dr");
  });

  it("(b) + Job with no address, then Award with none: the pair, and no unique-index clash", async () => {
    opp.current = { ...OPP, address: "", title: "4821 E Test Dr" };
    plusJob("4821 E Test Dr", null);
    const p = await awardPreview(OPP.id);
    expect(p.existing).toMatchObject({ jobId: "b-plusjob", crewJobId: "4821-e-test-dr", awarded: false });
  });

  it("matches name and address ignoring case, and an empty address to one stored as ''", async () => {
    plusJob("4821 E TEST DR", "4821 E TEST DR, SCOTTSDALE AZ 85251");
    db.tables.jobs[0].crew_job_id = null;
    expect((await awardPreview(OPP.id)).existing.jobId).toBe("b-plusjob");
    opp.current = { ...OPP, address: "", title: "4821 E Test Dr" };
    db.tables.jobs[0].address = "";
    expect((await awardPreview(OPP.id)).existing.jobId).toBe("b-plusjob");
  });

  it("(c) never takes over a pair that was already awarded", async () => {
    plusJob("4821 E Test Dr", "4821 E Test Dr, Phoenix", { award: { at: "2026-10-01" } });
    const p = await awardPreview(OPP.id);
    expect(p.existing.jobId).toBeNull();
    // Its field job belongs to that awarded job: Award makes its own.
    expect(p.existing.crewJobId).toBeNull();
  });

  it("treats % and _ in a name literally", async () => {
    plusJob("4821 E Test Dr", "x");
    db.tables.jobs[0].crew_job_id = null;
    db.tables.crew_jobs = [];
    opp.current = { ...OPP, address: "48%1 E Test Dr" };
    expect((await awardPreview(OPP.id)).existing.jobId).toBeNull();
  });
});
