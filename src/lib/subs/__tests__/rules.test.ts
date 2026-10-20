import { describe, expect, it } from "vitest";

import { parsePolicyValue, POLICY_DEFAULTS } from "@/lib/policies/rules";
import { recipientsFor } from "../mail";
import { addBusinessDays, bidLinesFor, canAward, coiDaysLeft, defaultDue, level, ourCostCents, readiness } from "../rules";
import { isOpenForBids, publicPackage, type BidPackage, type PackageLine } from "../types";
import { readBid } from "../validate";

const LINES: PackageLine[] = [
  { id: "a", description: "Batts R-19 walls", qty: 2400, unit: "sf", note: "", ourCents: 300_000 },
  { id: "b", description: "Blown R-38 attic", qty: 1800, unit: "sf", note: "", ourCents: 250_000 },
  { id: "c", description: "Sound batts, interior", qty: 600, unit: "sf", note: "", ourCents: 90_000 },
  { id: "d", description: "Fire caulk", qty: null, unit: "", note: "", ourCents: null },
];

describe("the leveling sheet", () => {
  it("ranks on our scope at their price plus our cost of their gaps, never on their total", () => {
    const lv = level(LINES, [
      // Cheapest total, but leaves out the attic and the sound batts.
      { inviteId: "cheap", lines: [{ lineId: "a", cents: 280_000, note: "" }, { lineId: "b", cents: null, note: "" }, { lineId: "c", cents: null, note: "" }, { lineId: "d", cents: 10_000, note: "" }], addCents: 0 },
      // Prices everything.
      { inviteId: "full", lines: [{ lineId: "a", cents: 310_000, note: "" }, { lineId: "b", cents: 240_000, note: "" }, { lineId: "c", cents: 95_000, note: "" }, { lineId: "d", cents: 12_000, note: "" }], addCents: 0 },
    ]);
    expect(lv.budgetCents).toBe(640_000);
    expect(lv.linesWithoutCost).toEqual(["d"]);
    const cheap = lv.bids.find((b) => b.inviteId === "cheap")!;
    const full = lv.bids.find((b) => b.inviteId === "full")!;
    expect(cheap).toMatchObject({ headlineCents: 290_000, pluggedCents: 340_000, leveledCents: 630_000, unpriced: [] });
    expect(full).toMatchObject({ headlineCents: 657_000, pluggedCents: 0, leveledCents: 657_000 });
    expect(lv.lowestHeadline).toBe("cheap");
    expect(lv.lowestLeveled).toBe("cheap");
    expect(cheap.rank).toBe(1);
  });

  it("adds what the office enters for a bid's exclusions, and counts a gap with no cost of ours as unpriced", () => {
    const lv = level(LINES, [
      { inviteId: "x", lines: [{ lineId: "a", cents: 300_000, note: "" }, { lineId: "b", cents: 250_000, note: "" }, { lineId: "c", cents: 90_000, note: "" }, { lineId: "d", cents: null, note: "" }], addCents: 50_000 },
      { inviteId: "y", lines: [{ lineId: "a", cents: 330_000, note: "" }, { lineId: "b", cents: 250_000, note: "" }, { lineId: "c", cents: 90_000, note: "" }, { lineId: "d", cents: 5_000, note: "" }], addCents: 0 },
    ]);
    const x = lv.bids.find((b) => b.inviteId === "x")!;
    expect(x).toMatchObject({ leveledCents: 690_000, unpriced: ["d"], addCents: 50_000 });
    expect(lv.lowestLeveled).toBe("y");
  });

  it("treats a line added by an addendum after a bid as not priced in it", () => {
    const lv = level([...LINES, { id: "e", description: "Garage ceiling", qty: 400, unit: "sf", note: "", ourCents: 60_000 }], [
      { inviteId: "old", lines: [{ lineId: "a", cents: 300_000, note: "" }, { lineId: "b", cents: 250_000, note: "" }, { lineId: "c", cents: 90_000, note: "" }, { lineId: "d", cents: 0, note: "" }], addCents: 0 },
    ]);
    expect(lv.bids[0].plugs).toEqual([{ lineId: "e", cents: 60_000 }]);
  });
});

describe("a sub's bid", () => {
  it("keeps one line per package line, works out the total itself, and needs one priced line", () => {
    const r = bidLinesFor(LINES, [
      { lineId: "a", cents: 100 },
      { lineId: "zzz", cents: 999_999 },
      { lineId: "c", cents: null },
    ]);
    expect(r).toEqual({
      lines: [
        { lineId: "a", cents: 100, note: "" },
        { lineId: "b", cents: null, note: "" },
        { lineId: "c", cents: null, note: "" },
        { lineId: "d", cents: null, note: "" },
      ],
      totalCents: 100,
    });
    expect(bidLinesFor(LINES, [])).toEqual({ error: "price at least one line" });
    expect(bidLinesFor(LINES, [{ lineId: "a", cents: 1.5 }])).toHaveProperty("error");
  });

  it("is read strictly, with the signature checked like a client's", () => {
    expect(readBid({ lines: [], signature: { name: "Al", method: "type", typed: "Al", font: "dancing", image: "x", agree: true } })).toMatchObject({ ok: false });
    expect(readBid({ lines: [], signature: { name: "Al Ruiz", method: "draw", image: "data:image/png;base64,AAAA", agree: true } })).toMatchObject({ ok: false, error: expect.stringMatching(/sign again/) });
  });
});

describe("what a sub sees", () => {
  const pkg: BidPackage = {
    id: "p",
    jobId: "j",
    opportunityId: null,
    trade: "insulation",
    title: "Insulation: 7120 E Patrick Ln",
    scope: "",
    lines: LINES,
    exclusions: [],
    files: [{ id: "f", name: "A-201.pdf", path: "p/p/x-A-201.pdf", size: 2048, type: "application/pdf", at: "", by: "Lando" }],
    workFrom: null,
    workTo: null,
    siteWalk: "",
    dueAt: "2026-10-24T00:00:00.000Z",
    terms: "",
    status: "out",
    awardedInviteId: null,
    awardedAt: null,
    awardedBy: "",
    createdBy: "Lando",
    createdAt: "",
    updatedAt: "",
  };

  it("never carries our cost, a storage path, or who uploaded", () => {
    const p = publicPackage(pkg, { name: "7120 E Patrick Ln", address: "" }, [], new Date("2026-10-20T00:00:00Z"));
    const json = JSON.stringify(p);
    expect(json).not.toMatch(/ourCents|300000|p\/p\/|Lando/);
    expect(p.open).toBe(true);
  });

  it("is open for bids while out and before the due time", () => {
    expect(isOpenForBids(pkg, new Date("2026-10-23T23:59:59Z"))).toBe(true);
    expect(isOpenForBids(pkg, new Date("2026-10-24T00:00:01Z"))).toBe(false);
    expect(isOpenForBids({ ...pkg, status: "closed" }, new Date("2026-10-20T00:00:00Z"))).toBe(false);
    expect(isOpenForBids({ ...pkg, dueAt: null }, new Date("2030-01-01T00:00:00Z"))).toBe(true);
  });
});

describe("onboarding and the award", () => {
  const ready = { status: "approved" as const, coiExpiresOn: "2027-01-01", w9OnFile: true, msaSignedOn: "2026-01-01", rocVerifiedAt: "2026-01-01T00:00:00Z", achConfirmedAt: "2026-01-01T00:00:00Z" };

  it("lists what stands between a sub and a start (SOP-008 rule 1)", () => {
    expect(readiness(ready, "2026-10-19")).toEqual({ ready: true, missing: [] });
    expect(readiness({ ...ready, coiExpiresOn: "2026-10-01", w9OnFile: false, status: "prospect" }, "2026-10-19").missing).toEqual([
      "not approved yet",
      "insurance expired 2026-10-01",
      "no W-9",
    ]);
    expect(coiDaysLeft("2026-10-29", "2026-10-19")).toBe(10);
    expect(coiDaysLeft(null, "2026-10-19")).toBeNull();
  });

  it("lets the PM award an approved sub inside budget up to the policy limit; anything else is an owner's", () => {
    const base = { subStatus: "approved" as const, leveledCents: 800_000, budgetCents: 900_000, bids: 3, packageCents: 900_000 };
    expect(canAward("member", true, base, POLICY_DEFAULTS)).toEqual({ ok: true, warnings: [] });
    expect(canAward("member", false, base, POLICY_DEFAULTS)).toEqual({ ok: false, reason: "An owner awards this." });
    expect(canAward("member", true, { ...base, leveledCents: 950_000 }, POLICY_DEFAULTS)).toMatchObject({ ok: false, reason: expect.stringMatching(/over our budget/) });
    expect(canAward("member", true, { ...base, leveledCents: 1_200_000, budgetCents: 1_500_000 }, POLICY_DEFAULTS)).toMatchObject({ ok: false, reason: expect.stringMatching(/over \$10,000/) });
    expect(canAward("member", true, { ...base, subStatus: "onboarding" }, POLICY_DEFAULTS)).toMatchObject({ ok: false });
    // Too few bids is a warning the PM may pass over, and is kept with the award.
    expect(canAward("member", true, { ...base, bids: 1 }, POLICY_DEFAULTS)).toEqual({ ok: true, warnings: ["it has 1 bid; the rule is 3"] });
    // An owner may award past every rule; what they pass over is named.
    expect(canAward("owner", false, { ...base, subStatus: "prospect", leveledCents: 2_000_000 }, POLICY_DEFAULTS)).toMatchObject({ ok: true, warnings: expect.arrayContaining(["the sub is not approved yet", "the leveled price is over our budget"]) });
    expect(canAward("member", true, { ...base, leveledCents: 1_200_000, budgetCents: 1_500_000 }, { ...POLICY_DEFAULTS, "policy.subs.pmAwardLimitCents": 2_000_000 })).toMatchObject({ ok: true });
  });

  it("keeps the bid count a whole number in Company policies", () => {
    expect(parsePolicyValue("policy.subs.minBids", 3)).toBe(3);
    expect(parsePolicyValue("policy.subs.minBids", 2.5)).toBeNull();
    expect(parsePolicyValue("policy.subs.minBids", 11)).toBeNull();
  });
});

describe("dates", () => {
  it("counts business days and dues at 5 PM Phoenix", () => {
    expect(addBusinessDays("2026-10-19", 5)).toBe("2026-10-26");
    expect(addBusinessDays("2026-10-23", 1)).toBe("2026-10-26");
    expect(defaultDue("2026-10-19", POLICY_DEFAULTS)).toBe("2026-10-27T00:00:00.000Z");
  });

  it("prices our cost without the sub markup or the hidden uplift", () => {
    expect(ourCostCents({ material: 100, waste: 10, tax: 5, labor: 50, sub: 200, equipment: 0, allowance: 0, other: 1.234 })).toBe(36_623);
  });
});

describe("who each mail goes to", () => {
  const inv = [
    { id: "1", status: "invited" as const, sentAt: null },
    { id: "2", status: "invited" as const, sentAt: "x" },
    { id: "3", status: "submitted" as const, sentAt: "x" },
    { id: "4", status: "declined" as const, sentAt: "x" },
    { id: "5", status: "not_awarded" as const, sentAt: "x" },
  ];
  it("invites the ones not sent, tells the live ones about an addendum, thanks the ones not chosen", () => {
    expect(recipientsFor("invite", inv)).toEqual(["1"]);
    expect(recipientsFor("addendum", inv)).toEqual(["2", "3"]);
    expect(recipientsFor("thanks", inv)).toEqual(["5"]);
  });
});
