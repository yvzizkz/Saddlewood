import { beforeEach, describe, expect, it, vi } from "vitest";

// A complaint's seat and clock are worked out here: the job's PM, or Owner
// decisions on a job with none, due on the policy's clock, late by a day moves up.

type Row = Record<string, unknown>;
const { db, pushed, owners } = vi.hoisted(() => ({
  db: { inserted: [] as Row[], read: { data: [] as Row[] | null, error: null as { message: string } | null }, people: [] as { jobId: string; email: string; role: string }[], days: 1, today: "2026-11-03" },
  pushed: [] as { to: string[]; note: Row }[],
  owners: [] as Row[],
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      insert: (r: Row) => (db.inserted.push(r), { select: () => ({ single: async () => ({ data: { id: 5 }, error: null }) }) }),
      select: () => {
        const q = { eq: () => q, or: () => q, order: () => q, limit: async () => db.read };
        return q;
      },
    }),
  }),
}));
vi.mock("@/lib/crew/queries", () => ({ listJobPeople: async () => db.people }));
vi.mock("@/lib/policies/store", () => ({ loadPolicies: async () => ({ values: { "policy.complaint.replyWithinDays": db.days } }) }));
vi.mock("@/lib/crew/time", async (orig) => ({ ...(await orig<typeof import("@/lib/crew/time")>()), localDay: () => db.today }));
vi.mock("@/lib/bot/push", () => ({ sendPush: async (to: string[], note: Row) => (pushed.push({ to, note }), { sent: 1, removed: 0 }) }));
vi.mock("@/lib/crew/notify", () => ({ notifyOwners: async (note: Row) => void owners.push(note) }));

import { placeItem } from "@/lib/tasks/feed";
import { loadJobComplaints, logComplaint, routeComplaint } from "../store";

const REF = { key: "keim", billingId: "b1", crewId: "keim", name: "12729 W Keim Dr" } as Parameters<typeof logComplaint>[0];
const on = (email: string, role = "pm", jobId = "keim") => ({ jobId, email, role }) as Parameters<typeof routeComplaint>[1][number];

beforeEach(() => {
  db.inserted = [];
  db.people = [];
  db.days = 1;
  db.today = "2026-11-03";
  db.read = { data: [], error: null };
  pushed.length = 0;
  owners.length = 0;
});

describe("routeComplaint", () => {
  it("goes to the job's PM, and the same one every time on a job with two", () => {
    expect(routeComplaint("keim", [on("zed@x.com"), on("eli@x.com")])).toEqual({ role: "pm", assignee: "eli@x.com" });
  });
  it("goes to Owner decisions with no PM on the job, on another job or none", () => {
    expect(routeComplaint("keim", [on("carlos@x.com", "crew"), on("eli@x.com", "pm", "bambi")])).toEqual({ role: "decisions", assignee: "" });
    expect(routeComplaint(null, [on("eli@x.com")])).toEqual({ role: "decisions", assignee: "" });
  });
});

describe("logComplaint", () => {
  it("lands on the job's PM on the policy's clock, and tells them", async () => {
    db.people = [on("eli@x.com")];
    db.days = 2;
    const res = await logComplaint(REF, { title: "Dust in the kitchen", detail: "Text to the office", by: "lando@x.com" });
    expect(res).toEqual({ id: 5, role: "pm", assignee: "eli@x.com", dueOn: "2026-11-05" });
    expect(db.inserted[0]).toMatchObject({ kind: "complaint", title: "Dust in the kitchen", role: "pm", assignee: "eli@x.com", job_id: "b1", crew_job_id: "keim", due_on: "2026-11-05", escalate_days: 0, created_by: "lando@x.com" });
    expect(db.inserted[0].href).toContain("#complaints");
    expect(pushed).toHaveLength(1);
    expect(pushed[0].to).toEqual(["eli@x.com"]);
    expect(owners).toEqual([]);
  });

  it.each([
    ["Friday", "2026-11-06"],
    ["Saturday", "2026-11-07"],
  ])("logged on a %s, the reply is due Monday", async (_day, today) => {
    db.today = today;
    expect((await logComplaint(REF, { title: "Leak", detail: "", by: "lando@x.com" })).dueOn).toBe("2026-11-09");
  });

  it("does not tell the PM what they logged themselves", async () => {
    db.people = [on("eli@x.com")];
    await logComplaint(REF, { title: "Dust", detail: "", by: "eli@x.com" });
    expect(pushed).toEqual([]);
  });

  it("tells the owners on a job with no PM", async () => {
    await logComplaint(REF, { title: "Dust", detail: "", by: "lando@x.com" });
    expect(db.inserted[0]).toMatchObject({ role: "decisions", assignee: "" });
    expect(owners).toHaveLength(1);
  });

  it("moves up to Owner decisions the day after it is due, not before", () => {
    expect(placeItem("pm", "2026-11-04", 0, "2026-11-04")).toMatchObject({ nowRole: "pm", escalated: false });
    expect(placeItem("pm", "2026-11-04", 0, "2026-11-05")).toMatchObject({ nowRole: "decisions", escalated: true });
  });
});

describe("loadJobComplaints", () => {
  it("reads nothing for a job with no ids", async () => {
    expect(await loadJobComplaints({ billingId: null, crewId: null })).toEqual([]);
  });

  it("returns what is on the job", async () => {
    db.read = { data: [{ id: 1, title: "Leak", detail: "", role: "pm", assignee: "eli@x.com", due_on: "2026-11-04", status: "done", resolution: "Fixed", created_by: "lando@x.com", created_at: "2026-11-03T18:00:00Z", done_by: "eli@x.com", done_at: "2026-11-04T18:00:00Z" }], error: null };
    expect((await loadJobComplaints(REF))?.[0]).toMatchObject({ id: 1, status: "done", resolution: "Fixed", closedBy: "eli@x.com" });
  });

  it("gives null, not a thrown error, when the read fails: the Tasks tab still opens before 0061", async () => {
    db.read = { data: null, error: { message: "column work_items.resolution does not exist" } };
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(loadJobComplaints(REF)).resolves.toBeNull();
    expect(err).toHaveBeenCalledWith("[complaints] read:", "column work_items.resolution does not exist");
    err.mockRestore();
  });
});
