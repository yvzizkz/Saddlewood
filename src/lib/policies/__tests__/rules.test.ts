import { describe, expect, it } from "vitest";

import { SETTING_DEFAULTS, parseSettingValue, planDueLabel } from "@/lib/crew/settingsRules";
import { DEFAULT_TERMS, newEstimateBody } from "@/lib/sales/templates";
import { DECISIONS, OWN_KEYS, POLICY_DEFAULTS, POLICY_DEFS, fillTerms, parsePolicyValue, readPolicies } from "../rules";

describe("company policies", () => {
  it("start at the recommendation, one key each, every decision with a recommendation and a reason", () => {
    const keys = POLICY_DEFS.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(DECISIONS).toHaveLength(11);
    for (const d of DECISIONS) {
      expect(d.policies.length).toBeGreaterThan(0);
      expect(d.recommendation.length).toBeGreaterThan(10);
      expect(d.why.length).toBeGreaterThan(10);
      expect(d.liveIn || d.laterIn).toBeTruthy();
    }
    for (const p of POLICY_DEFS) expect(POLICY_DEFAULTS[p.key]).toBe(p.recommended);
  });

  it("recommends what the field settings already ship with, for the keys they share", () => {
    for (const p of POLICY_DEFS.filter((x) => !x.key.startsWith("policy."))) {
      expect(SETTING_DEFAULTS[p.key as keyof typeof SETTING_DEFAULTS]).toBe(p.recommended);
    }
    expect(OWN_KEYS.every((k) => k.startsWith("policy."))).toBe(true);
  });

  it("takes only values that fit each control", () => {
    expect(parsePolicyValue("policy.contract.proposalIsContract", false)).toBe(false);
    expect(parsePolicyValue("policy.contract.proposalIsContract", "yes")).toBeNull();
    expect(parsePolicyValue("policy.contract.agreementOverCents", 2_500_000)).toBe(2_500_000);
    expect(parsePolicyValue("policy.contract.agreementOverCents", 12.5)).toBeNull();
    expect(parsePolicyValue("policy.late.ratePct", 1.25)).toBe(1.25);
    expect(parsePolicyValue("policy.late.ratePct", 9)).toBeNull();
    expect(parsePolicyValue("policy.ladder.reminders", "ask")).toBe("ask");
    expect(parsePolicyValue("policy.ladder.reminders", "sometimes")).toBeNull();
    expect(parsePolicyValue("policy.made.up", 1)).toBeNull();
  });

  it("reads stored values, keeping the recommendation where one is missing or bad", () => {
    const p = readPolicies({ "policy.deposit.pct": 15, "policy.late.graceDays": "ten", "policy.unknown": 3 });
    expect(p["policy.deposit.pct"]).toBe(15);
    expect(p["policy.late.graceDays"]).toBe(10);
    expect(p["policy.unknown"]).toBeUndefined();
  });

  it("the plan deadline is a field setting with a 24-hour time", () => {
    expect(SETTING_DEFAULTS["crew.planDue"]).toBe("18:00");
    expect(parseSettingValue("crew.planDue", "17:30")).toBe("17:30");
    expect(parseSettingValue("crew.planDue", "5:30 PM")).toBeNull();
    expect(planDueLabel("18:00")).toBe("6 PM");
    expect(planDueLabel("17:30")).toBe("5:30 PM");
  });
});

describe("terms follow the policies", () => {
  it("the recommended policies give SOP-007's short form, with no marker left", () => {
    const t = fillTerms(DEFAULT_TERMS, POLICY_DEFAULTS);
    expect(t).not.toMatch(/\{[a-z_]+\}/);
    expect(t).toContain("Deposit of 10% of the contract is due at signing, before scheduling, plus 100% of any special-order materials before they are ordered.");
    expect(t).toContain("Balances unpaid 10 days after the due date accrue 1.5% per month.");
    expect(t).toContain("priced at cost plus 20% overhead and profit");
    expect(t).toContain("the deposit is refunded less costs incurred and 10% of the contract.");
  });

  it("changes when an owner changes a policy", () => {
    const t = fillTerms(DEFAULT_TERMS, {
      ...POLICY_DEFAULTS,
      "policy.deposit.pct": 15,
      "policy.deposit.specialOrders": false,
      "policy.late.start": "invoice_date",
      "policy.late.ratePct": 1.25,
      "policy.deposit.refund": "non_refundable",
    });
    expect(t).toContain("Deposit of 15% of the contract is due at signing, before scheduling.");
    expect(t).toContain("10 days after the invoice date accrue 1.25% per month");
    expect(t).toContain("The deposit is not refundable once the work is scheduled.");
  });

  it("a new estimate never starts with a raw marker", () => {
    for (const t of ["quick", "remodel", "addition", "framing_sub", "service", "blank"] as const) {
      expect(newEstimateBody(t, "Job").terms).not.toMatch(/\{[a-z_]+\}/);
    }
  });
});

describe("the plan deadline", () => {
  it("is any clock time in Company policies, the same as the field setting", () => {
    expect(parsePolicyValue("crew.planDue", "17:45")).toBe("17:45");
    expect(parsePolicyValue("crew.planDue", "24:00")).toBeNull();
    expect(readPolicies({ "crew.planDue": "17:45" })["crew.planDue"]).toBe("17:45");
  });
});
