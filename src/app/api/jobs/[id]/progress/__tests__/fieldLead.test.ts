import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// The schedule of values is contract dollars. A field lead's seat (money off,
// jobs/access.ts) never reads it or reports on it, even on their own job;
// the PM on that job still does.

const { state } = vi.hoisted(() => ({ state: { seat: null as null | Record<string, unknown>, loaded: 0, saved: 0 } }));

vi.mock("@/lib/jobs/access", () => ({
  workSeat: async () => state.seat,
  jobForWrite: async () => ({ key: "keim", billingId: "j1", crewId: "keim" }),
}));
vi.mock("@/lib/roles/store", () => ({ loadPeople: async () => [] }));
vi.mock("@/lib/billing/progressStore", () => ({
  loadProgress: async () => (state.loaded++, { lines: [] }),
  saveReport: async () => (state.saved++, {}),
  clearReport: async () => ({}),
  createDrawDraft: async () => ({}),
  discardDraw: async () => ({}),
  previewDraw: async () => ({}),
  setClientCutoff: async () => ({}),
  setOpening: async () => ({}),
  ProgressError: class extends Error {
    status = 400;
  },
}));

import { GET, POST } from "../route";

const params = { params: Promise.resolve({ id: "keim" }) };
const LEAD = { owner: false, email: "arnold@x.com", crewJobs: ["keim"], billingJobs: [], laborCost: false, margin: false, sections: [], money: false };
const PM = { ...LEAD, email: "eli.pm@x.com", billingJobs: ["j1"], sections: ["overview"], money: true };

beforeEach(() => {
  state.seat = LEAD;
  state.loaded = 0;
  state.saved = 0;
});

describe("/api/jobs/[id]/progress and a field lead", () => {
  it("refuses a field lead the schedule of values and the % complete report", async () => {
    expect((await GET(new NextRequest("http://localhost/api/jobs/keim/progress"), params)).status).toBe(403);
    const post = new NextRequest("http://localhost/api/jobs/keim/progress", { method: "POST", body: JSON.stringify({ action: "report", pcts: {} }) });
    expect((await POST(post, params)).status).toBe(403);
    expect(state.loaded + state.saved).toBe(0);
  });

  it("still opens it to the job's PM", async () => {
    state.seat = PM;
    expect((await GET(new NextRequest("http://localhost/api/jobs/keim/progress"), params)).status).toBe(200);
    expect(state.loaded).toBe(1);
  });
});
