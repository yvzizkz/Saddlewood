import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The Mac's agent token may read the Company policies (bot/contract.py drafts
// from them) and never change them; a signed-in owner changes them.

const h = vi.hoisted(() => ({
  who: null as null | { actor: string; via: "session" | "token" },
  people: {} as Record<string, { name: string; role: string }>,
  saved: [] as { key: string; value: unknown; by: string }[],
}));

vi.mock("@/lib/ops/auth", () => ({ authorizeOps: vi.fn(async () => h.who) }));
vi.mock("@/lib/bot/queries", () => ({ readState: vi.fn(async () => ({ sections: { people: h.people } })) }));
vi.mock("@/lib/policies/store", () => ({
  loadPolicies: vi.fn(async () => ({ values: { "policy.deposit.pct": 10 }, changed: {} })),
  savePolicy: vi.fn(async (key: string, value: unknown, by: string) => {
    h.saved.push({ key, value, by });
  }),
  PolicyError: class extends Error {},
}));

import { GET, PUT } from "../route";

const req = (method: string, body?: unknown) =>
  new NextRequest("http://x/api/policies", { method, body: body ? JSON.stringify(body) : undefined, headers: { "content-type": "application/json" } });

beforeEach(() => {
  h.who = null;
  h.people = { "marco@saddlewoodcontracting.com": { name: "Marco", role: "owner" }, "sam@saddlewoodcontracting.com": { name: "Sam", role: "requester" } };
  h.saved = [];
});

describe("/api/policies", () => {
  it("lets the agent token read, never change", async () => {
    h.who = { actor: "contract.py", via: "token" };
    const g = await GET(req("GET"));
    expect(g.status).toBe(200);
    expect(await g.json()).toMatchObject({ ok: true, values: { "policy.deposit.pct": 10 }, canEdit: false });
    const p = await PUT(req("PUT", { key: "policy.deposit.pct", value: 50 }));
    expect(p.status).toBe(401);
    expect(h.saved).toEqual([]);
  });

  it("an owner changes them; office staff only read; nobody signed out", async () => {
    h.who = { actor: "sam@saddlewoodcontracting.com", via: "session" };
    expect((await GET(req("GET"))).status).toBe(200);
    expect((await PUT(req("PUT", { key: "policy.deposit.pct", value: 15 }))).status).toBe(403);
    h.who = { actor: "marco@saddlewoodcontracting.com", via: "session" };
    expect((await PUT(req("PUT", { key: "policy.deposit.pct", value: 15 }))).status).toBe(200);
    expect(h.saved).toEqual([{ key: "policy.deposit.pct", value: 15, by: "Marco" }]);
    h.who = null;
    expect((await GET(req("GET"))).status).toBe(401);
  });
});
