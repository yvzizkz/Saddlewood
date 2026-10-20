import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// PATCH /api/accounting/purchases: putting one trip on a job (or none) is a
// direct, manual assignment; it never saves an alias rule or sets the
// register name's other trips aside. The rule is its own action.

const { calls } = vi.hoisted(() => ({ calls: { alias: [] as unknown[][], relink: [] as unknown[][], assign: [] as unknown[][] } }));
vi.mock("@/lib/crew/auth", () => ({ getViewer: async () => ({ kind: "staff", email: "lando@example.com" }), viewerIsOwner: async () => true }));
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => ({}) }));
vi.mock("@/lib/accounting/trades", () => ({ listTrades: async () => [] }));
vi.mock("@/lib/crew/purchaseQueries", () => ({
  upsertAlias: async (...a: unknown[]) => void calls.alias.push(a),
  relinkPurchases: async (...a: unknown[]) => (calls.relink.push(a), 3),
  assignPurchases: async (...a: unknown[]) => (calls.assign.push(a), 2),
}));

import { PATCH } from "../purchases/route";

const req = (body: unknown) => new NextRequest("http://localhost/api/accounting/purchases", { method: "PATCH", body: JSON.stringify(body) });

beforeEach(() => {
  calls.alias = [];
  calls.relink = [];
  calls.assign = [];
});

describe("assign_job", () => {
  it("puts one trip on a job without touching the register name's rule", async () => {
    const res = await PATCH(req({ action: "assign_job", tripKey: "hd:20260812:674", jobKey: "pt loma", jobId: "emerson" }));
    expect(res.status).toBe(200);
    expect(calls.assign).toEqual([[{ tripKey: "hd:20260812:674", sourceKeys: [] }, "emerson"]]);
    expect(calls.alias).toEqual([]);
    expect(calls.relink).toEqual([]);
  });

  it("'Unassigned' takes the trip off its job and makes no ignore rule", async () => {
    await PATCH(req({ action: "assign_job", tripKey: "hd:20260812:674", jobId: null }));
    expect(calls.assign[0][1]).toBeNull();
    expect(calls.alias).toEqual([]);
  });

  it("needs a trip or lines", async () => {
    expect((await PATCH(req({ action: "assign_job", jobKey: "pt loma", jobId: "emerson" }))).status).toBe(400);
  });
});

describe("alias_rule", () => {
  it("saves the rule for the register name and relinks its lines", async () => {
    const res = await PATCH(req({ action: "alias_rule", jobKey: "pt loma", jobId: "point-loma" }));
    expect(await res.json()).toMatchObject({ ok: true, moved: 3 });
    expect(calls.alias).toEqual([["pt loma", "point-loma", "lando@example.com"]]);
    expect(calls.relink).toEqual([["pt loma", "point-loma"]]);
  });
});
