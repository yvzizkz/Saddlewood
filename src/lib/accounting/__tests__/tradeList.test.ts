import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { TRADES as PURCHASE_CHIPS, TRADE_SLUGS as PURCHASE_SLUGS } from "@/lib/crew/purchases";
import { COMMON_TRADES } from "@/lib/subs/types";
import {
  COMPANY_LICENSE,
  DEFAULT_TRADES,
  QUICK_TRADES,
  SELF_PERFORMED,
  TRADE_LICENSES,
  TRADE_SLUGS,
  isTradeSlug,
  resolveTrade,
  tradeLabel,
  tradeShort,
} from "../tradeList";
import { DEFAULT_TRADES as FROM_TRADES } from "../trades";

describe("the one trade list", () => {
  it("is the list 0029_trades seeds, slug for slug and label for label", () => {
    const sql = readFileSync(join(process.cwd(), "supabase/migrations/0029_trades.sql"), "utf8");
    const seeded = [...sql.matchAll(/\('([a-z0-9-]+)', '([^']+)', (\d+)\)/g)].map(([, slug, label, ord]) => ({ slug, label, ord: Number(ord) }));
    expect(seeded.length).toBe(20);
    expect(DEFAULT_TRADES).toEqual(seeded);
  });

  it("carries our own MEP trades with their licenses", () => {
    for (const t of ["electrical", "plumbing", "hvac"]) expect(isTradeSlug(t)).toBe(true);
    expect(TRADE_LICENSES).toEqual({ electrical: "CR-11", plumbing: "CR-37", hvac: "CR-39" });
    expect(COMPANY_LICENSE).toBe("ROC 305762");
    expect(SELF_PERFORMED).toEqual(["framing", "plumbing", "electrical", "hvac", "insulation", "drywall"]);
  });

  it("is the list every other module reads", () => {
    expect(FROM_TRADES).toBe(DEFAULT_TRADES);
    expect(PURCHASE_SLUGS).toBe(TRADE_SLUGS);
    expect(PURCHASE_CHIPS).toBe(QUICK_TRADES);
    // The purchase chips include HVAC, and every chip is on the list.
    expect(QUICK_TRADES).toContain("hvac");
    for (const t of QUICK_TRADES) expect(isTradeSlug(t)).toBe(true);
    // The subs directory offers the list (less our own bookkeeping lines) in its lower case, then sub-only trades.
    expect(COMMON_TRADES).toEqual(expect.arrayContaining(["electrical", "plumbing", "hvac", "framing", "drywall", "windows and doors", "stucco"]));
    expect(COMMON_TRADES).not.toContain("general conditions");
  });

  it("labels a slug, shortens the long ones for a chip, and keeps anything else as written", () => {
    expect(tradeLabel("hvac")).toBe("HVAC");
    expect(tradeLabel("finish-carpentry")).toBe("Finish carpentry");
    expect(tradeLabel("stucco")).toBe("stucco");
    expect(tradeShort("general")).toBe("General");
    expect(tradeShort("tools")).toBe("Tools");
    expect(tradeShort("plumbing")).toBe("Plumbing");
    expect(isTradeSlug("fasteners")).toBe(false);
  });

  it("resolves typed trades against the list", () => {
    expect(resolveTrade("HVAC")).toEqual({ key: "hvac", label: "HVAC" });
    expect(resolveTrade("Electrical apprentice")).toEqual({ key: "electrical", label: "Electrical" });
    expect(resolveTrade("Stucco")).toEqual({ key: "stucco", label: "Stucco" });
    expect(resolveTrade("")).toBeNull();
  });
});

describe("no screen keeps its own trade list", () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
  it("has no hardcoded framing/drywall picker, label map or default left", () => {
    const field = read("src/components/field/FieldOpsActions.tsx");
    expect(field).not.toContain('"Framing, Drywall"');
    expect(field).not.toMatch(/<option value="(drywall|framing|insulation)">/);
    for (const p of ["src/components/projects/MaterialBlock.tsx", "src/components/purchases/PurchaseSearch.tsx", "src/components/crew/admin/StageStrip.tsx"]) {
      expect(read(p)).not.toMatch(/TRADE_LABEL|TEMPLATE_LABEL/);
    }
    expect(read("src/components/subs/NewPackageSheet.tsx")).not.toContain('placeholder="insulation"');
    expect(read("src/components/crew/RequestCards.tsx")).not.toContain('placeholder="Framing"');
    expect(read("src/components/sales/pipeline/AwardSheet.tsx")).not.toMatch(/label: 'Both'/);
  });
});
