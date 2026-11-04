import { describe, expect, it } from "vitest";

import { canCloseComplaint } from "../rules";

const OWNER = { owner: true, money: true };
const PM = { owner: false, money: true };
const LEAD = { owner: false, money: false };

describe("canCloseComplaint", () => {
  it("a PM closes one open with the PM's seat", () => {
    expect(canCloseComplaint(PM, { status: "open", role: "pm" })).toBe(true);
  });
  it("a PM can't close one with Owner decisions, or touch one already closed or dropped", () => {
    expect(canCloseComplaint(PM, { status: "open", role: "decisions" })).toBe(false);
    expect(canCloseComplaint(PM, { status: "done", role: "pm" })).toBe(false);
    expect(canCloseComplaint(PM, { status: "dropped", role: "pm" })).toBe(false);
  });
  it("a field lead never closes one; an owner always can", () => {
    expect(canCloseComplaint(LEAD, { status: "open", role: "pm" })).toBe(false);
    expect(canCloseComplaint(OWNER, { status: "open", role: "decisions" })).toBe(true);
  });
});
