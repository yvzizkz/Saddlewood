import { describe, expect, it } from "vitest";

import { nextCutoff, previousCutoff, reportedThisCycle } from "@/lib/accounting/receivables";
import { checkReport, type ProgressLine } from "../progress";

// The PM's percent complete for a billing cycle: the same rules as a draw, and
// which cycle a report counts for (AFT closes the 23rd; others the 1st and 15th).

const lines: ProgressLine[] = [
  { key: "sov:0", description: "Framing", scheduledCents: 16_500_000, billedToDateCents: 14_850_000, pctToDate: 90, kind: "sov" },
  { key: "co:7", description: "CO-2 Soffit", scheduledCents: 250_000, billedToDateCents: 0, pctToDate: 0, kind: "co" },
];

describe("checkReport", () => {
  it("takes percents forward on lines that exist", () => {
    expect(checkReport(lines, { "sov:0": 95, "co:7": 100 })).toEqual([]);
    expect(checkReport(lines, { "sov:0": 90 })).toEqual([]);
  });

  it("refuses an empty report, a line that is not there, going backwards and past 100", () => {
    expect(checkReport(lines, {})).toEqual(["Put a percent complete on at least one line."]);
    expect(checkReport(lines, { "sov:9": 50 })[0]).toMatch(/No line sov:9/);
    expect(checkReport(lines, { "sov:0": 85 }).join(" ")).toMatch(/below the 90%/);
    expect(checkReport(lines, { "co:7": 120 }).length).toBeGreaterThan(0);
  });
});

describe("billing cycles", () => {
  it("finds the cutoff before this one, monthly and twice a month", () => {
    expect(previousCutoff("2026-10-23", 23)).toBe("2026-09-23");
    expect(previousCutoff("2026-01-20", 20)).toBe("2025-12-20");
    expect(previousCutoff("2026-10-15")).toBe("2026-10-01");
    expect(previousCutoff("2026-11-01")).toBe("2026-10-15");
    expect(previousCutoff("2026-03-31", 31)).toBe("2026-02-28");
  });

  it("counts a report sent after the last cutoff, up to this one", () => {
    const day = nextCutoff("2026-10-20", 23);
    expect(day).toBe("2026-10-23");
    expect(reportedThisCycle("2026-10-20", day, 23)).toBe(true);
    expect(reportedThisCycle("2026-09-24", day, 23)).toBe(true);
    expect(reportedThisCycle("2026-09-23", day, 23)).toBe(false);
    expect(reportedThisCycle(null, day, 23)).toBe(false);
  });
});
