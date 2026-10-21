import { describe, expect, it } from "vitest";

import { isTradeSlug } from "@/lib/accounting/tradeList";
import { GC_TEMPLATE, PHASE_TEMPLATES, TEMPLATE_TRADES, isPhasePick, pickFor, pickLabel, pickTrades, templatePhases } from "../phases";
import { adminActSchema } from "../types";

// Phase templates per trade: we are a GC with our own electrical, plumbing and
// HVAC licenses, so every trade we perform has a template, a job's phases are
// picked by its trades, and a whole job starts from the GC template.

const names = (pick: string) => templatePhases(pick).map((p) => p.name);

describe("a template for every trade we perform", () => {
  it("covers framing, plumbing, electrical, HVAC, insulation and drywall, in build order", () => {
    expect(TEMPLATE_TRADES).toEqual(["framing", "plumbing", "electrical", "hvac", "insulation", "drywall"]);
  });

  it("walks each MEP trade through its Arizona inspections", () => {
    expect(PHASE_TEMPLATES.plumbing).toEqual(["plumbing underground", "plumbing underground inspection", "top-out", "top-out inspection", "gas pressure test", "set fixtures", "plumbing final"]);
    expect(PHASE_TEMPLATES.electrical).toEqual(["temp power", "electrical underground", "electrical rough", "electrical rough inspection", "electrical trim", "service (SES) inspection", "electrical final"]);
    expect(PHASE_TEMPLATES.hvac).toEqual(["HVAC rough", "ductwork", "HVAC rough and duct inspection", "set equipment", "startup", "HVAC final"]);
    expect(templatePhases("hvac").every((p) => p.trade === "hvac" && p.plannedFrom === null && p.plannedTo === null)).toBe(true);
  });

  it("keeps the framing and drywall templates, and both, exactly as before", () => {
    expect(names("framing")).toEqual(["layout", "walls", "roof and ceiling", "backing", "inspection"]);
    expect(names("drywall")).toEqual(["hang", "tape", "texture", "punch"]);
    expect(names("both")).toEqual(names("framing,drywall"));
    expect(names("drywall,framing")).toEqual(["layout", "walls", "roof and ceiling", "backing", "inspection", "hang", "tape", "texture", "punch"]);
  });
});

describe("picking the job's trades", () => {
  it("interleaves several trades the way the build runs", () => {
    const list = names("framing,plumbing,electrical,hvac,drywall");
    const at = (n: string) => list.indexOf(n);
    // Underground before framing; every rough-in after framing and inspected before insulation and board.
    expect(at("plumbing underground")).toBeLessThan(at("layout"));
    expect(at("electrical underground")).toBeLessThan(at("layout"));
    for (const rough of ["top-out", "electrical rough", "HVAC rough", "ductwork"]) {
      expect(at(rough)).toBeGreaterThan(at("backing"));
      expect(at(rough)).toBeLessThan(at("top-out inspection"));
    }
    for (const insp of ["top-out inspection", "electrical rough inspection", "HVAC rough and duct inspection", "inspection"]) expect(at(insp)).toBeLessThan(at("hang"));
    // Trim and finals after drywall; the service is inspected before the electrical final.
    expect(at("set fixtures")).toBeGreaterThan(at("punch"));
    expect(at("service (SES) inspection")).toBeLessThan(at("electrical final"));
    expect(list.slice(-3)).toEqual(["plumbing final", "electrical final", "HVAC final"]);
    // Nothing dropped, nothing doubled.
    expect(list).toHaveLength(5 + 7 + 7 + 6 + 4);
    expect(new Set(list).size).toBe(list.length);
  });

  it("reads a pick, in build order, and refuses anything that is not one", () => {
    expect(pickTrades("hvac,plumbing")).toEqual(["plumbing", "hvac"]);
    expect(pickTrades(" Electrical ")).toEqual(["electrical"]);
    expect(pickTrades("both")).toEqual(["framing", "drywall"]);
    expect(pickTrades("gc")).toEqual([]);
    for (const bad of ["", "none", "roofing", "framing,roofing", ","]) {
      expect(pickTrades(bad)).toBeNull();
      expect(isPhasePick(bad)).toBe(false);
      expect(templatePhases(bad)).toEqual([]);
    }
    expect(pickFor(["hvac", "framing", "stucco"])).toBe("framing,hvac");
    expect(pickFor([])).toBe("none");
  });

  it("says what it picked", () => {
    expect(pickLabel("framing")).toBe("framing");
    expect(pickLabel("both")).toBe("framing and drywall");
    expect(pickLabel("plumbing,electrical,hvac")).toBe("plumbing, electrical and HVAC");
    expect(pickLabel("gc")).toBe("the whole job");
  });

  it("is what the phases action accepts", () => {
    const parse = (template: string) => adminActSchema.safeParse({ kind: "job.phases.template", jobId: "powell", template }).success;
    for (const ok of ["framing", "drywall", "both", "gc", "plumbing,electrical,hvac"]) expect(parse(ok)).toBe(true);
    for (const bad of ["none", "roofing", ""]) expect(parse(bad)).toBe(false);
  });
});

describe("the whole-job GC template", () => {
  it("runs demo, foundation, framing, MEP rough and inspections, insulation, drywall, finishes, final", () => {
    const list = names("gc");
    expect(list).toEqual(GC_TEMPLATE.map((p) => p.name));
    const order = ["demo", "footing and foundation", "framing", "MEP rough inspections", "insulation and inspection", "drywall", "finishes", "final inspection"];
    expect(order.map((n) => list.indexOf(n))).toEqual([...order.map((n) => list.indexOf(n))].sort((a, b) => a - b));
    expect(order.every((n) => list.includes(n))).toBe(true);
    for (const rough of ["plumbing top-out", "electrical rough", "HVAC rough and duct"]) expect(list.indexOf(rough)).toBeLessThan(list.indexOf("MEP rough inspections"));
    expect(list[list.length - 1]).toBe("final inspection");
  });

  it("files every phase under a trade on the shared list", () => {
    for (const p of templatePhases("gc")) expect(isTradeSlug(p.trade)).toBe(true);
    expect(new Set(templatePhases("gc").map((p) => p.trade))).toEqual(new Set(["demo", "plumbing", "concrete", "framing", "electrical", "hvac", "general", "insulation", "drywall"]));
  });
});
