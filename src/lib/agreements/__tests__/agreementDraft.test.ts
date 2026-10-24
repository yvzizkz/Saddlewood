import { describe, expect, it } from "vitest";

import type { AwardRecord } from "@/lib/sales/award";
import type { ProposalSnapshot } from "@/lib/sales/presentation";

import { agreementNumber, defaultType, planAgreement, scopeDetails, type AgreementSource } from "../draft";
import { agreementText } from "../text";

// The agreement drafted on a job (T112): its price is the job's contract
// figure and its scope the accepted proposal's, and its words are exactly
// agreementText's (which agreementText.test.ts holds to contract.py).

const award: AwardRecord = {
  documentId: "e0000000-0000-4000-8000-000000000001",
  number: "EST-1042",
  revision: 2,
  packageId: "p2",
  packageName: "Premium",
  options: ["Garage drywall"],
  totalCents: 4_712_500,
  acceptedAt: "2026-10-20T17:00:00.000Z",
  acceptedBy: "Heather Powell (on the link)",
  awardedAt: "2026-10-21T15:00:00.000Z",
  awardedBy: "marco@saddlewoodcontracting.com",
};

const proposal = {
  v: 1,
  title: "Framing & Drywall",
  packages: [
    { id: "p1", name: "Standard", highlights: [], recommended: false, totalCents: 4_000_000 },
    { id: "p2", name: "Premium", highlights: [], recommended: true, totalCents: 4_500_000 },
  ],
  sections: [
    { name: "Framing", pkgs: ["p1", "p2"], lines: [] },
    { name: "Drywall, level 5", pkgs: ["p2"], lines: [] },
    { name: "Drywall, level 4", pkgs: ["p1"], lines: [] },
  ],
  exclusions: ["Permits", "Paint"],
} as unknown as ProposalSnapshot;

const src = (over: Partial<AgreementSource> = {}): AgreementSource => ({
  job: { id: "b0000000-0000-4000-8000-000000000001", name: "3526 Emerson St", address: "3526 Emerson St, Scottsdale AZ", numberPrefix: "3526", contractCents: 4_712_500 },
  client: { name: "Mark & Heather Powell", kind: "homeowner" },
  award,
  proposal: { number: "EST-1042", revision: 2, snapshot: proposal },
  ...over,
});

describe("planAgreement", () => {
  it("takes the price from the job's contract and the scope from the accepted proposal, in agreementText's words", () => {
    const plan = planAgreement(src(), { "policy.deposit.pct": 20 }, "2026-10-23");
    if (!plan.ok) throw new Error(plan.error);
    expect(plan.number).toBe("3526-AGR");
    expect(plan.totalCents).toBe(4_712_500);
    expect(plan.snapshot.lines).toEqual([{ description: "Contract Price", amountCents: 4_712_500 }]);
    expect(plan.snapshot.agreement).toMatchObject({ v: 1, type: "prime_residential", proposal: { documentId: award.documentId, number: "EST-1042", revision: 2, packageName: "Premium", options: ["Garage drywall"] } });
    const expected = agreementText(
      {
        contractNumber: "3526-AGR",
        type: "prime_residential",
        clientName: "Mark & Heather Powell",
        clientEntity: "Mark & Heather Powell",
        projectName: "3526 Emerson St",
        projectAddress: "3526 Emerson St, Scottsdale AZ",
        amount: 47_125,
        scope: "Framing & Drywall",
        scopeDetails: scopeDetails(award, "EST-1042", 2, proposal),
        date: "October 23, 2026",
      },
      { "policy.deposit.pct": 20 },
    );
    expect(plan.snapshot.agreement.text).toBe(expected);
    expect(plan.snapshot.agreement.text).toContain("47,125.00");
  });

  it("lists the accepted package's sections and the chosen add-ons, not the other package's", () => {
    expect(scopeDetails(award, "EST-1042", 2, proposal)).toBe(
      ["Per Proposal EST-1042 rev 2 (Premium), accepted October 20, 2026:", "", "* Framing", "* Drywall, level 5", "* Add-on: Garage drywall", "", "Not included: Permits; Paint."].join("\n"),
    );
  });

  it("lets staff name the signer and the type, never the price or the scope", () => {
    const plan = planAgreement(src(), {}, "2026-10-23", { type: "prime_commercial", clientName: "Heather Powell", ...({ amount: 1 } as object) });
    if (!plan.ok) throw new Error(plan.error);
    expect(plan.snapshot.agreement.type).toBe("prime_commercial");
    expect(plan.snapshot.agreement.text).toContain("Name: Heather Powell");
    expect(plan.snapshot.agreement.text).toContain("**CLIENT / OWNER: Mark & Heather Powell**");
    expect(plan.totalCents).toBe(4_712_500);
  });

  it("won't draft before the award, without the proposal, or without a contract figure", () => {
    expect(planAgreement(src({ award: null }), {}, "2026-10-23")).toMatchObject({ ok: false, error: expect.stringMatching(/^Award the job first/) });
    expect(planAgreement(src({ proposal: null }), {}, "2026-10-23")).toMatchObject({ ok: false, error: expect.stringMatching(/without a proposal/) });
    expect(planAgreement(src({ job: { ...src().job, contractCents: null } }), {}, "2026-10-23")).toMatchObject({ ok: false, error: "The job has no contract figure yet." });
  });

  it("numbers by the job's prefix, and types by the client", () => {
    expect(agreementNumber({ ...src().job, numberPrefix: null })).toBe("AGR-b0000000");
    expect([defaultType("homeowner"), defaultType("gc"), defaultType("other"), defaultType(undefined)]).toEqual(["prime_residential", "subcontractor", "prime_commercial", "prime_commercial"]);
  });
});
