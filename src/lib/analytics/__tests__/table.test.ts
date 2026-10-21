import { describe, expect, it } from "vitest";

import { exportValue, formatValue } from "../format";
import { filterRows, sortRows, type TableRow } from "../table";

const rows: TableRow[] = [
  { id: "1", person: "José Ramírez", job: "8009 Powell", trade: "Framing", minutes: 480 },
  { id: "2", person: "Ana Torres", job: "4410 Bambi", trade: "Drywall", minutes: 300 },
  { id: "3", person: "Bo Smith", job: "8009 Powell", trade: "", minutes: null },
];

describe("filterRows", () => {
  it("matches every word, accent-blind, across the search fields", () => {
    expect(filterRows(rows, { q: "jose powell", searchKeys: ["person", "job"], filters: {} }).map((r) => r.id)).toEqual(["1"]);
    expect(filterRows(rows, { q: "", searchKeys: ["person"], filters: { job: "8009 Powell" } }).map((r) => r.id)).toEqual(["1", "3"]);
  });
});

describe("sortRows", () => {
  it("sorts numbers and sinks blanks either way", () => {
    expect(sortRows(rows, "minutes", "desc", "hours").map((r) => r.id)).toEqual(["1", "2", "3"]);
    expect(sortRows(rows, "minutes", "asc", "hours").map((r) => r.id)).toEqual(["2", "1", "3"]);
    expect(sortRows(rows, "trade", "asc", "text").map((r) => r.id)).toEqual(["2", "1", "3"]);
  });
});

describe("format", () => {
  it("reads cents, minutes and days", () => {
    expect(formatValue("money", 123456)).toBe("$1,234.56");
    expect(formatValue("money", 1_250_000_00, { compact: true })).toBe("$1.3M");
    expect(formatValue("hours", 450)).toBe("7.5 h");
    expect(formatValue("date", "2019-10-20")).toBe("Oct 20, 2019");
    expect(formatValue("date", `${new Date().getFullYear()}-03-04`)).toBe("Mar 4");
    expect(formatValue("hours", null)).toBe("–");
  });

  it("exports dollars and decimal hours as numbers", () => {
    expect(exportValue("money", 123456)).toBe(1234.56);
    expect(exportValue("hours", 450)).toBe(7.5);
    expect(exportValue("text", null)).toBeNull();
  });
});
