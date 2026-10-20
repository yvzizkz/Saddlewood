import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// The Bill screen's door: owners only; Prepare queues a billing.prepare tap
// for the Mac (which alone can read Joist) and the page polls for its answer.

const authorizeOps = vi.fn();
vi.mock("@/lib/ops/auth", () => ({ authorizeOps: (...a: unknown[]) => authorizeOps(...a) }));
const readState = vi.fn();
const createAction = vi.fn();
const getAction = vi.fn();
vi.mock("@/lib/bot/queries", () => ({
  readState: (...a: unknown[]) => readState(...a),
  createAction: (...a: unknown[]) => createAction(...a),
  getAction: (...a: unknown[]) => getAction(...a),
}));
const listSendGroups = vi.fn();
vi.mock("@/lib/billing/sendGroups", () => ({ listSendGroups: (...a: unknown[]) => listSendGroups(...a) }));
const documentsInGroup = vi.fn();
vi.mock("@/lib/billing/documents", () => ({ documentsInGroup: (...a: unknown[]) => documentsInGroup(...a) }));

import { GET, POST } from "../route";

const OWNERS = { "lando@saddlewoodcontracting.com": { name: "Lando", role: "owner" }, "eli@saddlewoodcontracting.com": { name: "Eli", role: "requester" } };
const ALLOW = { addresses: ["ap@aft.com"], domains: [], updatedAt: new Date().toISOString() };
const RECENT = [{ id: 1, number: "8009-16", client: "A Finer Touch Construction LLC", totalCents: 1540000, date: "2026-10-19", status: "draft" }];
const GID = "99999999-2222-3333-4444-555555555555";

function req(method: string, url: string, body?: unknown) {
  return new NextRequest(`http://localhost${url}`, { method, headers: { "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}

beforeEach(() => {
  authorizeOps.mockReset().mockResolvedValue({ actor: "lando@saddlewoodcontracting.com", via: "session" });
  readState.mockReset().mockResolvedValue({
    sections: { people: OWNERS, outboundAllow: ALLOW, joistRecent: RECENT },
    bridge: { seenAt: new Date().toISOString(), agentSeenAt: null, reportedAt: null },
  });
  createAction.mockReset().mockResolvedValue({ id: 42, status: "queued" });
  getAction.mockReset();
  listSendGroups.mockReset().mockResolvedValue([
    { id: GID, name: "JURY-1019", clientId: "c", note: "", createdBy: "x", createdAt: "2026-10-19T18:00:00Z", message: { sentAt: "2026-10-19T19:00:00Z", emailId: "m1" } },
  ]);
  documentsInGroup.mockReset().mockResolvedValue([{ id: "a", number: "8009-16", status: "issued", totalCents: 1540000 }]);
});

describe("GET /api/billing/bill", () => {
  it("shows the owner what Start needs: the Mac, the allowlist, Joist's unsent, the groups", async () => {
    const json = await (await GET(req("GET", "/api/billing/bill"))).json();
    expect(json.ok).toBe(true);
    expect(json.online).toBe(true);
    expect(json.allow.fresh).toBe(true);
    expect(json.recent).toEqual(RECENT);
    expect(json.groups).toEqual([{ id: GID, name: "JURY-1019", createdAt: "2026-10-19T18:00:00Z", sentAt: "2026-10-19T19:00:00Z", emailId: "m1", numbers: ["8009-16"], totalCents: 1540000, drafts: 0 }]);
  });

  it("is for the owners: a requester, a stranger and the token are refused", async () => {
    authorizeOps.mockResolvedValue({ actor: "eli@saddlewoodcontracting.com", via: "session" });
    expect((await GET(req("GET", "/api/billing/bill"))).status).toBe(403);
    authorizeOps.mockResolvedValue({ actor: "saddlewoodbot-app", via: "token" });
    expect((await GET(req("GET", "/api/billing/bill"))).status).toBe(403);
    authorizeOps.mockResolvedValue(null);
    expect((await GET(req("GET", "/api/billing/bill"))).status).toBe(403);
  });

  it("answers how a Prepare is going, and only a Prepare", async () => {
    getAction.mockResolvedValueOnce({ id: 42, kind: "billing.prepare", status: "done", result: '{"ok":true,"groupId":"g"}', createdAt: "x" });
    const json = await (await GET(req("GET", "/api/billing/bill?action=42"))).json();
    expect(json.action).toEqual({ id: 42, status: "done", result: '{"ok":true,"groupId":"g"}', createdAt: "x" });
    getAction.mockResolvedValueOnce({ id: 7, kind: "task.done", status: "done", result: "" });
    expect((await GET(req("GET", "/api/billing/bill?action=7"))).status).toBe(404);
  });
});

describe("POST /api/billing/bill (Prepare)", () => {
  it("queues a billing.prepare tap for the Mac under the owner's own name", async () => {
    const res = await POST(req("POST", "/api/billing/bill", { numbers: ["8009-16", " 8009-17 "], group: "jury-1019", intro: "Per Chris:" }));
    expect(res.status).toBe(202);
    expect((await res.json()).action).toEqual({ id: 42, status: "queued" });
    expect(createAction).toHaveBeenCalledWith("lando@saddlewoodcontracting.com", {
      kind: "billing.prepare",
      payload: { numbers: ["8009-16", "8009-17"], group: "jury-1019", intro: "Per Chris:", titles: {}, notes: {} },
    });
  });

  it("refuses a bad number, too many, or no name, before asking the Mac", async () => {
    expect((await POST(req("POST", "/api/billing/bill", { numbers: ["8009-16; drop"], group: "x" }))).status).toBe(400);
    expect((await POST(req("POST", "/api/billing/bill", { numbers: Array(9).fill("8009-1"), group: "x" }))).status).toBe(400);
    expect((await POST(req("POST", "/api/billing/bill", { numbers: ["8009-16"], group: "" }))).status).toBe(400);
    expect(createAction).not.toHaveBeenCalled();
  });

  it("says so when the Mac is not checking in", async () => {
    readState.mockResolvedValue({ sections: { people: OWNERS }, bridge: { seenAt: "2026-10-19T10:00:00Z", agentSeenAt: null, reportedAt: null } });
    const res = await POST(req("POST", "/api/billing/bill", { numbers: ["8009-16"], group: "x" }));
    expect(res.status).toBe(503);
    expect(createAction).not.toHaveBeenCalled();
  });

  it("is for the owners", async () => {
    authorizeOps.mockResolvedValue({ actor: "eli@saddlewoodcontracting.com", via: "session" });
    expect((await POST(req("POST", "/api/billing/bill", { numbers: ["8009-16"], group: "x" }))).status).toBe(403);
  });
});
