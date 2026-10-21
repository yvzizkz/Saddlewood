import { describe, expect, it } from "vitest";

import { peopleOf, type Seat } from "@/lib/roles/seats";
import { isMine, placeItem } from "../feed";

const people = peopleOf({ "marco@x.com": { name: "Marco", role: "owner" }, "ilene@x.com": { name: "Ilene", role: "owner" }, "lando@x.com": { name: "Lando", role: "owner" } } as never, [
  { email: "eli@x.com", name: "Eli" },
]);
const seats: Seat[] = [
  { role: "pm", holder: "eli@x.com", backup: "Marco", note: "", updatedBy: "", updatedAt: null },
  { role: "decisions", holder: "Marco", backup: "Lando", note: "", updatedBy: "", updatedAt: null },
  { role: "finance", holder: "Ilene", backup: "Lando", note: "", updatedBy: "", updatedAt: null },
];

describe("placeItem", () => {
  it("stays with its role until the grace runs out, then moves up one", () => {
    expect(placeItem("pm", "2026-10-18", 2, "2026-10-20")).toEqual({ nowRole: "pm", overdueDays: 2, escalated: false });
    expect(placeItem("pm", "2026-10-17", 2, "2026-10-20")).toEqual({ nowRole: "decisions", overdueDays: 3, escalated: true });
    expect(placeItem("finance", null, 0, "2026-10-20")).toEqual({ nowRole: "finance", overdueDays: 0, escalated: false });
  });
});

describe("isMine", () => {
  const item = { assignee: "", role: "pm" as const, nowRole: "pm" as const, escalated: false };
  it("belongs to whoever holds the role unless a person is named", () => {
    expect(isMine(item, "eli@x.com", seats, people)).toBe(true);
    expect(isMine(item, "marco@x.com", seats, people)).toBe(false);
    expect(isMine({ ...item, assignee: "ilene@x.com" }, "ilene@x.com", seats, people)).toBe(true);
    expect(isMine({ ...item, assignee: "ilene@x.com" }, "eli@x.com", seats, people)).toBe(false);
  });
  it("lands on the next role up when escalated, and stays with the named person too", () => {
    const up = { ...item, nowRole: "decisions" as const, escalated: true };
    expect(isMine(up, "marco@x.com", seats, people)).toBe(true);
    expect(isMine(up, "eli@x.com", seats, people)).toBe(false);
    expect(isMine({ ...up, assignee: "eli@x.com" }, "eli@x.com", seats, people)).toBe(true);
  });
});
