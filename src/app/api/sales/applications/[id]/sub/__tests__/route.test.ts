import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const { gate, getMock, markMock, listMock, saveMock } = vi.hoisted(() => ({
  gate: { role: "owner" as "owner" | "staff" | "member" | "agent" },
  getMock: vi.fn(),
  markMock: vi.fn(),
  listMock: vi.fn(),
  saveMock: vi.fn(),
}));

vi.mock("@/lib/sales/access", () => ({
  salesGate: async () => (gate.role === "agent" ? { response: NextResponse.json({ ok: false }, { status: 403 }) } : { who: { actor: "me@x.com" }, seat: { role: gate.role } }),
}));
vi.mock("@/lib/subs/access", () => {
  class SubsError extends Error {
    constructor(message: string, readonly status = 400) {
      super(message);
    }
  }
  return { SubsError, subsError: (_e: unknown, what: string) => NextResponse.json({ ok: false, error: `could not ${what}` }, { status: 500 }) };
});
vi.mock("@/lib/subs/store", () => ({ listSubs: listMock, saveSub: saveMock }));
vi.mock("@/lib/webforms/store", () => ({ getSubmission: getMock, markSubmission: markMock }));

import { SubsError } from "@/lib/subs/access";
import { POST } from "../route";

const post = (id = "5") => POST(new NextRequest(`https://x.com/api/sales/applications/${id}/sub`, { method: "POST" }), { params: Promise.resolve({ id }) });
const app = { id: 5, form: "trade_partner", name: "Jo", email: "jo@x.com", phone: "", company: "Acme Stucco", about: "Stucco / Exterior", summary: "", status: "new", createdAt: "2026-11-01T00:00:00Z" };
const acme = { id: "s1", name: "Acme Stucco", email: "", rocLicense: "", contacts: [] };

beforeEach(() => {
  gate.role = "owner";
  getMock.mockReset().mockResolvedValue(app);
  markMock.mockReset().mockResolvedValue(true);
  listMock.mockReset().mockResolvedValue([]);
  saveMock.mockReset().mockResolvedValue(acme);
});

describe("POST: an application onto Subs", () => {
  it("adds it and closes the application", async () => {
    const res = await post();
    expect(await res.json()).toEqual({ ok: true, sub: { id: "s1", name: "Acme Stucco" }, created: true });
    expect(saveMock.mock.calls[0][0]).toBeNull();
    expect(saveMock.mock.calls[0][1]).toMatchObject({ name: "Acme Stucco", trades: ["stucco"], status: "prospect" });
    expect(saveMock.mock.calls[0][2]).toBe("me@x.com");
    expect(markMock).toHaveBeenCalledWith(5, "dismissed", ["trade_partner"]);
  });

  it("links a sub already there, changes nothing on it, and still closes", async () => {
    listMock.mockResolvedValue([acme]);
    expect((await (await post()).json()).created).toBe(false);
    expect(saveMock).not.toHaveBeenCalled();
    expect(markMock).toHaveBeenCalled();
  });

  it("two people at once: the one who loses links the sub the other added", async () => {
    listMock.mockResolvedValueOnce([]).mockResolvedValueOnce([acme]);
    saveMock.mockRejectedValue(new SubsError("already in the directory", 409));
    const res = await post();
    expect(res.status).toBe(200);
    expect((await res.json()).created).toBe(false);
  });

  it("a failed add leaves the application open", async () => {
    saveMock.mockRejectedValue(new Error("db down"));
    expect((await post()).status).toBe(500);
    expect(markMock).not.toHaveBeenCalled();
  });

  it("the office only", async () => {
    gate.role = "member";
    expect((await post()).status).toBe(403);
    expect(saveMock).not.toHaveBeenCalled();
    gate.role = "staff";
    expect((await post()).status).toBe(200);
  });

  it("only a trade partner's application", async () => {
    getMock.mockResolvedValue({ ...app, form: "careers" });
    expect((await post()).status).toBe(404);
    getMock.mockResolvedValue(null);
    expect((await post()).status).toBe(404);
    expect((await post("abc")).status).toBe(404);
  });
});
