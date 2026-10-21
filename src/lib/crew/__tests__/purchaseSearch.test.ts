import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AliasRule } from "../purchases";
import { groupTrips, parseQuery, searchPurchases, type SearchRow } from "../purchaseSearch";

// Finding a purchase (0026), with no database: what the words become (dates
// and months to a date filter, a job's name or alias to that job, the rest
// plain words), how rows become trips, and the switch to close matches when
// full text finds nothing.

const TODAY = "2026-10-19"; // a Monday
const JOBS = [
  { id: "point-loma", name: "Point Loma" },
  { id: "bambi", name: "6402 E Bambi Drive" },
  { id: "gainey-a", name: "Gainey" },
  { id: "gainey-b", name: "Gainey" },
];
const ALIASES: AliasRule[] = [
  { alias: "pt loma", jobId: "point-loma" },
  { alias: "jury steel studs quote 1900982", jobId: null },
];

const parse = (q: string, over: Partial<Parameters<typeof parseQuery>[1]> = {}) => parseQuery(q, { today: TODAY, jobs: JOBS, aliases: ALIASES, ...over });

describe("parseQuery", () => {
  it("keeps plain words, lowercased and without punctuation", () => {
    expect(parse("Drywall screws, 1-5/8\"").words).toEqual(["drywall", "screws", "1", "5", "8"]);
    expect(parse("  UltraLight   ")).toMatchObject({ words: ["ultralight"], from: null, to: null, jobId: null, jobText: null, dateText: null });
    expect(parse("").words).toEqual([]);
  });

  it("reads a month as that month, this year unless it has not come yet", () => {
    expect(parse("august drywall")).toMatchObject({ words: ["drywall"], from: "2026-08-01", to: "2026-08-31", dateText: "august" });
    expect(parse("Oct")).toMatchObject({ words: [], from: "2026-10-01", to: "2026-10-31" });
    // December 2026 is still ahead: December means last year's.
    expect(parse("december")).toMatchObject({ from: "2025-12-01", to: "2025-12-31" });
    expect(parse("sept 2025")).toMatchObject({ from: "2025-09-01", to: "2025-09-30", dateText: "sept 2025" });
  });

  it("reads a day: month and day, m/d, m/d/y, yyyy-mm-dd, and a month as yyyy-mm", () => {
    expect(parse("aug 12 screws")).toMatchObject({ words: ["screws"], from: "2026-08-12", to: "2026-08-12", dateText: "aug 12" });
    expect(parse("august 12th, 2025")).toMatchObject({ from: "2025-08-12", to: "2025-08-12" });
    expect(parse("8/12")).toMatchObject({ from: "2026-08-12", to: "2026-08-12" });
    // 11/30 has not come this year.
    expect(parse("11/30")).toMatchObject({ from: "2025-11-30", to: "2025-11-30" });
    expect(parse("8/12/26")).toMatchObject({ from: "2026-08-12", to: "2026-08-12" });
    expect(parse("8/12/2025")).toMatchObject({ from: "2025-08-12", to: "2025-08-12" });
    expect(parse("2026-08-12")).toMatchObject({ from: "2026-08-12", to: "2026-08-12" });
    expect(parse("2026-08")).toMatchObject({ from: "2026-08-01", to: "2026-08-31" });
    expect(parse("2025")).toMatchObject({ from: "2025-01-01", to: "2025-12-31" });
  });

  it("reads last week, this week, this month, last month, today and yesterday from the Phoenix day", () => {
    expect(parse("last week")).toMatchObject({ from: "2026-10-12", to: "2026-10-18", words: [], dateText: "last week" });
    expect(parse("this week")).toMatchObject({ from: "2026-10-19", to: "2026-10-25" });
    expect(parse("this month")).toMatchObject({ from: "2026-10-01", to: "2026-10-31" });
    expect(parse("last month")).toMatchObject({ from: "2026-09-01", to: "2026-09-30" });
    expect(parse("today")).toMatchObject({ from: TODAY, to: TODAY });
    expect(parse("yesterday")).toMatchObject({ from: "2026-10-18", to: "2026-10-18" });
    expect(parse("last month", { today: "2026-01-10" })).toMatchObject({ from: "2025-12-01", to: "2025-12-31" });
  });

  it("spans two dates from the earlier to the later, and leaves what is not a date alone", () => {
    expect(parse("august september")).toMatchObject({ from: "2026-08-01", to: "2026-09-30", dateText: "august, september" });
    // "may" is a month on its own; 45 is no day of it, so it stays a word.
    expect(parse("may 45")).toMatchObject({ words: ["45"], from: "2026-05-01", to: "2026-05-31" });
    expect(parse("2/30")).toMatchObject({ words: ["2", "30"], from: null });
    expect(parse("13/1")).toMatchObject({ words: ["13", "1"], from: null });
    expect(parse("1001234567").words).toEqual(["1001234567"]);
  });

  it("narrows to a job by its name, its id or a register alias, and takes those words out", () => {
    expect(parse("drywall point loma")).toMatchObject({ words: ["drywall"], jobId: "point-loma", jobText: "point loma" });
    expect(parse("PT LOMA screws")).toMatchObject({ words: ["screws"], jobId: "point-loma", jobText: "pt loma" });
    expect(parse("point-loma")).toMatchObject({ words: [], jobId: "point-loma" });
    expect(parse("6402 E. Bambi Drive august paint")).toMatchObject({ words: ["paint"], jobId: "bambi", from: "2026-08-01" });
    // An alias that means "ignore" names no job; a name two jobs share is nobody's.
    expect(parse("jury steel studs")).toMatchObject({ words: ["jury", "steel", "studs"], jobId: null });
    expect(parse("gainey drywall")).toMatchObject({ words: ["gainey", "drywall"], jobId: null });
    // Only the jobs the caller was given count.
    expect(parse("point loma", { jobs: [], aliases: [] })).toMatchObject({ words: ["point", "loma"], jobId: null });
  });
});

function row(over: Partial<SearchRow> & { sourceKey: string }): SearchRow {
  return {
    tripKey: over.sourceKey.replace(/:[^:]*$/, ""),
    rank: 1,
    totalTrips: 1,
    tripCents: 0,
    tripLines: 1,
    purchasedOn: "2026-08-12",
    store: "674",
    vendor: "Home Depot",
    jobId: "point-loma",
    jobName: "Point Loma",
    jobNameRaw: "PT LOMA",
    trade: "drywall",
    description: "",
    sku: "",
    qty: 1,
    lineTotalCents: 1000,
    matched: true,
    ...over,
  };
}

describe("groupTrips", () => {
  it("rolls rows into trips in the order given, trades biggest first, with the trip's whole total and line count", () => {
    const trips = groupTrips([
      row({ sourceKey: "hd:20260812:674:0:1:1", description: "Drywall 4x8", lineTotalCents: 2400, tripCents: 5000, tripLines: 3, totalTrips: 2 }),
      row({ sourceKey: "hd:20260812:674:0:1:2", description: "Screws", trade: "general", lineTotalCents: 2600, tripCents: 5000, tripLines: 3, totalTrips: 2, matched: false }),
      row({ sourceKey: "hd:20260801:674:0:9:1", description: "Drywall 4x8", purchasedOn: "2026-08-01", jobId: null, jobName: null, jobNameRaw: "GAINEY 45", tripCents: 2400, totalTrips: 2 }),
    ]);
    expect(trips).toEqual([
      {
        tripKey: "hd:20260812:674:0:1",
        purchasedOn: "2026-08-12",
        store: "674",
        vendor: "Home Depot",
        jobId: "point-loma",
        jobName: "Point Loma",
        trades: ["general", "drywall"],
        totalCents: 5000,
        lineCount: 3,
        lines: [
          { description: "Drywall 4x8", sku: "", qty: 1, lineTotalCents: 2400, trade: "drywall", matched: true },
          { description: "Screws", sku: "", qty: 1, lineTotalCents: 2600, trade: "general", matched: false },
        ],
      },
      {
        tripKey: "hd:20260801:674:0:9",
        purchasedOn: "2026-08-01",
        store: "674",
        vendor: "Home Depot",
        jobId: null,
        jobName: "GAINEY 45",
        trades: ["drywall"],
        totalCents: 2400,
        lineCount: 1,
        lines: [{ description: "Drywall 4x8", sku: "", qty: 1, lineTotalCents: 1000, trade: "drywall", matched: true }],
      },
    ]);
    expect(groupTrips([])).toEqual([]);
  });
});

// ---- the read, against a stand-in for purchases_search() -------------------------------------

const { spies } = vi.hoisted(() => ({
  spies: { run: vi.fn(), listAliases: vi.fn(), listJobs: vi.fn() },
}));

vi.mock("../purchaseQueries", () => ({ runPurchaseSearch: spies.run, listAliases: spies.listAliases }));
vi.mock("../queries", () => ({ listJobs: spies.listJobs }));

beforeEach(() => {
  for (const s of Object.values(spies)) s.mockReset();
  spies.listJobs.mockResolvedValue(JOBS.map((j) => ({ ...j, active: true })));
  spies.listAliases.mockResolvedValue(ALIASES);
});

describe("searchPurchases", () => {
  it("asks full text first and keeps what it finds", async () => {
    spies.run.mockResolvedValueOnce([row({ sourceKey: "hd:20260812:674:0:1:1", description: "Drywall 4x8", totalTrips: 7 })]);
    const out = await searchPurchases({ q: "drywall august", jobIds: null, today: TODAY });
    expect(spies.run).toHaveBeenCalledTimes(1);
    expect(spies.run).toHaveBeenCalledWith({ words: ["drywall"], mode: "full-text", jobIds: null, trade: "", from: "2026-08-01", to: "2026-08-31", trips: 50, lines: 40 });
    expect(out.took).toBe("full-text");
    expect(out.total).toBe(7);
    expect(out.trips).toHaveLength(1);
    expect(out.filters).toEqual({ from: "2026-08-01", to: "2026-08-31", jobId: null, jobName: null });
  });

  it("falls back to close matches when full text finds nothing, and says so", async () => {
    spies.run.mockResolvedValueOnce([]).mockResolvedValueOnce([row({ sourceKey: "hd:20260812:674:0:1:1", description: "UltraLight Drywall" })]);
    const out = await searchPurchases({ q: "ultralite drywal", jobIds: null, today: TODAY });
    expect(spies.run).toHaveBeenCalledTimes(2);
    expect(spies.run.mock.calls[0][0]).toMatchObject({ words: ["ultralite", "drywal"], mode: "full-text" });
    expect(spies.run.mock.calls[1][0]).toMatchObject({ words: ["ultralite", "drywal"], mode: "fuzzy" });
    expect(out.took).toBe("fuzzy");
    expect(out.trips[0].lines[0].description).toBe("UltraLight Drywall");
  });

  it("does not try close matches with no words to match (a date or a job alone)", async () => {
    spies.run.mockResolvedValue([]);
    const out = await searchPurchases({ q: "last week", jobIds: null, today: TODAY });
    expect(spies.run).toHaveBeenCalledTimes(1);
    expect(spies.run.mock.calls[0][0]).toMatchObject({ words: [], from: "2026-10-12", to: "2026-10-18" });
    expect(out).toMatchObject({ trips: [], total: 0, took: "full-text" });
  });

  it("keeps a project manager inside his jobs: a job name he is not on is just words, and a pick outside finds nothing", async () => {
    spies.run.mockResolvedValue([]);
    await searchPurchases({ q: "bambi drywall", jobIds: ["point-loma"], today: TODAY });
    expect(spies.run.mock.calls[0][0]).toMatchObject({ words: ["bambi", "drywall"], jobIds: ["point-loma"] });
    await searchPurchases({ q: "pt loma drywall", jobIds: ["point-loma"], today: TODAY });
    expect(spies.run.mock.calls[2][0]).toMatchObject({ words: ["drywall"], jobIds: ["point-loma"] });
    const out = await searchPurchases({ q: "drywall", jobIds: ["point-loma"], jobId: "bambi", today: TODAY });
    expect(spies.run.mock.calls[4][0]).toMatchObject({ jobIds: [] });
    expect(out.filters).toEqual({ from: null, to: null, jobId: null, jobName: null });
  });

  it("takes an owner's typed job, an explicit pick, a trade and explicit dates", async () => {
    spies.run.mockResolvedValue([]);
    const typed = await searchPurchases({ q: "Point Loma screws", jobIds: null, today: TODAY });
    expect(spies.run.mock.calls[0][0]).toMatchObject({ words: ["screws"], jobIds: ["point-loma"] });
    expect(typed.filters).toEqual({ from: null, to: null, jobId: "point-loma", jobName: "Point Loma" });
    await searchPurchases({ q: "screws august", jobIds: null, jobId: "bambi", trade: "framing", from: "2026-09-01", to: "2026-09-03", limit: 10, today: TODAY });
    expect(spies.run.mock.calls[2][0]).toEqual({ words: ["screws"], mode: "full-text", jobIds: ["bambi"], trade: "framing", from: "2026-09-01", to: "2026-09-03", trips: 10, lines: 40 });
    // A trade that is not on the shared list, or a limit out of range, is ignored.
    await searchPurchases({ q: "screws", jobIds: null, trade: "bananas", limit: 900, today: TODAY });
    expect(spies.run.mock.calls[4][0]).toMatchObject({ trade: "", trips: 50 });
    // Any trade on the list filters, not only the chips: HVAC and roofing purchases are searchable.
    await searchPurchases({ q: "screws", jobIds: null, trade: "hvac", today: TODAY });
    expect(spies.run.mock.calls[6][0]).toMatchObject({ trade: "hvac" });
  });
});
