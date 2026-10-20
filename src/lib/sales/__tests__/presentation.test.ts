import { describe, expect, it } from "vitest";

import { priceEstimate } from "../calc";
import { runChecks } from "../checks";
import { acceptedTotal, buildProposal, scheduleAmounts } from "../presentation";
import { newEstimateBody } from "../templates";
import type { EstimateBody, EstimateItem } from "../types";

function item(over: Partial<EstimateItem>): EstimateItem {
  return { id: over.id ?? Math.random().toString(36).slice(2), description: "x", kind: "other", qty: 1, unit: "LS", mat: 0, wastePct: 0, hrs: 0, lab: 0, cost: 0, ...over };
}

function kitchen(): EstimateBody {
  const b = newEstimateBody("blank", "Kitchen remodel");
  b.packages = [
    { id: "ess", name: "Essential", highlights: ["Shaker cabinets"] },
    { id: "sig", name: "Signature", recommended: true },
  ];
  b.sections = [
    {
      id: "s1",
      name: "Demolition",
      note: "Haul-off included",
      items: [item({ id: "demo", description: "Demo kitchen", kind: "labor", qty: 40, hrs: 1, memo: "SECRET-MEMO", source: "SECRET-SOURCE" })],
    },
    {
      id: "s2",
      name: "Cabinets",
      items: [
        item({ id: "cab1", description: "Cabinet allowance", kind: "allowance", cost: 12000, packages: ["ess"] }),
        item({ id: "cab2", description: "Custom cabinet allowance", kind: "allowance", cost: 22000, packages: ["sig"] }),
        item({ id: "drywall", description: "Drywall patch", kind: "installed", qty: 120, unit: "SF", mat: 0.54, hrs: 0.04 }),
      ],
    },
    { id: "s3", name: "Add-ons", items: [item({ id: "uc", description: "Under-cabinet lighting", kind: "sub", cost: 1800, optional: true })] },
  ];
  return b;
}

const TODAY = "2026-10-19";

describe("buildProposal", () => {
  it("never carries costs, hours, the labor rate, memos or price sources", () => {
    for (const layout of ["total", "sections", "itemized"] as const) {
      const b = kitchen();
      b.present.layout = layout;
      b.present.showQuantities = true;
      b.present.showUnitPrices = true;
      const json = JSON.stringify(buildProposal(b, TODAY));
      for (const banned of ["SECRET-MEMO", "SECRET-SOURCE", "45.03", "4503", '"laborRate"', '"hrs"', '"contingency', '"overhead', '"profit', '"marginPct"', '"mat"', '"cost"', '"memo"', '"source"', '"lab"', '"rate"']) {
        expect(json, `${layout} leaks ${banned}`).not.toContain(banned);
      }
    }
  });

  it("package totals equal the priced sell, and sections add up to them", () => {
    const b = kitchen();
    const priced = priceEstimate(b);
    const p = buildProposal(b, TODAY, priced);
    expect(p.choosePackage).toBe(true);
    for (const pkg of p.packages) {
      expect(pkg.totalCents).toBe(priced.packages[pkg.id].sell);
      expect(p.sections.reduce((a, s) => a + (s.amounts?.[pkg.id] ?? 0), 0)).toBe(pkg.totalCents);
    }
    // A line in one package only is marked for that package.
    const cab = p.sections.find((s) => s.name === "Cabinets")!;
    expect(cab.lines.find((l) => l.description === "Cabinet allowance")!.pkgs).toEqual(["ess"]);
  });

  it("a one-price proposal carries no section or line prices, but keeps allowance values", () => {
    const b = kitchen();
    b.present.layout = "total";
    const p = buildProposal(b, TODAY);
    for (const s of p.sections) {
      expect(s.amounts).toBeUndefined();
      for (const l of s.lines) {
        if (l.allowance) expect(l.amounts).toBeDefined();
        else expect(l.amounts).toBeUndefined();
      }
    }
  });

  it("unit prices multiply out exactly on the client's copy", () => {
    const b = kitchen();
    b.present.layout = "itemized";
    b.present.showUnitPrices = true;
    const p = buildProposal(b, TODAY);
    const line = p.sections.flatMap((s) => s.lines).find((l) => l.description === "Drywall patch")!;
    for (const v of Object.values(line.amounts!)) expect(v).toBe(Math.round(line.unitCents! * line.qty!));
    for (const pkg of p.packages) {
      expect(p.sections.reduce((a, s) => a + (s.amounts?.[pkg.id] ?? 0), 0)).toBe(pkg.totalCents);
    }
  });

  it("sends one package when the client is not choosing", () => {
    const b = kitchen();
    b.present.showPackages = false;
    const p = buildProposal(b, TODAY);
    expect(p.packages.map((x) => x.id)).toEqual(["sig"]);
    expect(p.choosePackage).toBe(false);
  });

  it("lists add-ons with their own price and leaves them out of the base", () => {
    const b = kitchen();
    const priced = priceEstimate(b);
    const p = buildProposal(b, TODAY, priced);
    expect(p.options).toEqual([expect.objectContaining({ id: "uc", priceCents: priced.options.uc.sell })]);
    expect(p.sections.find((s) => s.name === "Add-ons")).toBeUndefined();
  });

  it("states the drawing basis when priced from plans", () => {
    const b = kitchen();
    b.manifest = { basis: "plans", drawingSet: "BGW Permit Set", drawingDate: "2026-07-20", addenda: "ASI002", priorChecked: true };
    expect(buildProposal(b, TODAY).basis).toBe("Drawings: BGW Permit Set, dated 2026-07-20; addenda: ASI002");
    expect(buildProposal(b, TODAY).validUntil).toBe("2026-11-18");
  });
});

describe("acceptedTotal", () => {
  it("recomputes the client's choice from the frozen snapshot", () => {
    const p = buildProposal(kitchen(), TODAY);
    const sig = p.packages.find((x) => x.id === "sig")!;
    const got = acceptedTotal(p, "sig", ["uc", "uc"])!;
    expect(got.totalCents).toBe(sig.totalCents + p.options[0].priceCents);
    expect(got.packageName).toBe("Signature");
    expect(acceptedTotal(p, "nope", [])).toBeNull();
    expect(acceptedTotal(p, "sig", ["made-up"])).toBeNull();
  });

  it("splits a schedule so the steps add up to the total", () => {
    const steps = scheduleAmounts(
      [
        { label: "a", pct: 10 },
        { label: "b", pct: 45 },
        { label: "c", pct: 45 },
      ],
      100001,
    );
    expect(steps.reduce((a, s) => a + s.cents, 0)).toBe(100001);
  });
});

describe("runChecks", () => {
  const ctx = { today: TODAY, kind: "remodel" as const, prior: [] };

  it("stops a send until the prior-estimate search is confirmed and every line is priced", () => {
    const b = newEstimateBody("remodel", "Bath");
    const ids = runChecks(b, ctx).filter((c) => c.level === "stop").map((c) => c.id);
    expect(ids).toEqual(expect.arrayContaining(["manifest-prior", "lines-qty"]));
  });

  it("asks for the drawing set and addenda when priced from plans", () => {
    const b = kitchen();
    b.manifest = { basis: "plans", priorChecked: true };
    const ids = runChecks(b, ctx).map((c) => c.id);
    expect(ids).toEqual(expect.arrayContaining(["manifest-set", "manifest-addenda"]));
  });

  it("flags prices older than 60 days, but not hours at the rate card", () => {
    const b = kitchen();
    b.manifest.priorChecked = true;
    b.sections[1].items[2].priceDate = "2026-08-01";
    b.sections[0].items[0].priceDate = "2026-06-01";
    const stale = runChecks(b, ctx).find((c) => c.id === "lines-stale");
    expect(stale?.itemIds).toEqual(["drywall"]);
  });

  it("catches supervision carried twice", () => {
    const b = kitchen();
    b.sections[0].items.push(item({ id: "f1", description: "Foreman", kind: "labor", qty: 2, lab: 1801.2 }));
    b.sections.push({ id: "gc", name: "General conditions", items: [item({ id: "f2", description: "Supervision: working foreman", kind: "labor", qty: 2, lab: 1801.2 })] });
    const c = runChecks(b, ctx).find((x) => x.id === "lines-supervision");
    expect(c?.title).toContain("general conditions");
    expect(c?.itemIds).toEqual(["f1", "f2"]);
  });

  it("catches OSB and plywood in the same estimate", () => {
    const b = kitchen();
    b.sections[0].items.push(item({ description: "7/16 OSB sheathing", qty: 10, cost: 10 }), item({ description: "1/2 CDX plywood", qty: 10, cost: 10 }));
    expect(runChecks(b, ctx).some((c) => c.id.startsWith("lines-spec-OSB"))).toBe(true);
  });

  it("compares against the last proposal sent", () => {
    const b = kitchen();
    const sell = priceEstimate(b).primary.sell;
    const c = runChecks(b, { ...ctx, prior: [{ number: "EST-26-0001", revision: 1, totalCents: sell - 500000, issuedAt: "2026-10-01T00:00:00Z" }] }).find((x) => x.id === "pricing-prior");
    expect(c?.title).toMatch(/^Up \$5,000/);
  });

  it("warns under the margin floor and on a remodel with no contingency", () => {
    const b = kitchen();
    b.pricing = { ...b.pricing, overheadPct: 2, profitPct: 2, contingencyPct: 0 };
    const ids = runChecks(b, ctx).map((c) => c.id);
    expect(ids).toEqual(expect.arrayContaining(["pricing-margin", "pricing-contingency"]));
  });

  it("refuses a payment schedule that is not 100%", () => {
    const b = kitchen();
    b.schedule = [{ id: "a", label: "Deposit", pct: 10 }];
    expect(runChecks(b, ctx).find((c) => c.id === "present-schedule")?.level).toBe("stop");
  });
});
