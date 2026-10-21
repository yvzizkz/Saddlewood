import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CHECKLIST_SETS,
  CHECKLIST_STAGES,
  CHECKLIST_STAGE_LABEL,
  checklistTradeFor,
  checklistTradeOf,
  defaultChecklistItems,
  isChecklistStage,
} from "../ops";
import { onSite, toggleOnSite } from "../tradesOnSite";

describe("checklists per trade", () => {
  it("keeps the six drywall stages exactly as they were", () => {
    expect(CHECKLIST_SETS.drywall).toEqual(["pre_cover", "pre_board", "pre_tape", "pre_texture", "pre_paint", "final_walk"]);
    expect(CHECKLIST_STAGE_LABEL.pre_cover).toBe("1. Pre-cover (framing & backing)");
    expect(CHECKLIST_STAGE_LABEL.pre_paint).toBe("5. Pre-paint (500W raking-light check)");
    expect(defaultChecklistItems("pre_tape").map((i) => i.key)).toEqual(["screw_pattern", "beads_straight", "both_faces_photo"]);
    for (const st of CHECKLIST_SETS.drywall) expect(checklistTradeOf(st)).toBe("drywall");
  });

  it("gives plumbing, electrical and HVAC rough-in, pre-cover and final", () => {
    expect(CHECKLIST_SETS.plumbing).toEqual(["plumbing_rough", "plumbing_precover", "plumbing_final"]);
    expect(CHECKLIST_SETS.electrical).toEqual(["electrical_rough", "electrical_precover", "electrical_final"]);
    expect(CHECKLIST_SETS.hvac).toEqual(["hvac_rough", "hvac_precover", "hvac_final"]);
    for (const t of ["plumbing", "electrical", "hvac"] as const) {
      for (const st of CHECKLIST_SETS[t]) {
        expect(checklistTradeOf(st)).toBe(t);
        const items = defaultChecklistItems(st);
        expect(items.length).toBeGreaterThanOrEqual(3);
        expect(items.every((i) => i.key && i.label && !i.checked && i.note === "")).toBe(true);
        expect(new Set(items.map((i) => i.key)).size).toBe(items.length);
        expect(CHECKLIST_STAGE_LABEL[st]).toMatch(new RegExp(t === "hvac" ? "^HVAC" : `^${t[0].toUpperCase()}${t.slice(1)}`));
      }
    }
    // Each trade's pre-cover gate holds on the inspector's sign-off; each final on the final inspection.
    expect(defaultChecklistItems("plumbing_precover").map((i) => i.key)).toContain("topout_signoff");
    expect(defaultChecklistItems("electrical_precover").map((i) => i.key)).toContain("rough_signoff");
    expect(defaultChecklistItems("hvac_precover").map((i) => i.key)).toContain("rough_signoff");
    for (const st of ["plumbing_final", "electrical_final", "hvac_final"] as const) expect(defaultChecklistItems(st).map((i) => i.key)).toContain("final_signoff");
  });

  it("picks the checklist from the phase's trade, drywall's sequence for anything else", () => {
    expect(checklistTradeFor("plumbing")).toBe("plumbing");
    expect(checklistTradeFor("HVAC")).toBe("hvac");
    expect(checklistTradeFor("electrical")).toBe("electrical");
    expect(checklistTradeFor("framing")).toBe("drywall");
    expect(checklistTradeFor("")).toBe("drywall");
    expect(checklistTradeFor(undefined)).toBe("drywall");
  });

  it("accepts only known stages", () => {
    expect(CHECKLIST_STAGES).toHaveLength(15);
    expect(isChecklistStage("hvac_final")).toBe(true);
    expect(isChecklistStage("pre_cover")).toBe(true);
    expect(isChecklistStage("roof_final")).toBe(false);
    expect(isChecklistStage(3)).toBe(false);
  });

  it("matches the database's stage check (0045), which keeps every stage 0035 allowed", () => {
    const sql = readFileSync(join(process.cwd(), "supabase/migrations/0045_trade_checklists.sql"), "utf8");
    const allowed = [...sql.slice(sql.indexOf("stage in (")).matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect(allowed.sort()).toEqual([...CHECKLIST_STAGES].sort());
    // Additive: the constraint is widened; no row is updated or deleted.
    expect(sql).not.toMatch(/\b(update|delete|truncate)\b/i);
  });
});

describe("trades on site", () => {
  it("starts empty and toggles our trades, keeping what was typed", () => {
    expect(onSite("")).toEqual([]);
    expect(toggleOnSite("", "Plumbing")).toBe("Plumbing");
    expect(toggleOnSite("Plumbing", "HVAC")).toBe("Plumbing, HVAC");
    expect(toggleOnSite("Plumbing, stucco sub, HVAC", "Plumbing")).toBe("stucco sub, HVAC");
    expect(onSite(" Electrical ,  , Drywall")).toEqual(["Electrical", "Drywall"]);
  });
});
