import { describe, expect, it } from "vitest";

import { lineSells, priceEstimate, rollup, roundUp, sectionSells, upliftFactor } from "../calc";
import { DEFAULT_PRICING, newEstimateBody } from "../templates";
import type { EstimateBody, EstimateItem, Pricing } from "../types";

function item(over: Partial<EstimateItem>): EstimateItem {
  return { id: over.id ?? Math.random().toString(36).slice(2), description: "x", kind: "other", qty: 1, unit: "LS", mat: 0, wastePct: 0, hrs: 0, lab: 0, cost: 0, ...over };
}

const P: Pricing = { ...DEFAULT_PRICING };

describe("rollup", () => {
  it("prices Patrick Lane to the cent the pipeline sent ($173,100.48)", () => {
    // estimate-summary.md (2026-10-12): material 43,829.96 + 10% waste, labor 45,598.34,
    // GCs 29,566.70, allowances 8,096.07; 5 / 15 / 10.
    const r = rollup(
      [
        item({ kind: "material", mat: 43829.96, wastePct: 10 }),
        item({ kind: "labor", lab: 45598.34 }),
        item({ kind: "other", cost: 29566.7 }),
        item({ kind: "allowance", cost: 8096.07 }),
      ],
      P,
    );
    expect(r.material).toBe(4382996);
    expect(r.waste).toBe(438300);
    expect(r.direct).toBe(13147407);
    expect(r.contingency).toBe(616890);
    expect(r.overhead).toBe(1972111);
    expect(r.sell).toBe(17310048);
    // The parts the office sees add up to what the client sees.
    expect(r.direct + r.contingency + r.overhead + r.profit + r.rounding).toBe(r.sell);
  });

  it("gives an allowance overhead and profit but no contingency (x1.265)", () => {
    const r = rollup([item({ kind: "allowance", cost: 1000 })], P);
    expect(r.contingency).toBe(0);
    expect(r.sell).toBe(126500);
  });

  it("puts the GC markup on a sub's price before the cascade", () => {
    const r = rollup([item({ kind: "sub", cost: 1000 })], P);
    expect(r.subMarkup).toBe(10000);
    expect(r.direct).toBe(110000);
    expect(r.sell).toBe(Math.round(1100 * 1.2 * 1.1 * 100));
  });

  it("prices labor by hours at the loaded rate, or by the piece", () => {
    expect(rollup([item({ kind: "labor", qty: 10, hrs: 2 })], P).labor).toBe(Math.round(20 * 45.03 * 100));
    expect(rollup([item({ kind: "labor", qty: 10, hrs: 2 })], P).laborHours).toBe(20);
    expect(rollup([item({ kind: "labor", qty: 10, lab: 5 })], P).labor).toBe(5000);
    expect(rollup([item({ kind: "labor", qty: 10, hrs: 1, rate: 60 })], P).labor).toBe(60000);
  });

  it("an installed line carries material, waste and labor", () => {
    const r = rollup([item({ kind: "installed", qty: 100, mat: 2, wastePct: 10, hrs: 0.1 })], P);
    expect(r.material).toBe(20000);
    expect(r.waste).toBe(2000);
    expect(r.labor).toBe(Math.round(10 * 45.03 * 100));
  });

  it("holds the target margin with a hidden uplift while showing lean markup", () => {
    const lean: Pricing = { ...P, overheadPct: 7, profitPct: 7, targetOverheadPct: 15, targetProfitPct: 10 };
    expect(upliftFactor(lean)).toBeCloseTo((1.15 * 1.1) / (1.07 * 1.07), 10);
    const r = rollup([item({ kind: "labor", lab: 10000 })], lean);
    expect(r.uplift).toBeGreaterThan(0);
    expect(r.cost).toBe(1000000);
    // Overhead and profit on the face are the lean ones; the price recovers the target.
    const target = rollup([item({ kind: "labor", lab: 10000 })], { ...P, contingencyPct: 0 });
    const leanNoCont = rollup([item({ kind: "labor", lab: 10000 })], { ...lean, contingencyPct: 0 });
    expect(Math.abs(leanNoCont.sell - target.sell)).toBeLessThanOrEqual(1);
  });

  it("rounds the sell price up to the step and says how much", () => {
    expect(roundUp(1234501, 100)).toBe(1240000);
    expect(roundUp(1234501, 0)).toBe(1234501);
    const r = rollup([item({ kind: "other", cost: 1000 })], { ...P, roundTo: 50 });
    expect(r.sell % 5000).toBe(0);
    expect(r.rounding).toBeGreaterThanOrEqual(0);
  });

  it("has a margin of (sell - cost) / sell", () => {
    const r = rollup([item({ kind: "other", cost: 1000 })], P);
    expect(r.marginPct).toBeCloseTo(((r.sell - r.cost) / r.sell) * 100, 10);
  });
});

describe("packages, add-ons and line prices", () => {
  function body(): EstimateBody {
    const b = newEstimateBody("blank", "Kitchen");
    b.packages = [
      { id: "ess", name: "Essential" },
      { id: "sig", name: "Signature", recommended: true },
    ];
    b.sections = [
      {
        id: "s1",
        name: "Cabinets",
        items: [
          item({ id: "a", kind: "labor", lab: 1000 }),
          item({ id: "b", kind: "allowance", cost: 5000, packages: ["ess"] }),
          item({ id: "c", kind: "allowance", cost: 9000, packages: ["sig"] }),
        ],
      },
      { id: "s2", name: "Extras", items: [item({ id: "d", kind: "sub", cost: 2000, optional: true })] },
    ];
    return b;
  }

  it("prices each package from its own lines and keeps add-ons out of the base", () => {
    const p = priceEstimate(body());
    expect(p.packages.ess.sell).toBe(rollup([item({ kind: "labor", lab: 1000 }), item({ kind: "allowance", cost: 5000 })], P).sell);
    expect(p.packages.sig.sell).toBeGreaterThan(p.packages.ess.sell);
    expect(p.primary).toBe(p.packages.sig);
    expect(p.options.d.sell).toBe(rollup([item({ kind: "sub", cost: 2000 })], P).sell);
  });

  it("splits a package's price over its lines to the exact cent", () => {
    const b = body();
    const p = priceEstimate(b);
    for (const id of ["ess", "sig"]) {
      const sections = sectionSells(b, id, p.packages[id].sell);
      expect([...sections.values()].reduce((a, v) => a + v, 0)).toBe(p.packages[id].sell);
    }
    const awkward = [1, 2, 3].map((i) => item({ id: `x${i}`, kind: "other", cost: 333.33 }));
    const total = rollup(awkward, P).sell;
    const split = lineSells(awkward, P, total);
    expect([...split.values()].reduce((a, v) => a + v, 0)).toBe(total);
  });
});

describe("profitForTarget", () => {
  it("finds the profit percent that hits a price", async () => {
    const { profitForTarget } = await import("../calc");
    const b = newEstimateBody("blank", "x");
    b.sections = [{ id: "s", name: "s", items: [item({ kind: "other", cost: 10000 })] }];
    const pct = profitForTarget(b, 1500000)!;
    b.pricing.profitPct = pct;
    expect(Math.abs(priceEstimate(b).primary.sell - 1500000)).toBeLessThanOrEqual(150);
    expect(profitForTarget(b, 100)).toBeNull();
  });
});
