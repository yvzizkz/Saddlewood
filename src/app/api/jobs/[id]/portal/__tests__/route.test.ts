import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Who may make, change and turn off a job's client link.

const state = vi.hoisted(() => ({ seat: null as null | { owner: boolean; email: string }, calls: [] as unknown[][], live: true }));

vi.mock("@/lib/jobs/access", () => ({
  workSeat: async () => state.seat,
  jobForWrite: async (_seat: unknown, key: string) => (key === "job" ? { key, billingId: "b1" } : key === "crew-only" ? { key, billingId: null } : null),
}));
vi.mock("@/lib/portal/store", () => ({
  createPortal: async (...a: unknown[]) => (state.calls.push(["create", ...a]), { token: "tok", sections: [] }),
  setPortalSections: async (...a: unknown[]) => (state.calls.push(["set", ...a]), state.live ? { sections: a[1] } : null),
  portalPreview: async () => ({ money: null, timeline: false }),
  revokePortal: async (...a: unknown[]) => void state.calls.push(["revoke", ...a]),
}));

import { DELETE, PATCH, POST } from "../route";

const OWNER = { owner: true, email: "o@x" };
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (method: string, body?: unknown) => new NextRequest("http://localhost/api/jobs/job/portal", { method, body: body === undefined ? undefined : JSON.stringify(body) });

beforeEach(() => {
  state.seat = OWNER;
  state.calls = [];
  state.live = true;
});

describe("the client link route", () => {
  it("refuses everyone but owners, for every verb, and writes nothing", async () => {
    for (const seat of [null, { owner: false, email: "pm@x" }]) {
      state.seat = seat;
      expect((await POST(req("POST"), ctx("job"))).status).toBe(403);
      expect((await PATCH(req("PATCH", { sections: ["documents"] }), ctx("job"))).status).toBe(403);
      expect((await DELETE(req("DELETE"), ctx("job"))).status).toBe(403);
    }
    expect(state.calls).toEqual([]);
  });

  it("makes the link for the billing job, as the owner", async () => {
    const res = await POST(req("POST"), ctx("job"));
    expect(await res.json()).toEqual({ ok: true, token: "tok", sections: [], preview: { money: null, timeline: false } });
    expect(state.calls).toEqual([["create", "b1", "o@x"]]);
  });

  it("needs a job with a billing record", async () => {
    expect((await POST(req("POST"), ctx("crew-only"))).status).toBe(409);
    expect((await POST(req("POST"), ctx("nope"))).status).toBe(404);
  });

  it("takes only sections a link has", async () => {
    expect((await PATCH(req("PATCH", { sections: ["pay"] }), ctx("job"))).status).toBe(400);
    expect((await PATCH(req("PATCH", { sections: ["log"], extra: 1 }), ctx("job"))).status).toBe(400);
    expect((await PATCH(req("PATCH", { sections: ["log", "complaint"] }), ctx("job"))).status).toBe(200);
    expect(state.calls).toEqual([["set", "b1", ["log", "complaint"]]]);
  });

  it("says so when the job's link is off", async () => {
    state.live = false;
    expect((await PATCH(req("PATCH", { sections: [] }), ctx("job"))).status).toBe(409);
  });

  it("turns it off, recording who", async () => {
    expect((await DELETE(req("DELETE"), ctx("job"))).status).toBe(200);
    expect(state.calls).toEqual([["revoke", "b1", "o@x"]]);
  });
});
