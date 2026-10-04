import { describe, expect, it } from "vitest";

import {
  addDays,
  clock12,
  clockText,
  dayLabel,
  dayShort,
  hoursDecimal,
  hoursText,
  isClock,
  isDay,
  localClock,
  localDay,
  localInstant,
  weekDays,
  weekStart,
  workedMinutes,
} from "../time";

// Everything on the crew side is Phoenix time (UTC-7, no daylight saving),
// whatever clock the server or the phone keeps.

describe("the day a moment belongs to", () => {
  it("is the Phoenix calendar day, not the server's", () => {
    // 6:00 PM in Phoenix on the 5th is already 1:00 AM on the 6th in UTC.
    expect(localDay("2026-10-06T01:00:00Z")).toBe("2026-10-05");
    expect(localDay("2026-10-06T06:59:59Z")).toBe("2026-10-05");
    expect(localDay("2026-10-06T07:00:00Z")).toBe("2026-10-06");
  });

  it("reads the Phoenix wall clock", () => {
    expect(localClock("2026-10-05T13:02:00Z")).toBe("06:02");
    expect(localClock("2026-10-06T07:05:00Z")).toBe("00:05");
    expect(clock12("2026-10-05T13:02:00Z")).toBe("6:02 AM");
    expect(clock12("2026-10-05T19:00:00Z")).toBe("12:00 PM");
    expect(clock12("2026-10-06T07:05:00Z")).toBe("12:05 AM");
    expect(clock12(null)).toBe("");
    expect(clockText("06:00")).toBe("6:00 AM");
    expect(clockText("17:30")).toBe("5:30 PM");
  });

  it("turns a Phoenix day and time back into the same instant", () => {
    expect(localInstant("2026-10-05", "06:02").toISOString()).toBe("2026-10-05T13:02:00.000Z");
    // the same in January: Arizona does not change its clocks
    expect(localInstant("2026-01-15", "06:02").toISOString()).toBe("2026-01-15T13:02:00.000Z");
  });

  it("knows a day and a clock time when it sees one", () => {
    expect(isDay("2026-10-05")).toBe(true);
    expect(isDay("2026-13-05")).toBe(false);
    expect(isDay("10/05/2026")).toBe(false);
    expect(isClock("06:00")).toBe(true);
    expect(isClock("6:00")).toBe(false);
    expect(isClock("24:00")).toBe(false);
  });
});

describe("the week on a timesheet", () => {
  it("runs Monday to Sunday", () => {
    expect(weekStart("2026-10-05")).toBe("2026-10-05"); // a Monday
    expect(weekStart("2026-10-08")).toBe("2026-10-05");
    expect(weekStart("2026-10-11")).toBe("2026-10-05"); // Sunday belongs to the week before it ends
    expect(weekStart("2026-10-12")).toBe("2026-10-12");
    expect(weekDays("2026-10-05")).toEqual(["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"]);
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("hours", () => {
  const shift = { startedAt: "2026-10-05T13:02:00Z", endedAt: "2026-10-05T21:32:00Z", breakMin: 30 };

  it("is time on the clock less the unpaid break", () => {
    expect(workedMinutes(shift)).toBe(480);
    expect(hoursText(480)).toBe("8 h");
    expect(hoursText(450)).toBe("7 h 30 min");
    expect(hoursText(45)).toBe("45 min");
    expect(hoursDecimal(450)).toBe("7.50");
  });

  it("counts an open shift up to now, with no break taken off yet", () => {
    expect(workedMinutes({ ...shift, endedAt: null }, "2026-10-05T15:02:00Z")).toBe(120);
  });

  it("is never negative", () => {
    expect(workedMinutes({ startedAt: "2026-10-05T13:00:00Z", endedAt: "2026-10-05T13:10:00Z", breakMin: 30 })).toBe(0);
    expect(workedMinutes({ startedAt: "garbage", endedAt: null, breakMin: 0 })).toBe(0);
  });
});

describe("how a day is named", () => {
  it("says today, tomorrow, yesterday, then the date", () => {
    expect(dayLabel("2026-10-05", "2026-10-05")).toBe("Today");
    expect(dayLabel("2026-10-06", "2026-10-05")).toBe("Tomorrow");
    expect(dayLabel("2026-10-04", "2026-10-05")).toBe("Yesterday");
    expect(dayLabel("2026-10-08", "2026-10-05")).toBe("Thu, Oct 8");
    expect(dayLabel("2026-10-06", "2026-10-05", "es")).toBe("Mañana");
    expect(dayShort("2026-10-08", "es")).toBe("jue 8 oct");
  });
});
