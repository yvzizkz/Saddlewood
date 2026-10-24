import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// What a project manager may do through /api/tasks: hand work to the PM or
// the field lead on their own jobs, and close work with those seats; never
// hand work up, onto another job, or close an owner's task.

type Row = Record<string, unknown>;
const { state } = vi.hoisted(() => ({
  state: { seat: null as null | { owner: boolean; email: string; money?: boolean }, rows: [] as Row[], inserted: [] as Row[], updated: [] as Row[] },
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
const PM = { owner: false, email: "eli.pm@example.com", money: true };

beforeEach(() => {
  state.seat = PM;
  state.inserted = [];
  state.updated = [];
  state.rows = [
    { id: 7, role: "field_lead", created_by: "eli.pm@example.com", job_id: null, crew_job_id: "8009-n-ironwood-dr" },
    { id: 8, role: "finance", created_by: "lando@saddlewoodcontracting.com", job_id: null, crew_job_id: null },
    { id: 9, role: "pm", created_by: "lando@saddlewoodcontracting.com", job_id: null, crew_job_id: "4125-camelback" },
    // Work with no job: the PM's, the field lead's, and one the lead handed out.
    { id: 10, role: "pm", created_by: "lando@saddlewoodcontracting.com", job_id: null, crew_job_id: null },
    { id: 11, role: "field_lead", created_by: "eli.pm@example.com", job_id: null, crew_job_id: null },
    { id: 12, role: "pm", created_by: "arnold@example.com", job_id: null, crew_job_id: null },
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

describe("/api/tasks as a field lead (no money, jobs/access.ts)", () => {
  const LEAD = { owner: false, email: "arnold@example.com", money: false };

  it("hands work to the field lead or the PM on their job and closes field-lead work there", async () => {
    state.seat = LEAD;
    expect((await POST(req("POST", { title: "Pre-cover photos", role: "field_lead", job: "8009-n-ironwood-dr" }))).status).toBe(200);
    expect(state.inserted[0]).toMatchObject({ role: "field_lead", created_by: "arnold@example.com" });
    expect((await PATCH(req("PATCH", { id: 7, status: "done" }))).status).toBe(200);
    expect(state.updated[0]).toMatchObject({ id: 7, status: "done", done_by: "arnold@example.com" });
  });

  it("does not hand work up, close finance work, or touch another job", async () => {
    state.seat = LEAD;
    expect((await POST(req("POST", { title: "x", role: "finance" }))).status).toBe(403);
    expect((await PATCH(req("PATCH", { id: 8, status: "done" }))).status).toBe(404);
    expect((await PATCH(req("PATCH", { id: 9, status: "done" }))).status).toBe(404);
  });

  it("leaves the PM's work with no job alone: done, drop, reopen and reassign are all refused", async () => {
    state.seat = LEAD;
    for (const change of [{ status: "done" }, { status: "dropped" }, { status: "open" }, { role: "field_lead" }, { assignee: "arnold@example.com" }]) {
      expect((await PATCH(req("PATCH", { id: 10, ...change }))).status, JSON.stringify(change)).toBe(404);
    }
    expect(state.updated).toHaveLength(0);
  });

  it("still closes the field lead's work with no job, and work with no job they handed out", async () => {
    state.seat = LEAD;
    expect((await PATCH(req("PATCH", { id: 11, status: "done" }))).status).toBe(200);
    expect((await PATCH(req("PATCH", { id: 12, status: "dropped" }))).status).toBe(200);
    expect(state.updated.map((u) => u.id)).toEqual([11, 12]);
  });

  it("does not change what a PM may do with the PM's work with no job", async () => {
    expect((await PATCH(req("PATCH", { id: 10, status: "done" }))).status).toBe(200);
  });
});
