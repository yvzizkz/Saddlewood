import { describe, expect, it } from "vitest";

import { compact, delta, groupSum, niceTicks, OTHER_KEY, trend } from "../aggregate";
import { toCsv } from "../exporting";
import { colorMap, OTHER_COLOR, SERIES } from "../palette";
import { bucketsBetween, inRange, resolvePeriod } from "../period";

// 2026-10-20 is a Tuesday.
const TODAY = "2026-10-20";

describe("resolvePeriod", () => {
  it("week to date starts on Monday", () => {
    const p = resolvePeriod({ p: "wtd" }, TODAY);
    expect([p.from, p.to]).toEqual(["2026-10-19", TODAY]);
    expect(p.previous).toMatchObject({ from: "2026-10-17", to: "2026-10-18", label: "last week" });
  });

  it("month and year to date", () => {
    expect(resolvePeriod({ p: "mtd" }, TODAY).from).toBe("2026-10-01");
    const y = resolvePeriod({ p: "ytd" }, TODAY);
    expect(y.from).toBe("2026-01-01");
    expect(y.grain).toBe("month");
  });

  it("today compares with yesterday", () => {
    const p = resolvePeriod({ p: "today" }, TODAY);
    expect([p.from, p.to, p.previous.from, p.previous.to]).toEqual([TODAY, TODAY, "2026-10-19", "2026-10-19"]);
    expect(p.label).toBe("Today, Oct 20");
  });

  it("custom swaps a backwards range and falls back when malformed", () => {
    const p = resolvePeriod({ p: "custom", from: "2026-09-30", to: "2026-09-01" }, TODAY);
    expect([p.from, p.to]).toEqual(["2026-09-01", "2026-09-30"]);
    expect(resolvePeriod({ p: "custom", from: "garbage" }, TODAY).key).toBe("wtd");
    expect(resolvePeriod({ p: "nonsense" }, TODAY, "mtd").key).toBe("mtd");
  });
});

describe("buckets", () => {
  it("fills every day, week and month", () => {
    expect(bucketsBetween("2026-10-18", "2026-10-20", "day")).toEqual(["2026-10-18", "2026-10-19", "2026-10-20"]);
    expect(bucketsBetween("2026-10-01", "2026-10-20", "week")).toEqual(["2026-09-28", "2026-10-05", "2026-10-12", "2026-10-19"]);
    expect(bucketsBetween("2026-11-15", "2027-01-02", "month")).toEqual(["2026-11-01", "2026-12-01", "2027-01-01"]);
  });

  it("reads an instant in Phoenix time", () => {
    // 03:00 UTC on the 21st is still the evening of the 20th in Phoenix.
    expect(inRange("2026-10-21T03:00:00Z", "2026-10-20", "2026-10-20")).toBe(true);
    expect(inRange(null, "2026-10-20", "2026-10-20")).toBe(false);
  });
});

describe("groupSum", () => {
  const rows = ["a", "b", "b", "c", "d", "e", "f", "g", "h", "h", "h"].map((k) => ({ k, v: 1 }));

  it("ranks, shares and folds the tail into Other", () => {
    const s = groupSum(rows, (r) => ({ key: r.k, label: r.k.toUpperCase() }), (r) => r.v, 4);
    expect(s.map((x) => x.key)).toEqual(["h", "b", "a", OTHER_KEY]);
    expect(s[3]).toMatchObject({ value: 5, count: 5, label: "Other (5)" });
    expect(s.reduce((a, x) => a + x.share, 0)).toBeCloseTo(1);
  });

  it("puts rows with no group under Unassigned", () => {
    const s = groupSum([{ v: 2 }], () => null, (r) => r.v);
    expect(s[0]).toMatchObject({ key: "", label: "Unassigned", value: 2 });
  });
});

describe("trend", () => {
  it("sums per bucket with zeros for quiet days", () => {
    const t = trend(
      [
        { d: "2026-10-19", v: 8 },
        { d: "2026-10-19", v: 2 },
      ],
      (r) => r.d,
      (r) => r.v,
      "2026-10-18",
      "2026-10-20",
      "day",
    );
    expect(t.map((x) => x.value)).toEqual([0, 10, 0]);
  });
});

describe("numbers", () => {
  it("compacts", () => {
    expect(compact(1284)).toBe("1,284");
    expect(compact(12_900)).toBe("12.9K");
    expect(compact(4_200_000, { money: true })).toBe("$4.2M");
    expect(compact(950.4, { money: true })).toBe("$950");
  });

  it("ticks are round", () => {
    expect(niceTicks(37)).toEqual([0, 10, 20, 30, 40]);
    expect(niceTicks(0)).toEqual([0, 1]);
  });

  it("delta is null with nothing to compare", () => {
    expect(delta(5, 0)).toBeNull();
    expect(delta(15, 10)).toEqual({ pct: 0.5, up: true });
  });
});

describe("toCsv", () => {
  it("quotes, keeps numbers and defuses formulas", () => {
    const csv = toCsv(
      [{ a: 'Smith, "Bo"', n: 12.5 }, { a: "=HYPERLINK(1)", n: -3 }],
      [
        { header: "Name", value: (r) => r.a },
        { header: "Amount", value: (r) => r.n },
      ],
    );
    expect(csv).toBe('Name,Amount\r\n"Smith, ""Bo""",12.5\r\n\'=HYPERLINK(1),-3\r\n');
  });
});

describe("colorMap", () => {
  it("pins trades to their slot and grays Other", () => {
    const m = colorMap(["Drywall", "Framing", "Unknown trade", "__other"], { trades: true });
    expect(m.get("Framing")).toBe(SERIES[0]);
    expect(m.get("Drywall")).toBe(SERIES[1]);
    expect(m.get("Unknown trade")).toBe(SERIES[2]);
    expect(m.get("__other")).toBe(OTHER_COLOR);
  });
});

import { drill, type DrillSpec } from "../drill";

describe("drill", () => {
  type R = { day: string; trade: string; job: string; h: number };
  const spec: DrillSpec<R> = {
    path: "/app/accounting/payroll",
    title: "Payroll",
    dims: [
      { key: "trade", label: "Trade", plural: "trades", of: (r) => ({ key: r.trade.toLowerCase(), label: r.trade }), trades: true },
      { key: "job", label: "Job", plural: "jobs", of: (r) => ({ key: r.job, label: `Job ${r.job}` }) },
    ],
    value: (r) => r.h,
    dayOf: (r) => r.day,
  };
  const rows: R[] = [
    { day: "2026-10-19", trade: "Framing", job: "8009", h: 8 },
    { day: "2026-10-19", trade: "Drywall", job: "8009", h: 6 },
    { day: "2026-10-20", trade: "Framing", job: "4410", h: 4 },
  ];
  const period = resolvePeriod({ p: "wtd" }, TODAY);

  it("breaks down by the first dimension and links each slice one level deeper", () => {
    const d = drill(spec, rows, period, { p: "wtd" }, { previousRows: [{ day: "2026-10-12", trade: "Framing", job: "8009", h: 9 }] });
    expect(d.total).toBe(18);
    expect(d.change?.pct).toBeCloseTo(1);
    expect(d.breakdown.dim.key).toBe("trade");
    expect(d.breakdown.slices[0]).toMatchObject({ key: "framing", value: 12, href: "/app/accounting/payroll?p=wtd&trade=framing&by=job" });
    expect(d.crumbs).toHaveLength(1);
  });

  it("narrows to a tapped slice, shows the next grouping and grows the breadcrumb", () => {
    const d = drill(spec, rows, period, { p: "wtd", trade: "framing", by: "job" });
    expect(d.total).toBe(12);
    expect(d.breakdown.dim.key).toBe("job");
    expect(d.crumbs.map((c) => c.label)).toEqual(["Payroll", "Framing"]);
    expect(d.filters[0]).toMatchObject({ label: "Framing", clearHref: "/app/accounting/payroll?p=wtd" });
    // A slice keeps its color when the view narrows.
    const all = drill(spec, rows, period, { p: "wtd", by: "job" });
    expect(d.breakdown.slices.find((s) => s.key === "8009")?.color).toBe(all.breakdown.slices.find((s) => s.key === "8009")?.color);
  });

  it("stops linking deeper once every grouping is narrowed", () => {
    const d = drill(spec, rows, period, { p: "wtd", trade: "framing", job: "8009" });
    expect(d.rows).toHaveLength(1);
    expect(d.breakdown.slices[0].href).toBeNull();
  });
});
