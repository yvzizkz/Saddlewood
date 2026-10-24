import { beforeEach, describe, expect, it, vi } from "vitest";

// Home's "Your tasks" (/api/tasks/mine): the caller's Mine on Tasks, counted,
// listing only what that Home does not already show. No Tasks page, no card.

const { state } = vi.hoisted(() => ({ state: { seat: null as null | { owner: boolean; email: string } } }));

vi.mock("@/lib/jobs/access", () => ({
  workSeat: async () => state.seat,
  seesJob: (seat: { owner: boolean }, ref: { crewId: string | null }) => seat.owner || ref.crewId === "keim",
}));
vi.mock("@/lib/jobs/hub", () => ({ listJobRefs: async () => [{ key: "keim", crewId: "keim" }, { key: "bambi", crewId: "bambi" }] }));
vi.mock("@/lib/crew/time", async (orig) => ({ ...(await orig<typeof import("@/lib/crew/time")>()), localDay: () => "2026-10-13" }));
vi.mock("@/lib/roles/store", () => ({
  loadSeats: async () => [
    { role: "decisions", holder: "Marco", backup: "", note: "", updatedBy: "", updatedAt: null },
    { role: "pm", holder: "Eli", backup: "", note: "", updatedBy: "", updatedAt: null },
  ],
  loadPeople: async () => [
    { email: "marco@x.com", name: "Marco", owner: true },
    { email: "eli@x.com", name: "Eli", owner: false },
  ],
}));
vi.mock("@/lib/tasks/feed", async (orig) => {
  const real = await orig<typeof import("@/lib/tasks/feed")>();
  const item = (id: string, over: Record<string, unknown>) => ({ id, source: "work", kind: "task", title: id, detail: "", role: "pm", nowRole: "pm", assignee: "", jobKey: null, job: "", dueOn: null, since: null, overdueDays: 0, escalated: false, href: `/x/${id}`, editable: true, ...over });
  return {
    ...real,
    loadFeed: async () => [
      item("q1", { source: "waiting", role: "decisions", nowRole: "decisions", since: "2026-09-01" }),
      item("co1", { source: "billing", kind: "co_price", role: "decisions", nowRole: "decisions", dueOn: "2026-10-13" }),
      item("keim", { jobKey: "keim", dueOn: "2026-10-10", overdueDays: 3 }),
      item("bambi", { jobKey: "bambi", dueOn: "2026-10-09", overdueDays: 4 }),
      item("c2", { source: "crew", role: "field_lead", nowRole: "field_lead", assignee: "eli@x.com", jobKey: "keim", editable: false }),
    ],
  };
});

import { GET } from "../mine/route";

beforeEach(() => {
  state.seat = null;
});

describe("GET /api/tasks/mine", () => {
  it("is owners and project managers only", async () => {
    expect((await GET()).status).toBe(403);
  });

  it("counts an owner's Mine and lists what Waiting on you does not", async () => {
    state.seat = { owner: true, email: "marco@x.com" };
    const body = await (await GET()).json();
    expect(body).toMatchObject({ ok: true, count: 2, dueToday: 1, overdue: 0 });
    expect(body.top.map((i: { id: string }) => i.id)).toEqual(["co1"]);
  });

  it("counts a project manager's jobs only, and leaves their own crew tasks to Today", async () => {
    state.seat = { owner: false, email: "eli@x.com" };
    const body = await (await GET()).json();
    expect(body).toMatchObject({ count: 2, overdue: 1 });
    expect(body.top.map((i: { id: string }) => i.id)).toEqual(["keim"]);
  });
});
