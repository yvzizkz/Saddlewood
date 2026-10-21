import { describe, expect, it } from "vitest";

import { counts, coverChanges, isHomeDepot, matchReceiptsToTrips, type DedupeLine } from "../receiptDedupe";

const hd = (key: string, day: string, cents: number, jobId: string | null = null): DedupeLine => ({
  source: "hd", sourceKey: key, purchasedOn: day, vendor: "Home Depot", lineTotalCents: cents, jobId, meta: {},
});
const app = (n: number, day: string, cents: number, vendor = "Home Depot", jobId: string | null = "powell", meta: Record<string, unknown> = {}): DedupeLine => ({
  source: "app", sourceKey: `app:${n}`, purchasedOn: day, vendor, lineTotalCents: cents, jobId, meta,
});

describe("matchReceiptsToTrips", () => {
  it("matches a filed receipt to the Pro Xtra trip it duplicates (pre-tax lines, tax-in receipt)", () => {
    const lines = [
      hd("hd:20261012:674:0:6220:1", "2026-10-12", 10_000),
      hd("hd:20261012:674:0:6220:2", "2026-10-12", 5_000),
      app(41, "2026-10-12", 16_245), // 15,000 + 8.3%
    ];
    expect(matchReceiptsToTrips(lines)).toEqual([{ appKey: "app:41", tripKey: "hd:20261012:674:0:6220", jobId: "powell" }]);
  });

  it("leaves a receipt alone on another day, from another store, or outside the tax band", () => {
    const lines = [
      hd("hd:20261012:674:0:6220:1", "2026-10-12", 10_000),
      app(1, "2026-10-13", 10_830), // other day
      app(2, "2026-10-12", 10_830, "Lowe's"), // other store
      app(3, "2026-10-12", 12_000), // 20% over
      app(4, "2026-10-12", 9_000), // under the pre-tax total
    ];
    expect(matchReceiptsToTrips(lines)).toEqual([]);
  });

  it("pairs two trips and two receipts on one day one-to-one, closest first", () => {
    const lines = [
      hd("hd:20261012:674:0:1:1", "2026-10-12", 10_000),
      hd("hd:20261012:674:0:2:1", "2026-10-12", 10_400),
      app(7, "2026-10-12", 10_830), // fits both; closest to 10,000 * 1.083
      app(8, "2026-10-12", 11_260), // fits only the second
    ];
    expect(matchReceiptsToTrips(lines)).toEqual([
      { appKey: "app:7", tripKey: "hd:20261012:674:0:1", jobId: "powell" },
      { appKey: "app:8", tripKey: "hd:20261012:674:0:2", jobId: "powell" },
    ]);
  });

  it("one trip covers one receipt: a second identical receipt stays counted", () => {
    const lines = [hd("hd:20261012:674:0:6220:1", "2026-10-12", 10_000), app(1, "2026-10-12", 10_830), app(2, "2026-10-12", 10_830)];
    expect(matchReceiptsToTrips(lines)).toHaveLength(1);
  });

  it("knows Home Depot by name", () => {
    expect(["Home Depot", "THE HOME DEPOT #674", "homedepot", "HD"].every(isHomeDepot)).toBe(true);
    expect(["Lowe's", "Ace Hardware", "a store", "HD Supply"].some(isHomeDepot)).toBe(false);
  });
});

describe("coverChanges and counts", () => {
  it("marks new matches, clears a mark that no longer holds, and leaves settled ones", () => {
    const lines = [
      app(1, "2026-10-12", 10_830),
      app(2, "2026-10-12", 5_000, "Home Depot", "powell", { coveredBy: "hd:20261012:674:0:9" }),
      app(3, "2026-10-12", 7_000, "Home Depot", "powell", { coveredBy: "hd:20261012:674:0:5" }),
    ];
    const matches = [
      { appKey: "app:1", tripKey: "hd:20261012:674:0:6220", jobId: "powell" },
      { appKey: "app:3", tripKey: "hd:20261012:674:0:5", jobId: "powell" },
    ];
    expect(coverChanges(lines, matches)).toEqual({ set: [matches[0]], clear: ["app:2"] });
    expect(counts({})).toBe(true);
    expect(counts({ coveredBy: "hd:20261012:674:0:5" })).toBe(false);
  });
});
