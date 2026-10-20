import { describe, expect, it } from "vitest";

import { parseQuickLine } from "../quickline";

const R = 45.03;

describe("parseQuickLine", () => {
  it("reads a quantity, a unit and a unit price", () => {
    expect(parseQuickLine("120 sf drywall patch @ 2.50", R)).toMatchObject({ description: "Drywall patch", qty: 120, unit: "SF", kind: "other", cost: 2.5 });
    expect(parseQuickLine("baseboard 220 lf at $3.10 mat", R)).toMatchObject({ description: "Baseboard", qty: 220, unit: "LF", kind: "material", mat: 3.1 });
  });

  it("prices hours with no price as labor at the rate", () => {
    expect(parseQuickLine("demo kitchen 16 hrs", R)).toMatchObject({ description: "Demo kitchen", kind: "labor", qty: 16, unit: "HR", hrs: 1, lab: 0 });
  });

  it("reads a lump sum and what kind of cost it is", () => {
    expect(parseQuickLine("dumpster $650", R)).toMatchObject({ kind: "equipment", qty: 1, unit: "LS", cost: 650 });
    expect(parseQuickLine("plumbing sub 4200", R)).toMatchObject({ kind: "sub", cost: 4200 });
    expect(parseQuickLine("cabinet allowance 12k", R)).toMatchObject({ kind: "allowance", cost: 12000 });
    expect(parseQuickLine("electrical $3,850.50", R)).toMatchObject({ kind: "sub", cost: 3850.5 });
  });

  it("leaves an unpriced line with a unit as installed work to price", () => {
    expect(parseQuickLine("tile floor 85 sf", R)).toMatchObject({ kind: "installed", qty: 85, unit: "SF", mat: 0, lab: 0, cost: 0 });
  });

  it("refuses an empty line", () => {
    expect(parseQuickLine("   ", R)).toBeNull();
    expect(parseQuickLine("$500", R)).toBeNull();
  });
});
