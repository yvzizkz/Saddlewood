import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Seat } from "@/lib/roles/seats";

// Who gets a seat on the job pages and Tasks: owners and PMs through their
// money seat (money on), a field lead through the Field lead seat (money off,
// only the field jobs they are on), and nobody else.

const { state } = vi.hoisted(() => ({
  state: {
    money: null as null | Record<string, unknown>,
    viewer: { kind: "anonymous" } as Record<string, unknown>,
    seats: [] as Seat[],
    on: [] as { jobId: string; email: string; role: string }[],
  },
}));

vi.mock("@/lib/accounting/access", () => ({
  moneySeatForPage: async () => state.money,
  seesCrewJob: (seat: { crewJobs: string[] | null }, id: string | null) => seat.crewJobs === null || (!!id && seat.crewJobs.includes(id)),
  seesBillingJob: (seat: { billingJobs: string[] | null }, id: string | null) => seat.billingJobs === null || (!!id && seat.billingJobs.includes(id)),
}));
vi.mock("@/lib/crew/auth", () => ({ getViewer: async () => state.viewer }));
vi.mock("@/lib/crew/queries", () => ({ listJobPeople: async ({ email }: { email: string }) => state.on.filter((a) => a.email === email) }));
vi.mock("@/lib/jobs/hub", () => ({ getJobRef: async () => null }));
vi.mock("@/lib/roles/store", async () => {
  const { peopleOf } = await import("@/lib/roles/seats");
  return {
    loadSeats: async () => state.seats,
    loadPeople: async () => peopleOf({ "marco@x.com": { name: "Marco", role: "owner" } } as never, [
      { email: "eli.pm@x.com", name: "Eli Ramos" },
      { email: "arnold@x.com", name: "Arnold Mujica" },
      { email: "kevin@x.com", name: "Kevin Diaz" },
    ]),
  };
});

import { seesJob, workSeat } from "../access";

const seat = (holder: string, backup: string): Seat[] => [{ role: "field_lead", holder, backup, note: "", updatedBy: "", updatedAt: null }];
const crew = (email: string, perms: string[] = ["clock", "tasks.assign"]) => ({ kind: "crew", person: { email, perms } });

beforeEach(() => {
  state.money = null;
  state.viewer = crew("arnold@x.com");
  state.seats = seat("Arnold", "Eli");
  state.on = [
    { jobId: "keim", email: "arnold@x.com", role: "lead" },
    { jobId: "keim", email: "kevin@x.com", role: "crew" },
    { jobId: "bambi", email: "kevin@x.com", role: "crew" },
  ];
});

describe("workSeat for a field lead", () => {
  it("gives the seat holder the field jobs they are on, and no money", async () => {
    const s = await workSeat();
    expect(s).toEqual({ owner: false, email: "arnold@x.com", crewJobs: ["keim"], billingJobs: [], laborCost: false, margin: false, sections: [], money: false });
    expect(seesJob(s!, { crewId: "keim", billingId: "j1" })).toBe(true);
    expect(seesJob(s!, { crewId: "bambi", billingId: null })).toBe(false);
    // A billing-only job has no crew on it: not theirs.
    expect(seesJob(s!, { crewId: null, billingId: "j1" })).toBe(false);
  });

  it("is never every job, even for a lead on no job", async () => {
    state.on = [];
    expect((await workSeat())?.crewJobs).toEqual([]);
  });

  it("lets the backup in only while the seat is empty", async () => {
    state.viewer = crew("kevin@x.com");
    state.seats = seat("", "Kevin");
    expect((await workSeat())?.crewJobs?.sort()).toEqual(["bambi", "keim"]);
    state.seats = seat("Arnold", "Kevin");
    expect(await workSeat()).toBeNull();
  });

  it("turns away crew who hold no seat, and anyone who is not crew", async () => {
    state.viewer = crew("kevin@x.com");
    expect(await workSeat()).toBeNull();
    state.viewer = { kind: "staff", email: "someone@x.com" };
    expect(await workSeat()).toBeNull();
  });

  it("keeps an owner's or a PM's money seat, with money on", async () => {
    state.money = { owner: false, email: "eli.pm@x.com", crewJobs: ["keim"], billingJobs: ["j1"], laborCost: false, margin: false, sections: ["overview"] };
    expect(await workSeat()).toMatchObject({ email: "eli.pm@x.com", billingJobs: ["j1"], money: true });
  });
});
