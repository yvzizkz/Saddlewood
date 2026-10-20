import { describe, expect, it } from "vitest";

import { clearHold, holdsOf, paymentBlock, waiverCollectedFor } from "../payablesRules";

// SOP-004: a sub is paid only with its waiver, an active COI and the PM's
// sign-off; clearing one hold never clears another.

const sub = { kind: "sub", status: "open", waiverStatus: "conditional_received", coiExpired: false };

describe("paymentBlock", () => {
  it("lets an open bill with its waiver and a current COI be paid", () => {
    expect(paymentBlock(sub)).toBeNull();
    expect(paymentBlock({ ...sub, status: "partial" })).toBeNull();
  });

  it("refuses held, void, draft, paid and expired-COI bills", () => {
    for (const status of ["hold_waiver", "hold_coi", "needs_approval", "void", "draft", "paid", "disputed"]) {
      expect(paymentBlock({ ...sub, status }), status).not.toBeNull();
    }
    expect(paymentBlock({ ...sub, waiverStatus: "missing" })).toMatch(/waiver/);
    expect(paymentBlock({ ...sub, coiExpired: true })).toMatch(/COI/);
  });
});

describe("waiverCollectedFor", () => {
  it("takes a sub's waiver only from the payer's statement, and needs none for vendors", () => {
    expect(waiverCollectedFor("sub", true)).toBe(true);
    expect(waiverCollectedFor("sub", undefined)).toBeNull();
    expect(waiverCollectedFor("sub", "yes")).toBeNull();
    expect(waiverCollectedFor("vendor", undefined)).toBe(false);
  });
});

describe("clearHold", () => {
  it("clears a waiver hold and schedules the bill when nothing else stands", () => {
    expect(clearHold({ ...sub, status: "hold_waiver", waiverStatus: "missing" }, "waiver")).toEqual({ patch: { status: "scheduled", waiver_status: "conditional_received" } });
  });

  it("won't clear a COI hold while the COI is still expired", () => {
    expect(clearHold({ ...sub, status: "hold_coi", coiExpired: true }, "coi")).toEqual({ error: expect.stringMatching(/still expired/) });
  });

  it("clears a renewed COI hold", () => {
    expect(clearHold({ ...sub, status: "hold_coi" }, "coi")).toEqual({ patch: { status: "scheduled" } });
  });

  it("clearing the waiver on a bill whose COI is expired leaves it on the COI hold", () => {
    expect(clearHold({ ...sub, status: "hold_waiver", waiverStatus: "missing", coiExpired: true }, "waiver")).toEqual({ patch: { status: "hold_coi", waiver_status: "conditional_received" } });
  });

  it("approving leaves a missing waiver on hold, and refuses a hold that isn't there", () => {
    expect(clearHold({ ...sub, status: "needs_approval", waiverStatus: "missing" }, "approval")).toEqual({ patch: { status: "hold_waiver" } });
    expect(clearHold(sub, "coi")).toEqual({ error: expect.any(String) });
    expect(holdsOf({ ...sub, status: "partial" })).toEqual([]);
  });
});
