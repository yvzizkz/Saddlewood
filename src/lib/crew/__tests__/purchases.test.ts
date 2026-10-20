import { describe, expect, it } from "vitest";

import {
  SMALL_TRIP_CENTS,
  linkLines,
  lowestUnitPrices,
  materialBlock,
  normalizeJobName,
  purchaseLineSchema,
  purchasesForDay,
  rollTrips,
  tradeFor,
  tripKey,
  type PurchaseLine,
  type PurchaseRow,
} from "../purchases";

// The rules behind Home Depot purchases by job and by trade (0022), with no
// database: what a register name normalizes to, what a trip is, which trade a
// line gets, how a post is linked, and the numbers the money card and the
// Mac's feed carry.

const RULES = [
  { department: "BLDG. MATERIALS", class: "GYPSUM", trade: "drywall" },
  { department: "BLDG. MATERIALS", class: "", trade: "general" },
  { department: "LUMBER", class: "", trade: "framing" },
  { department: "HARDWARE", class: "FASTENERS", trade: "general" },
  { department: "HARDWARE", class: "POWER TOOL ACCESSORIES", trade: "tools" },
  { department: "HARDWARE", class: "HAND TOOLS", trade: "tools" },
  { department: "HARDWARE", class: "", trade: "general" },
  { department: "ELECTRICAL", class: "", trade: "electrical" },
  { department: "PLUMBING", class: "", trade: "plumbing" },
  { department: "PAINT", class: "", trade: "paint" },
  { department: "TOOL RENTAL", class: "", trade: "rentals" },
];

function line(over: Partial<PurchaseLine> & { sourceKey: string }): PurchaseLine {
  return purchaseLineSchema.parse({ source: "hd", purchasedOn: "2026-08-12", lineTotalCents: 1000, ...over });
}

function row(over: Partial<PurchaseRow> & { sourceKey: string }): PurchaseRow {
  return { ...line(over), jobKey: normalizeJobName(over.jobNameRaw ?? ""), jobId: null, trade: "general", ...over };
}

describe("normalizeJobName", () => {
  it("lowercases, drops punctuation and collapses spaces", () => {
    expect(normalizeJobName("PT  LOMA,")).toBe("pt loma");
    expect(normalizeJobName("  Point Loma ")).toBe("point loma");
    expect(normalizeJobName("jury steel studs quote 1900982")).toBe("jury steel studs quote 1900982");
    expect(normalizeJobName("Peña's House")).toBe("pena s house");
    expect(normalizeJobName("")).toBe("");
    expect(normalizeJobName("---")).toBe("");
  });

  it("reads #45 and Unit 45 as the same place", () => {
    const a = normalizeJobName("7425 E Gainey Ranch #45");
    expect(a).toBe("7425 e gainey ranch 45");
    expect(normalizeJobName("7425 E Gainey Ranch Unit 45")).toBe(a);
    expect(normalizeJobName("7425 E GAINEY RANCH, APT 45")).toBe(a);
    // "unit" not followed by a number is a word like any other.
    expect(normalizeJobName("Unit storage")).toBe("unit storage");
  });

  it("keeps two spellings as two keys: each is answered once", () => {
    expect(normalizeJobName("PT LOMA")).not.toBe(normalizeJobName("POINT LOMA"));
  });
});

describe("tripKey", () => {
  it("is everything before the last colon: transaction numbers repeat across stores and days", () => {
    expect(tripKey("hd:20260812:674:0:6220:1")).toBe("hd:20260812:674:0:6220");
    expect(tripKey("hd:20260812:674:0:6220:12")).toBe("hd:20260812:674:0:6220");
    expect(tripKey("hd:20260813:674:0:6220:1")).toBe("hd:20260813:674:0:6220");
    expect(tripKey("app:88:1")).toBe("app:88");
    expect(tripKey("nocolon")).toBe("nocolon");
  });
});

describe("tradeFor", () => {
  it("looks up the class, then the department, else general, whatever the case or spacing", () => {
    expect(tradeFor(RULES, "BLDG. MATERIALS", "GYPSUM")).toBe("drywall");
    expect(tradeFor(RULES, "BLDG. MATERIALS", "INSULATION")).toBe("general");
    expect(tradeFor(RULES, "Lumber", "DIMENSIONAL")).toBe("framing");
    expect(tradeFor(RULES, "HARDWARE", "FASTENERS")).toBe("general");
    expect(tradeFor(RULES, "HARDWARE", "Hand  Tools")).toBe("tools");
    expect(tradeFor(RULES, "HARDWARE", "")).toBe("general");
    expect(tradeFor(RULES, "TOOL RENTAL", "")).toBe("rentals");
    expect(tradeFor(RULES, "GARDEN", "SOIL")).toBe("general");
    expect(tradeFor([], "LUMBER", "")).toBe("general");
    expect(tradeFor([{ department: "LUMBER", class: "", trade: "nonsense" }], "LUMBER", "")).toBe("general");
  });
});

describe("purchaseLineSchema", () => {
  it("trims and clips strings, fills what the Mac leaves out, and refuses a bad row", () => {
    const l = purchaseLineSchema.parse({
      source: "hd",
      sourceKey: " hd:20260812:674:0:6220:1 ",
      purchasedOn: "2026-08-12",
      jobNameRaw: "  PT   LOMA, ",
      description: "x".repeat(300),
      lineTotalCents: 1234,
    });
    expect(l.sourceKey).toBe("hd:20260812:674:0:6220:1");
    expect(l.vendor).toBe("Home Depot");
    expect(l.jobNameRaw).toBe("PT LOMA,");
    expect(l.description).toHaveLength(240);
    expect(l.qty).toBe(0);
    expect(l.meta).toEqual({});
    expect(purchaseLineSchema.safeParse({ source: "lowes", sourceKey: "x", purchasedOn: "2026-08-12", lineTotalCents: 1 }).success).toBe(false);
    expect(purchaseLineSchema.safeParse({ source: "hd", sourceKey: "x", purchasedOn: "8/12/2026", lineTotalCents: 1 }).success).toBe(false);
    expect(purchaseLineSchema.safeParse({ source: "hd", sourceKey: "x", purchasedOn: "2026-08-12", lineTotalCents: 12.5 }).success).toBe(false);
    expect(purchaseLineSchema.safeParse({ source: "hd", sourceKey: "x", purchasedOn: "2026-08-12" }).success).toBe(false);
  });
});

describe("linkLines", () => {
  const ALIASES = [
    { alias: "pt loma", jobId: "point-loma" },
    { alias: "jury steel studs quote 1900982", jobId: null },
  ];

  it("gives each line its key, its job from the aliases and its trade, and tells the Mac what is unmatched", () => {
    const { rows, linked, unmatched } = linkLines(
      [
        line({ sourceKey: "hd:20260812:674:0:6220:1", jobNameRaw: "PT LOMA", department: "LUMBER", lineTotalCents: 5000 }),
        line({ sourceKey: "hd:20260812:674:0:6220:2", jobNameRaw: "Pt  Loma,", department: "BLDG. MATERIALS", class: "GYPSUM", lineTotalCents: 3000 }),
        line({ sourceKey: "hd:20260812:674:0:6221:1", jobNameRaw: "POINT LOMA", department: "PAINT", lineTotalCents: 2000 }),
        line({ sourceKey: "hd:20260813:674:0:6300:1", jobNameRaw: "point loma", lineTotalCents: 1000 }),
        line({ sourceKey: "hd:20260813:674:0:6301:1", jobNameRaw: "Jury steel studs quote 1900982", lineTotalCents: 190000, meta: { ignored: false, note: "quote" } }),
        line({ sourceKey: "hd:20260813:674:0:6302:1", jobNameRaw: "", lineTotalCents: 700 }),
      ],
      ALIASES,
      RULES,
    );
    expect(rows.map((r) => [r.jobKey, r.jobId, r.trade])).toEqual([
      ["pt loma", "point-loma", "framing"],
      ["pt loma", "point-loma", "drywall"],
      ["point loma", null, "paint"],
      ["point loma", null, "general"],
      ["jury steel studs quote 1900982", null, "general"],
      ["", null, "general"],
    ]);
    expect(linked).toBe(2);
    // An alias with no job means ignore: the line is kept, marked, and not asked about.
    expect(rows[4].meta).toEqual({ note: "quote", ignored: true });
    // The Mac cannot mark a line ignored itself.
    expect(rows[2].meta).toEqual({});
    expect(unmatched).toEqual([
      { name: "POINT LOMA", lines: 2, cents: 3000 },
      { name: "", lines: 1, cents: 700 },
    ]);
  });

  it("keeps the last of a source key sent twice, so the upsert never meets a row twice", () => {
    const { rows } = linkLines(
      [line({ sourceKey: "hd:20260812:674:0:6220:1", lineTotalCents: 100 }), line({ sourceKey: "hd:20260812:674:0:6220:1", lineTotalCents: 200 })],
      [],
      RULES,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].lineTotalCents).toBe(200);
  });
});

describe("rollTrips", () => {
  it("counts trips by prefix, small trips under $75, and returns apart from net spend", () => {
    const t = rollTrips([
      { sourceKey: "hd:20260812:674:0:6220:1", lineTotalCents: 5000 },
      { sourceKey: "hd:20260812:674:0:6220:2", lineTotalCents: 3000 }, // same trip: 80.00
      { sourceKey: "hd:20260812:674:0:6221:1", lineTotalCents: 1200 }, // 12.00: small
      { sourceKey: "hd:20260813:674:0:6220:1", lineTotalCents: 2500 }, // same transaction number, another day: another trip, small
      { sourceKey: "hd:20260814:674:0:6400:1", lineTotalCents: -1800 }, // a return: not a small trip
    ]);
    expect(t).toEqual({ trips: 4, smallTrips: 2, spentCents: 9900, returnsCents: 1800 });
    expect(SMALL_TRIP_CENTS).toBe(7500);
    expect(rollTrips([])).toEqual({ trips: 0, smallTrips: 0, spentCents: 0, returnsCents: 0 });
  });
});

describe("materialBlock", () => {
  it("rolls the last twelve months by trade, biggest first, and leaves older lines out", () => {
    const m = materialBlock(
      [
        { sourceKey: "hd:20260812:674:0:1:1", lineTotalCents: 50000, trade: "framing", purchasedOn: "2026-08-12" },
        { sourceKey: "hd:20260812:674:0:1:2", lineTotalCents: 20000, trade: "drywall", purchasedOn: "2026-08-12" },
        { sourceKey: "hd:20260901:674:0:2:1", lineTotalCents: 3000, trade: "", purchasedOn: "2026-09-01" },
        { sourceKey: "hd:20260901:674:0:2:2", lineTotalCents: -500, trade: "framing", purchasedOn: "2026-09-01" },
        { sourceKey: "hd:20251001:674:0:3:1", lineTotalCents: 99900, trade: "paint", purchasedOn: "2025-10-01" }, // over a year ago
        { sourceKey: "hd:20261101:674:0:4:1", lineTotalCents: 99900, trade: "paint", purchasedOn: "2026-11-01" }, // not yet
      ],
      "2026-10-19",
    );
    expect(m.since).toBe("2025-10-19");
    expect(m.trips).toBe(2);
    expect(m.smallTrips).toBe(1);
    expect(m.spentCents).toBe(72500);
    expect(m.returnsCents).toBe(500);
    expect(m.byTrade).toEqual([
      { trade: "framing", cents: 49500 },
      { trade: "drywall", cents: 20000 },
      { trade: "general", cents: 3000 },
    ]);
    expect(m.lastOn).toBe("2026-09-01");
    expect(materialBlock([], "2026-10-19")).toMatchObject({ trips: 0, spentCents: 0, byTrade: [], lastOn: null });
  });
});

describe("the Mac's day feed", () => {
  it("finds the lowest unit price per sku, earliest day on a tie", () => {
    const lows = lowestUnitPrices([
      { sku: "1001", qty: 10, lineTotalCents: 5000, purchasedOn: "2026-08-01" }, // 5.00
      { sku: "1001", qty: 2, lineTotalCents: 800, purchasedOn: "2026-08-10" }, // 4.00
      { sku: "1001", qty: 1, lineTotalCents: 400, purchasedOn: "2026-08-20" }, // 4.00 again, later
      { sku: "1001", qty: -1, lineTotalCents: -400, purchasedOn: "2026-08-21" }, // a return: not a price
      { sku: "", qty: 1, lineTotalCents: 100, purchasedOn: "2026-08-21" },
      { sku: "2002", qty: 0, lineTotalCents: 100, purchasedOn: "2026-08-21" },
    ]);
    expect([...lows.entries()]).toEqual([["1001", { cents: 400, on: "2026-08-10" }]]);
  });

  it("groups the day by job, names unlinked lines by what was typed, and flags a price over 20% above the recent low", () => {
    const jobs = [{ id: "point-loma", name: "Point Loma" }];
    const lows = new Map([
      ["1001", { cents: 400, on: "2026-08-10" }],
      ["3003", { cents: 1000, on: "2026-07-30" }],
    ]);
    const out = purchasesForDay(
      [
        row({ sourceKey: "hd:20260812:674:0:1:1", jobId: "point-loma", jobNameRaw: "PT LOMA", sku: "1001", qty: 5, lineTotalCents: 2500, description: "Screws" }), // 5.00 vs 4.00: +25%
        row({ sourceKey: "hd:20260812:674:0:1:2", jobId: "point-loma", jobNameRaw: "PT LOMA", sku: "3003", qty: 2, lineTotalCents: 2400, description: "Mud" }), // 12.00 vs 10.00: +20%, not over
        row({ sourceKey: "hd:20260812:674:0:1:3", jobId: "point-loma", jobNameRaw: "PT LOMA", sku: "9999", qty: 1, lineTotalCents: 300, description: "New thing" }), // no history
        row({ sourceKey: "hd:20260812:674:0:2:1", jobId: "point-loma", jobNameRaw: "Point Loma", sku: "", qty: 1, lineTotalCents: -300, description: "Returned" }),
        row({ sourceKey: "hd:20260812:674:0:3:1", jobNameRaw: "Gainey #45", sku: "1001", qty: 1, lineTotalCents: 600, description: "Screws" }), // unlinked, 6.00: +50%
      ],
      lows,
      jobs,
    );
    expect(out).toEqual([
      {
        jobId: "point-loma",
        jobName: "Point Loma",
        trips: 2,
        smallTrips: 1,
        spentCents: 4900,
        returnsCents: 300,
        flags: [{ description: "Screws", sku: "1001", paidCents: 500, lowCents: 400, lowOn: "2026-08-10" }],
      },
      {
        jobId: "",
        jobName: "Gainey #45",
        trips: 1,
        smallTrips: 1,
        spentCents: 600,
        returnsCents: 0,
        flags: [{ description: "Screws", sku: "1001", paidCents: 600, lowCents: 400, lowOn: "2026-08-10" }],
      },
    ]);
    expect(purchasesForDay([], lows, jobs)).toEqual([]);
  });
});
