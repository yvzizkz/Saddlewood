import { describe, expect, it } from "vitest";

import { businessDaysBefore, nextCutoff, packageCutoff, packageState, packageTaskDay, previousCutoff, reportedThisCycle, type PackageGroup } from "@/lib/accounting/receivables";
import { addDays } from "@/lib/crew/time";
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

  it("gives a package to the cutoff nearest the day it was started, as the real AFT and homeowner packages went", () => {
    expect(packageCutoff("2026-10-23", 23)).toBe("2026-10-23");
    expect(packageCutoff("2026-10-27", 23)).toBe("2026-10-23");
    expect(packageCutoff("2026-10-30", 23)).toBe("2026-10-23");
    expect(packageCutoff("2026-11-20", 23)).toBe("2026-11-23");
    expect(packageCutoff("2026-10-20")).toBe("2026-10-15");
    expect(packageCutoff("2026-10-27")).toBe("2026-11-01");
    expect(packageCutoff("2026-11-05")).toBe("2026-11-01");
  });

  it("keeps a cutoff 3 days ahead of today inside the 7-day prep window and current cycle on every day of the year", () => {
    for (let i = 0; i < 365; i++) {
      const today = addDays("2026-01-01", i);
      const cutoffDay = Number(addDays(today, 3).slice(8, 10));
      const day = nextCutoff(today, cutoffDay);
      const prepOn = businessDaysBefore(day, 3);
      expect(prepOn <= addDays(today, 7), today).toBe(true);
      expect(reportedThisCycle(today, day, cutoffDay), today).toBe(true);
    }
  });
});

describe("where a client's packages stand", () => {
  const bill = { kind: "invoice", status: "issued", sent: false };
  const group = (id: string, createdOn: string, sentOn: string | null, documents: PackageGroup["documents"]): PackageGroup => ({ id, createdOn, sentOn, documents });
  const at = (groups: PackageGroup[], today: string, cutoffDay = 23) => {
    const day = nextCutoff(today, cutoffDay);
    const state = packageState(groups, day, today, cutoffDay);
    return { ...state, task: packageTaskDay({ ...state, day, prepOn: businessDaysBefore(day, 3) }, today) };
  };

  it("counts a sent group only if it held a bill", () => {
    const coOnly = group("co", "2026-10-22", "2026-10-22", [{ kind: "change_order", status: "issued", sent: true }]);
    expect(at([coOnly], "2026-10-22")).toEqual({ packageSentOn: null, packageGroupId: null, packageLateFor: null, task: "2026-10-23" });
    expect(at([group("g", "2026-10-22", "2026-10-22", [{ ...bill, sent: true }])], "2026-10-22")).toEqual({ packageSentOn: "2026-10-22", packageGroupId: null, packageLateFor: null, task: null });
    expect(at([group("g", "2026-10-22", "2026-10-22", [])], "2026-10-22").packageSentOn).toBeNull();
  });

  it("keeps a second job's bills open beside the group that went", () => {
    const groups = [group("sent", "2026-10-21", "2026-10-22", [{ ...bill, sent: true }]), group("second", "2026-10-22", null, [bill])];
    expect(at(groups, "2026-10-22")).toEqual({ packageSentOn: "2026-10-22", packageGroupId: "second", packageLateFor: null, task: "2026-10-23" });
  });

  it("has nothing waiting in an empty group, a change order alone, or bills voided or sent one at a time", () => {
    const none = { packageGroupId: null, packageLateFor: null };
    expect(at([group("g", "2026-10-22", null, [])], "2026-10-29")).toMatchObject(none);
    expect(at([group("g", "2026-10-22", null, [{ kind: "change_order", status: "draft", sent: false }])], "2026-10-29")).toMatchObject(none);
    expect(at([group("g", "2026-10-22", null, [{ ...bill, status: "void" }])], "2026-10-29")).toMatchObject(none);
    expect(at([group("g", "2026-10-22", null, [{ ...bill, sent: true }])], "2026-10-29")).toMatchObject(none);
    expect(at([group("g", "2026-10-22", null, [{ ...bill, sent: true }, bill])], "2026-10-22").packageGroupId).toBe("g");
  });

  it("stays late past mid-cycle, with no gap, until it goes", () => {
    const unsent = [group("g", "2026-10-23", null, [bill])];
    expect(at(unsent, "2026-10-23")).toMatchObject({ packageLateFor: null, task: "2026-10-23" });
    for (const today of ["2026-10-24", "2026-11-07", "2026-11-08", "2026-11-09", "2026-11-10", "2026-11-11", "2026-11-23", "2026-12-01"]) {
      expect(at(unsent, today), today).toMatchObject({ packageGroupId: "g", packageLateFor: "2026-10-23", task: "2026-10-23" });
    }
  });

  it("credits a late send to the cycle it was started for, so the next stays open", () => {
    const sent = [group("g", "2026-10-23", "2026-11-09", [{ ...bill, sent: true }])];
    expect(at(sent, "2026-11-09")).toEqual({ packageSentOn: null, packageGroupId: null, packageLateFor: null, task: null });
    expect(at(sent, "2026-11-18")).toMatchObject({ packageSentOn: null, task: "2026-11-23" });
  });

  it("opens the oldest waiting, and started after the cutoff is still for that cutoff", () => {
    const groups = [group("old", "2026-10-25", null, [bill]), group("new", "2026-11-20", null, [bill])];
    expect(at(groups, "2026-11-21")).toMatchObject({ packageGroupId: "old", packageLateFor: "2026-10-23" });
  });
});
