import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => ({}) }));

import { approvalBlock, approvalToShow } from "../coApprove";

// Which change-order links still take the client's approval, and the words when not.

describe("approvalBlock", () => {
  it("takes one sent to the client, or issued after pricing", () => {
    expect(approvalBlock({ status: "issued" }, { status: "sent" })).toBeNull();
    expect(approvalBlock({ status: "issued" }, { status: "priced" })).toBeNull();
  });

  it("refuses a void document, or one no change order points at any more (replaced)", () => {
    expect(approvalBlock({ status: "void" }, { status: "sent" })).toMatch(/withdrawn or replaced/);
    expect(approvalBlock({ status: "issued" }, null)).toMatch(/withdrawn or replaced/);
  });

  it("refuses one already approved or billed, and one rejected, voided or not issued", () => {
    expect(approvalBlock({ status: "issued" }, { status: "signed" })).toBe("This change order is already approved.");
    expect(approvalBlock({ status: "issued" }, { status: "billed" })).toBe("This change order is already approved.");
    for (const status of ["rejected", "void", "requested"]) expect(approvalBlock({ status: "issued" }, { status })).toMatch(/not open for approval/);
    expect(approvalBlock({ status: "draft" }, { status: "sent" })).toMatch(/not open for approval/);
  });
});

describe("approvalToShow", () => {
  const sig = { name: "Chris Turner" };

  it("shows the signature on a signed or billed change order", () => {
    expect(approvalToShow({ status: "issued" }, { status: "signed" }, sig)).toBe(sig);
    expect(approvalToShow({ status: "issued" }, { status: "billed" }, sig)).toBe(sig);
  });

  it("keeps the form up when the signature saved but the register did not move", () => {
    for (const status of ["sent", "priced"]) {
      const co = { status };
      expect(approvalToShow({ status: "issued" }, co, sig)).toBeNull();
      expect(approvalBlock({ status: "issued" }, co)).toBeNull();
    }
  });

  it("never reads approved once it was withdrawn or replaced", () => {
    expect(approvalToShow({ status: "issued" }, { status: "void" }, sig)).toBeNull();
    expect(approvalToShow({ status: "issued" }, null, sig)).toBeNull();
    expect(approvalToShow({ status: "void" }, { status: "signed" }, sig)).toBeNull();
  });

  it("has nothing to show with no signature", () => {
    expect(approvalToShow({ status: "issued" }, { status: "signed" }, null)).toBeNull();
  });
});
