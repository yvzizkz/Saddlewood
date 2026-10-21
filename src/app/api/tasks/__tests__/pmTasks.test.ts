import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// What a project manager may do through /api/tasks: hand work to the PM or
// the field lead on their own jobs, and close work with those seats; never
// hand work up, onto another job, or close an owner's task.

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

const req = (method: string, body: unknown) => new NextRequest("http://localhost/api/tasks", { method, body: JSON.stringify(body) });
const PM = { owner: false, email: "eli.pm@example.com" };

beforeEach(() => {
  state.seat = PM;
  state.inserted = [];
  state.updated = [];
  state.rows = [
    { id: 7, role: "field_lead", created_by: "eli.pm@example.com", job_id: null, crew_job_id: "8009-n-ironwood-dr" },
    { id: 8, role: "finance", created_by: "lando@saddlewoodcontracting.com", job_id: null, crew_job_id: null },
    { id: 9, role: "pm", created_by: "lando@saddlewoodcontracting.com", job_id: null, crew_job_id: "4125-camelback" },
  ];
});

describe("POST /api/tasks as a PM", () => {
  it("hands work to the field lead on their own job", async () => {
    const res = await POST(req("POST", { title: "Photos before cover", role: "field_lead", job: "8009-n-ironwood-dr" }));
    expect(res.status).toBe(200);
    expect(state.inserted[0]).toMatchObject({ role: "field_lead", crew_job_id: "8009-n-ironwood-dr", created_by: "eli.pm@example.com" });
  });

  it("does not hand work up, or onto a job that is not theirs", async () => {
    expect((await POST(req("POST", { title: "x", role: "finance" }))).status).toBe(403);
    expect((await POST(req("POST", { title: "x", role: "pm", job: "4125-camelback" }))).status).toBe(404);
    expect(state.inserted).toHaveLength(0);
  });

  it("turns away someone with no seat", async () => {
    state.seat = null;
    expect((await POST(req("POST", { title: "x", role: "pm" }))).status).toBe(403);
  });
});

describe("PATCH /api/tasks as a PM", () => {
  it("closes field-lead work on their job", async () => {
    expect((await PATCH(req("PATCH", { id: 7, status: "done" }))).status).toBe(200);
    expect(state.updated[0]).toMatchObject({ id: 7, status: "done", done_by: "eli.pm@example.com" });
  });

  it("does not close an owner's finance task, work on another job, or move work up", async () => {
    expect((await PATCH(req("PATCH", { id: 8, status: "done" }))).status).toBe(403);
    expect((await PATCH(req("PATCH", { id: 9, status: "done" }))).status).toBe(404);
    expect((await PATCH(req("PATCH", { id: 7, role: "decisions" }))).status).toBe(403);
    expect(state.updated).toHaveLength(0);
  });
});
