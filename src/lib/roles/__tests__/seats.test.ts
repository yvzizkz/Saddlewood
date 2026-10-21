import { describe, expect, it } from "vitest";

import { decisionRights, escalationOf, peopleOf, seatHolder, type Seat } from "../seats";

const people = peopleOf(
  {
    "marco@x.com": { name: "Marco Ruiz", role: "owner" },
    "lando@x.com": { name: "Lando", role: "owner" },
    "info@x.com": { name: "Lando", role: "owner" },
    "ilene@x.com": { name: "Ilene", role: "owner" },
  } as never,
  [{ email: "eli.pm@x.com", name: "Eli Ramirez" }],
);
const seats: Seat[] = [
  { role: "finance", holder: "Ilene", backup: "Lando", note: "", updatedBy: "", updatedAt: null },
  { role: "sales", holder: "", backup: "Marco", note: "", updatedBy: "", updatedAt: null },
  { role: "pm", holder: "eli.pm@x.com", backup: "Marco", note: "", updatedBy: "", updatedAt: null },
  { role: "field_lead", holder: "Nobody", backup: "Gone", note: "", updatedBy: "", updatedAt: null },
];

describe("seatHolder", () => {
  it("names the holder, every seat of that person", () => {
    expect(seatHolder("finance", seats, people)).toEqual({ name: "Ilene", emails: ["ilene@x.com"], covering: false });
    expect(seatHolder("pm", seats, people).emails).toEqual(["eli.pm@x.com"]);
  });
  it("falls to the cover, then to the owners, never to nobody", () => {
    expect(seatHolder("sales", seats, people)).toMatchObject({ name: "Marco", covering: true });
    expect(seatHolder("field_lead", seats, people)).toMatchObject({ name: "the owners", covering: true });
    expect(seatHolder("field_lead", seats, people).emails).toHaveLength(4);
  });
  it("uses the decided defaults for a seat with no row", () => {
    expect(seatHolder("ops", [], people).emails.sort()).toEqual(["info@x.com", "lando@x.com"]);
  });
});

describe("rights and escalation", () => {
  it("reads the limits from policies", () => {
    const r = decisionRights({ "requests.pmLimitCents": 75_000, "policy.subs.pmAwardLimitCents": 500_000 });
    expect(r.find((x) => x.action === "Approve a material request" && x.role === "pm")?.upToCents).toBe(75_000);
    expect(r.find((x) => x.action === "Award sub work" && x.role === "pm")?.upToCents).toBe(500_000);
  });
  it("moves overdue work up a role", () => {
    expect(escalationOf("field_lead")).toBe("pm");
    expect(escalationOf("pm")).toBe("decisions");
    expect(escalationOf("decisions")).toBe("ops");
  });
});

import { laneHolder, lanesOf } from "@/lib/owner/lanes";
import { laneSeatsOf } from "../store";

describe("lanes follow the seats", () => {
  const bot = { "marco@x.com": { name: "Marco Ruiz", role: "owner" }, "lando@x.com": { name: "Lando", role: "owner" }, "ilene@x.com": { name: "Ilene", role: "owner" } } as never;
  it("keeps the decided lanes with no seats", () => {
    expect(laneHolder("money", bot).emails).toEqual(["ilene@x.com"]);
  });
  it("moves a lane when its seat changes, by name or by email", () => {
    const seats = laneSeatsOf([
      { role: "finance", holder: "lando@x.com", backup: "", note: "", updatedBy: "", updatedAt: null },
      { role: "sales", holder: "Gone", backup: "Ilene", note: "", updatedBy: "", updatedAt: null },
    ]);
    expect(laneHolder("money", bot, seats)).toEqual({ name: "Lando", emails: ["lando@x.com"], backup: false });
    expect(laneHolder("sales", bot, seats)).toMatchObject({ name: "Ilene", backup: true });
    expect(lanesOf("lando@x.com", bot, seats)).toContain("money");
  });
});
