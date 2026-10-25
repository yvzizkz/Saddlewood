import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// What a project manager may do through /api/schedule: put an inspection,
// delivery or visit on their own job for the PM or the field lead, and mark
// done or cancel what is on their jobs; never company-wide, on another job,
// or for a seat above them. Owners keep every job and none.

type Row = Record<string, unknown>;
const { state } = vi.hoisted(() => ({
  state: { seat: null as null | { owner: boolean; email: string }, rows: [] as Row[], inserted: [] as Row[], updated: [] as Row[] },
}));

const PM_JOBS = new Set(["8009-n-ironwood-dr"]);
vi.mock("@/lib/jobs/access", () => ({
  PM_ROLES: ["pm", "field_lead"],
  workSeat: async () => state.seat,
  seesJob: (seat: { owner: boolean }, ids: { crewId: string | null }) => seat.owner || (!!ids.crewId && PM_JOBS.has(ids.crewId)),
  jobForWrite: async (seat: { owner: boolean }, key: string) => (seat.owner || PM_JOBS.has(key) ? { key, billingId: null, crewId: key } : null),
}));
vi.mock("@/lib/jobs/hub", () => ({
  getJobRef: async (key: string) => (key === "nowhere" ? null : { key, billingId: null, crewId: key }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({
    from: () => {
      let id: unknown;
      let patch: Row | null = null;
      const b = {
        insert: (r: Row) => (state.inserted.push(r), b),
        update: (p: Row) => ((patch = p), b),
        select: () => b,
        single: async () => ({ data: { id: 1 }, error: null }),
        eq: (_c: string, v: unknown) => ((id = v), patch ? (state.updated.push({ id, ...patch }), Promise.resolve({ error: null })) : b),
        maybeSingle: async () => ({ data: state.rows.find((r) => r.id === id) ?? null, error: null }),
      };
      return b;
    },
  }),
}));

import { PATCH, POST } from "../route";

const req = (method: string, body: unknown) => new NextRequest("http://localhost/api/schedule", { method, body: JSON.stringify(body) });
const PM = { owner: false, email: "eli.pm@example.com" };
const OWNER = { owner: true, email: "lando@saddlewoodcontracting.com" };
const item = (over: Row = {}) => ({ kind: "inspection", title: "Framing inspection", startDay: "2026-10-28", role: "field_lead", job: "8009-n-ironwood-dr", ...over });

beforeEach(() => {
  state.seat = PM;
  state.inserted = [];
  state.updated = [];
  state.rows = [
    { id: 7, job_id: null, crew_job_id: "8009-n-ironwood-dr" },
    { id: 8, job_id: null, crew_job_id: null },
    { id: 9, job_id: null, crew_job_id: "4125-camelback" },
  ];
});

describe("POST /api/schedule as a PM", () => {
  it("puts an inspection on their own job for the field lead", async () => {
    const res = await POST(req("POST", item()));
    expect(res.status).toBe(200);
    expect(state.inserted[0]).toMatchObject({ kind: "inspection", role: "field_lead", crew_job_id: "8009-n-ironwood-dr", created_by: "eli.pm@example.com", status: "scheduled" });
  });

  it("does not schedule for a seat above them, company-wide, or on a job that is not theirs", async () => {
    expect((await POST(req("POST", item({ role: "finance" })))).status).toBe(403);
    expect((await POST(req("POST", item({ job: "" })))).status).toBe(404);
    expect((await POST(req("POST", item({ job: "4125-camelback" })))).status).toBe(404);
    expect(state.inserted).toHaveLength(0);
  });

  it("turns away someone with no seat", async () => {
    state.seat = null;
    expect((await POST(req("POST", item()))).status).toBe(403);
  });
});

describe("POST /api/schedule as an owner", () => {
  it("schedules on any job, or company-wide, for any seat", async () => {
    state.seat = OWNER;
    expect((await POST(req("POST", item({ role: "finance", job: "4125-camelback" })))).status).toBe(200);
    expect((await POST(req("POST", item({ role: "decisions", job: "" })))).status).toBe(200);
    expect(state.inserted.map((r) => r.crew_job_id)).toEqual(["4125-camelback", null]);
  });

  it("says so when the job does not exist, rather than saving it company-wide", async () => {
    state.seat = OWNER;
    expect((await POST(req("POST", item({ job: "nowhere" })))).status).toBe(400);
    expect(state.inserted).toHaveLength(0);
  });
});

describe("PATCH /api/schedule as a PM", () => {
  it("marks done what is on their job", async () => {
    expect((await PATCH(req("PATCH", { id: 7, status: "done" }))).status).toBe(200);
    expect(state.updated[0]).toMatchObject({ id: 7, status: "done", done_by: "eli.pm@example.com" });
  });

  it("does not touch a company-wide item, one on another job, or one that is not there", async () => {
    expect((await PATCH(req("PATCH", { id: 8, status: "cancelled" }))).status).toBe(404);
    expect((await PATCH(req("PATCH", { id: 9, status: "done" }))).status).toBe(404);
    expect((await PATCH(req("PATCH", { id: 99, status: "done" }))).status).toBe(404);
    expect(state.updated).toHaveLength(0);
  });

  it("leaves an owner free to close anything", async () => {
    state.seat = OWNER;
    expect((await PATCH(req("PATCH", { id: 8, status: "cancelled" }))).status).toBe(200);
  });
});
