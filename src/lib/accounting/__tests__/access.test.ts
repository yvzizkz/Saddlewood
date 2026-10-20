import { describe, expect, it } from "vitest";

import { sectionsFor, seesBillingJob, seesCrewJob, type MoneySeat } from "../access";

const pm: MoneySeat = { owner: false, email: "eli@x.com", crewJobs: ["8009"], billingJobs: ["b-8009"], laborCost: false, margin: false, sections: sectionsFor(false, false) };

describe("money seats", () => {
  it("gives a PM receivables, billing, purchases and hours, never payables; job costing only with the margin policy", () => {
    expect(sectionsFor(false, false)).toEqual(["overview", "payroll", "purchases", "receivables", "billing"]);
    expect(sectionsFor(false, true)).toContain("job-costing");
    expect(sectionsFor(true, false)).toContain("payables");
  });
  it("keeps a PM to their own jobs, and rows with no job to the owners", () => {
    expect(seesCrewJob(pm, "8009")).toBe(true);
    expect(seesCrewJob(pm, "4125")).toBe(false);
    expect(seesCrewJob(pm, null)).toBe(false);
    expect(seesBillingJob(pm, "b-8009")).toBe(true);
    expect(seesBillingJob({ ...pm, billingJobs: null }, "anything")).toBe(true);
  });
});
