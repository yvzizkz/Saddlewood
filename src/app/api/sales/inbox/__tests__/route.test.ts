import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// The Sales inbox's call-list actions (moved from the old /internal/leads):
// mark a caller, and ask the office Mac to sync GoHighLevel.

const { gate, updateLeadStatusMock, createActionMock, getActionMock } = vi.hoisted(() => ({
  gate: { role: "owner" as "owner" | "staff" | "member" | "agent" | null },
  updateLeadStatusMock: vi.fn(),
  createActionMock: vi.fn(),
  getActionMock: vi.fn(),
}));

vi.mock("@/lib/sales/access", () => ({
  salesGate: async (_req: NextRequest, need: string) => {
    if (!gate.role) return { response: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }) };
    if (need === "person" && gate.role === "agent") {
      return { response: NextResponse.json({ ok: false, error: "a person must do this, signed in" }, { status: 403 }) };
    }
    const email = gate.role === "agent" ? "agent" : `${gate.role}@saddlewoodcontracting.com`;
    return { who: { actor: email, via: gate.role === "agent" ? "token" : "session" }, seat: { email, role: gate.role } };
  },
  salesError: (_err: unknown, what: string) => NextResponse.json({ ok: false, error: `could not ${what}` }, { status: 500 }),
}));
vi.mock("@/lib/leads/store", () => ({ updateLeadStatus: updateLeadStatusMock }));
vi.mock("@/lib/bot/queries", () => ({ createAction: createActionMock, getAction: getActionMock }));

import { GET, PATCH, POST } from "../route";

const url = "https://saddlewoodcontracting.com/api/sales/inbox";
const req = (method: string, body?: unknown, query = "") =>
  new NextRequest(url + query, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { "content-type": "application/json" } });

beforeEach(() => {
  gate.role = "owner";
  updateLeadStatusMock.mockReset().mockResolvedValue(undefined);
  createActionMock.mockReset().mockResolvedValue({ id: 7, status: "queued" });
  getActionMock.mockReset();
});

describe("PATCH: mark a caller", () => {
  it("any person with a Sales seat marks called, texted, dismissed or back to pending", async () => {
    for (const [role, status] of [["owner", "called"], ["staff", "texted"], ["member", "dismissed"], ["member", "pending"]] as const) {
      gate.role = role;
      const res = await PATCH(req("PATCH", { phone: "6025551234", status }));
      expect(res.status, `${role} ${status}`).toBe(200);
      expect(updateLeadStatusMock).toHaveBeenLastCalledWith("6025551234", status);
    }
  });

  it("refuses an unknown status, a missing phone, and the agent token", async () => {
    expect((await PATCH(req("PATCH", { phone: "6025551234", status: "won" }))).status).toBe(400);
    expect((await PATCH(req("PATCH", { status: "called" }))).status).toBe(400);
    gate.role = "agent";
    expect((await PATCH(req("PATCH", { phone: "6025551234", status: "called" }))).status).toBe(403);
    gate.role = null;
    expect((await PATCH(req("PATCH", { phone: "6025551234", status: "called" }))).status).toBe(401);
    expect(updateLeadStatusMock).not.toHaveBeenCalled();
  });
});

describe("POST: sync GoHighLevel", () => {
  it("owners and staff queue a leads.sync tap for themselves", async () => {
    for (const role of ["owner", "staff"] as const) {
      gate.role = role;
      const res = await POST(req("POST", { sync: true }));
      expect(res.status).toBe(200);
      expect((await res.json()).action).toEqual({ id: 7, status: "queued" });
      expect(createActionMock).toHaveBeenLastCalledWith(`${role}@saddlewoodcontracting.com`, { kind: "leads.sync", payload: {} });
    }
  });

  it("a crew seat and the agent token cannot; a body without sync: true is refused", async () => {
    gate.role = "member";
    expect((await POST(req("POST", { sync: true }))).status).toBe(403);
    gate.role = "agent";
    expect((await POST(req("POST", { sync: true }))).status).toBe(403);
    gate.role = "owner";
    expect((await POST(req("POST", {}))).status).toBe(400);
    expect(createActionMock).not.toHaveBeenCalled();
  });
});

describe("GET ?action=: how the sync is going", () => {
  it("answers for a leads.sync action, and 404 for anything else", async () => {
    getActionMock.mockResolvedValueOnce({ id: 7, kind: "leads.sync", status: "done", result: "12 callers" });
    const res = await GET(req("GET", undefined, "?action=7"));
    expect(res.status).toBe(200);
    expect((await res.json()).action).toEqual({ id: 7, status: "done", result: "12 callers" });

    getActionMock.mockResolvedValueOnce({ id: 8, kind: "plan.send", status: "done", result: "" });
    expect((await GET(req("GET", undefined, "?action=8"))).status).toBe(404);
    expect((await GET(req("GET", undefined, "?action=abc"))).status).toBe(404);
  });
});
