import { describe, expect, it } from "vitest";

import { rolloutRows, type RolloutPerson } from "../rollout";

const TODAY = "2026-11-04";
const field = (name: string, lastSeenAt: string | null = null): RolloutPerson => ({ name, seat: "Crew", hasPhone: false, lastSeenAt, emails: [`${name}@x`], field: true });
const office = (name: string, lastSeenAt: string | null, emails = [`${name}@x`]): RolloutPerson => ({ name, seat: "Office", hasPhone: true, lastSeenAt, emails, field: false });

describe("who's on the app", () => {
  it("counts field people by clocking in or logging, not by opening it", () => {
    const rows = rolloutRows([field("a", "2026-11-03T15:00:00Z"), field("b"), field("c"), field("d")], [{ email: "b@x", day: "2026-11-02" }, { email: "b@x", day: "2026-11-03" }, { email: "c@x", day: "2026-10-16" }], [{ email: "d@x", day: "2026-10-29" }], TODAY);
    expect(rows.map((r) => r.standing)).toEqual(["Opened it", "Using it", "Opened it", "Using it"]);
    expect(rows[1]).toMatchObject({ clocksThisWeek: 2, lastClockOn: "2026-11-03" });
    expect(rows[3].lastLogOn).toBe("2026-10-29");
  });

  it("counts office people by opening it this week, across both of their addresses", () => {
    const rows = rolloutRows([office("m", "2026-11-03T15:00:00Z"), office("i", "2026-10-01T15:00:00Z"), office("n", null), office("l", null, ["l@x", "info@x"])], [{ email: "info@x", day: "2026-10-01" }], [], TODAY);
    expect(rows.map((r) => r.standing)).toEqual(["Using it", "Opened it", "Not yet", "Opened it"]);
  });

  it("the week is today and the six days before", () => {
    const edge = (day: string) => rolloutRows([field("a")], [{ email: "a@x", day }], [], TODAY)[0].standing;
    expect(edge("2026-10-29")).toBe("Using it");
    expect(edge("2026-10-28")).toBe("Opened it");
  });

  it("a person who never showed up is Not yet", () => {
    expect(rolloutRows([field("a")], [], [], TODAY)[0]).toMatchObject({ standing: "Not yet", lastSeenOn: null, lastClockOn: null, lastLogOn: null, clocksThisWeek: 0 });
  });
});
