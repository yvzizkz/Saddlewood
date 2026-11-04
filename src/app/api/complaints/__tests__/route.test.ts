import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Who may log a complaint, and on which job.

const { state } = vi.hoisted(() => ({ state: { seat: null as null | { owner: boolean; email: string }, logged: [] as unknown[] } }));

vi.mock("@/lib/jobs/access", () => ({
  workSeat: async () => state.seat,
  jobForWrite: async (seat: { owner: boolean }, key: string) => (key && (seat.owner || key === "mine") ? { key } : null),
}));
vi.mock("@/lib/complaints/store", () => ({
  logComplaint: async (ref: unknown, input: unknown) => (state.logged.push({ ref, input }), { id: 1, role: "pm", assignee: "eli@x.com", dueOn: "2026-11-04" }),
}));

import { POST } from "../route";

const req = (body: unknown) => new NextRequest("http://localhost/api/complaints", { method: "POST", body: JSON.stringify(body) });

beforeEach(() => {
  state.seat = { owner: false, email: "eli@x.com" };
  state.logged = [];
});

describe("POST /api/complaints", () => {
  it("refuses a seat with no work seat", async () => {
    state.seat = null;
    expect((await POST(req({ job: "mine", title: "Dust" }))).status).toBe(403);
  });
  it("needs a complaint and a job the seat can reach", async () => {
    expect((await POST(req({ job: "mine", title: "  " }))).status).toBe(400);
    expect((await POST(req({ job: "other", title: "Dust" }))).status).toBe(404);
    expect((await POST(req({ title: "Dust" }))).status).toBe(404);
    expect(state.logged).toEqual([]);
  });
  it("logs it under the caller, and ignores any seat or date sent", async () => {
    const res = await POST(req({ job: "mine", title: " Dust ", detail: "Text", role: "field_lead", dueOn: "2030-01-01" }));
    expect(res.status).toBe(200);
    expect(state.logged[0]).toEqual({ ref: { key: "mine" }, input: { title: "Dust", detail: "Text", by: "eli@x.com" } });
  });
});
