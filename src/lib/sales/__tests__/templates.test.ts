import { describe, expect, it } from "vitest";

import { DEFAULT_TRADES, resolveTrade } from "@/lib/accounting/trades";
import { newEstimateBody, templateFor } from "../templates";

describe("estimate templates (GC self-performed MEP)", () => {
  it("gives remodel and addition self-performed Plumbing, Electrical, and HVAC sections from the shared trade list", () => {
    for (const key of ["remodel", "addition"] as const) {
      const body = newEstimateBody(key, `${key} test`);
      const bySlug = new Map(
        body.sections
          .map((s) => [resolveTrade(s.name, DEFAULT_TRADES)?.key ?? "", s] as const)
          .filter(([k]) => k === "plumbing" || k === "electrical" || k === "hvac"),
      );

      expect([...bySlug.keys()].sort()).toEqual(["electrical", "hvac", "plumbing"]);

      for (const slug of ["plumbing", "electrical", "hvac"] as const) {
        const sec = bySlug.get(slug)!;
        const expectedLabel = DEFAULT_TRADES.find((t) => t.slug === slug)!.label;
        expect(sec.name).toBe(expectedLabel);
        expect(sec.items.length).toBeGreaterThan(0);
        // Self-performed: every item in our MEP sections is installed or labor, never sub.
        for (const item of sec.items) {
          expect(["installed", "labor", "material"]).toContain(item.kind);
          expect(item.kind).not.toBe("sub");
          expect(item.description.toLowerCase()).not.toContain("sub");
        }
      }

      // Neither template keeps the legacy sub-only combined MEP section.
      const names = body.sections.map((s) => s.name);
      expect(names).not.toContain("Plumbing and electrical");
      expect(names).not.toContain("MEP");
    }
  });

  it("leaves quick, framing_sub, service, and blank templates unchanged", () => {
    const quick = newEstimateBody("quick", "Quick");
    expect(quick.sections.map((s) => s.name)).toEqual(["Scope of work"]);
    expect(quick.present.layout).toBe("total");
    expect(quick.schedule.map((s) => s.pct)).toEqual([50, 50]);

    const framing = newEstimateBody("framing_sub", "Framing");
    expect(framing.sections.map((s) => s.name)).toEqual([
      "Cold-formed metal framing (09 22 16)",
      "Rough carpentry / blocking (06 10 00)",
      "Gypsum board (09 29 00)",
      "Allowances",
      "General conditions",
    ]);
    expect(framing.exclusions).toContain("MEP, fire protection and specialty trades.");

    const service = newEstimateBody("service", "Service");
    expect(service.sections.map((s) => s.name)).toEqual(["Labor", "Materials"]);
    expect(service.present.layout).toBe("itemized");

    const blank = newEstimateBody("blank", "Blank");
    expect(blank.sections.map((s) => s.name)).toEqual(["Scope"]);

    expect(templateFor("remodel")).toBe("remodel");
    expect(templateFor("addition")).toBe("addition");
    expect(templateFor("custom_home")).toBe("addition");
    expect(templateFor("framing_sub")).toBe("framing_sub");
  });
});
