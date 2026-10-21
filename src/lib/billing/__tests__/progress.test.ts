import { describe, expect, it } from "vitest";

import { computeDraw, drawInvoiceLines, shareOf, type ProgressLine } from "../progress";

const sov: ProgressLine[] = [
  { key: "sov:0", description: "Framing", scheduledCents: 20_000_00, billedToDateCents: 5_000_00, pctToDate: 25, kind: "sov" },
  { key: "sov:1", description: "Drywall", scheduledCents: 12_000_00, billedToDateCents: 0, pctToDate: 0, kind: "sov" },
  { key: "co:7", description: "CO-2 Theater soffit", scheduledCents: 1_420_00, billedToDateCents: 0, pctToDate: 0, kind: "co" },
];

describe("computeDraw", () => {
  it("bills each line's share to date less what was billed before, then holds retainage", () => {
    const d = computeDraw(sov, { "sov:0": 60, "sov:1": 25, "co:7": 100 }, 10);
    expect(d.errors).toEqual([]);
    expect(d.lines.map((l) => l.thisPeriodCents)).toEqual([7_000_00, 3_000_00, 1_420_00]);
    expect(d.grossCents).toBe(11_420_00);
    expect(d.retainageCents).toBe(1_142_00);
    expect(d.dueCents).toBe(10_278_00);
    expect(d.billedToDateCents).toBe(12_000_00 + 3_000_00 + 1_420_00);
    expect(d.contractCents).toBe(33_420_00);
  });

  it("keeps a line not asked at its last percent and bills nothing on it", () => {
    const d = computeDraw(sov, { "sov:1": 50 });
    expect(d.lines[0]).toMatchObject({ pct: 25, thisPeriodCents: 0 });
    expect(d.grossCents).toBe(6_000_00);
    expect(d.retainageCents).toBe(0);
  });

  it("refuses going backwards, past 100 and below zero", () => {
    expect(computeDraw(sov, { "sov:0": 20 }).errors[0]).toMatch(/below the 25% already billed/);
    expect(computeDraw(sov, { "sov:1": 120 }).errors.join(" ")).toMatch(/0 to 100/);
    expect(computeDraw(sov, { "sov:1": -5 }).errors.join(" ")).toMatch(/0 to 100/);
  });

  it("rounds to cents the same way every draw so the last one lands on the line exactly", () => {
    const odd: ProgressLine[] = [{ key: "sov:0", description: "Odd", scheduledCents: 1_000_01, billedToDateCents: shareOf(1_000_01, 33.33), pctToDate: 33.33, kind: "sov" }];
    const d = computeDraw(odd, { "sov:0": 100 });
    expect(d.lines[0].toDateCents).toBe(1_000_01);
    expect(d.lines[0].balanceCents).toBe(0);
  });
});

describe("drawInvoiceLines", () => {
  it("lists only lines that bill this period and ends with retainage held as a negative line", () => {
    const lines = drawInvoiceLines(computeDraw(sov, { "sov:1": 50 }, 10));
    expect(lines.map((l) => l.description)).toEqual(["Drywall", "Retainage held (10%)"]);
    expect(lines.reduce((a, l) => a + l.amountCents, 0)).toBe(5_400_00);
  });
});
