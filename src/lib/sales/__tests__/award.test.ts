import { describe, expect, it } from "vitest";

import { buildWaiting } from "@/lib/owner/waiting";
import { POLICY_DEFAULTS } from "@/lib/policies/rules";
import {
  clientKindFor,
  defaultChoices,
  jobNameFor,
  needsAgreement,
  planAward,
  prefixFor,
  sovFromProposal,
  templateFor,
  watchDue,
  type Accepted,
  type JobWatch,
} from "../award";
import type { ProposalSnapshot } from "../presentation";
import type { Opportunity } from "../types";

const OPP: Opportunity = {
  id: "00000000-0000-4000-8000-000000000001",
  number: "26-0042",
  title: "Patrick Lane remodel",
  stage: "won",
  kind: "remodel",
  source: "referral",
  contact: { name: "Dana Patrick", email: "Dana@Example.com", phone: "480-555-0100" },
  address: "7120 E Patrick Ln, Scottsdale, AZ 85251",
  clientId: null,
  contactId: null,
  jobId: null,
  valueCents: 0,
  probability: null,
  owner: "Marco",
  nextStep: "",
  nextStepOn: null,
  bidDue: null,
  lostReason: "",
  notes: "",
  tags: [],
  externalRef: null,
  createdBy: "Marco",
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-19T00:00:00Z",
  stageAt: "2026-10-19T00:00:00Z",
  closedAt: "2026-10-19T00:00:00Z",
};

// Two packages, sections priced per package, one "Overhead and profit" line after them, one add-on.
function proposal(over: Partial<ProposalSnapshot> = {}): ProposalSnapshot {
  return {
    v: 1,
    title: "Patrick Lane remodel",
    intro: "",
    layout: "sections",
    show: {} as ProposalSnapshot["show"],
    markupDisplay: "line",
    allowanceDisplay: "value",
    adjustments: [{ key: "markup", label: "Overhead and profit", amounts: { good: 20_000_00, best: 30_000_00 } }],
    sign: { mode: "client", consent: "", companyTitle: "", fonts: [] },
    packages: [
      { id: "good", name: "Good", highlights: [], recommended: false, totalCents: 120_000_00 },
      { id: "best", name: "Best", highlights: [], recommended: true, totalCents: 180_000_00 },
    ],
    choosePackage: true,
    sections: [
      { name: "Framing", pkgs: ["good", "best"], amounts: { good: 60_000_00, best: 80_000_00 }, lines: [] },
      { name: "Drywall", pkgs: ["good", "best"], amounts: { good: 40_000_00, best: 50_000_00 }, lines: [] },
      { name: "Finish carpentry", pkgs: ["best"], amounts: { best: 20_000_00 }, lines: [] },
    ],
    options: [{ id: "opt1", description: "Garage storage wall", priceCents: 4_500_00, packages: [] }],
    schedule: [],
    exclusions: [],
    clarifications: [],
    terms: "",
    timeline: "",
    validUntil: "2026-11-30",
    basis: "",
    allowAccept: true,
    ...over,
  } as ProposalSnapshot;
}

const ACCEPTED: Accepted = {
  packageId: "best",
  packageName: "Best",
  options: [{ id: "opt1", description: "Garage storage wall", priceCents: 4_500_00 }],
  totalCents: 184_500_00,
  name: "Dana Patrick",
  email: "dana@example.com",
  at: "2026-10-18T22:00:00Z",
};

describe("names and numbers", () => {
  it("names the job by its street address and numbers it by the street number (SOP-003)", () => {
    expect(jobNameFor(OPP)).toBe("7120 E Patrick Ln");
    expect(prefixFor(OPP.address)).toBe("7120");
    expect(prefixFor("Lot 346, Leonard Ranch")).toBe("");
    expect(jobNameFor({ address: "", title: "Bellevue Heights AC938" })).toBe("Bellevue Heights AC938");
  });

  it("treats framing packages and commercial TI as GC work", () => {
    expect(clientKindFor("framing_sub")).toBe("gc");
    expect(clientKindFor("commercial_ti")).toBe("gc");
    expect(clientKindFor("remodel")).toBe("homeowner");
    expect(defaultChoices({ ...OPP, kind: "framing_sub" })).toMatchObject({ deposit: false, template: "framing" });
    expect(defaultChoices({ ...OPP, kind: "commercial_ti" })).toMatchObject({ template: "framing,drywall" });
  });

  it("starts a remodel, an addition and a custom home from the whole-job GC template", () => {
    // We hold the paper on these (ROC 305762, with our own CR-11, CR-37 and CR-39): every trade is ours to run.
    expect(defaultChoices(OPP)).toMatchObject({ deposit: true, template: "gc", prefix: "7120" });
    expect(templateFor("remodel")).toBe("gc");
    expect(templateFor("addition")).toBe("gc");
    expect(templateFor("custom_home")).toBe("gc");
    expect(templateFor("service")).toBe("none");
    expect(templateFor("other")).toBe("none");
  });
});

describe("the schedule of values", () => {
  it("is each section of the accepted package, the line after them, then each add-on, adding up to the total", () => {
    const sov = sovFromProposal(proposal(), ACCEPTED);
    expect(sov.map((l) => [l.description, l.amountCents])).toEqual([
      ["Framing", 80_000_00],
      ["Drywall", 50_000_00],
      ["Finish carpentry", 20_000_00],
      ["Overhead and profit", 30_000_00],
      ["Add-on: Garage storage wall", 4_500_00],
    ]);
    expect(sov.reduce((s, l) => s + l.amountCents, 0)).toBe(ACCEPTED.totalCents);
  });

  it("leaves out sections the package does not carry", () => {
    const sov = sovFromProposal(proposal(), { ...ACCEPTED, packageId: "good", packageName: "Good", options: [], totalCents: 120_000_00 });
    expect(sov.map((l) => l.description)).toEqual(["Framing", "Drywall", "Overhead and profit"]);
  });

  it("puts a cent of rounding on the last section line", () => {
    const p = proposal({ packages: [{ id: "best", name: "Best", highlights: [], recommended: true, totalCents: 180_000_01 }] });
    const sov = sovFromProposal(p, { ...ACCEPTED, options: [], totalCents: 180_000_01 });
    expect(sov.reduce((s, l) => s + l.amountCents, 0)).toBe(180_000_01);
    expect(sov[sov.length - 1]).toMatchObject({ description: "Overhead and profit", amountCents: 30_000_01 });
  });

  it("is one contract line when the proposal went out as one price", () => {
    const p = proposal({ adjustments: [], sections: proposal().sections.map((s) => ({ ...s, amounts: undefined })) });
    const sov = sovFromProposal(p, ACCEPTED);
    expect(sov).toEqual([
      { description: "Contract work: Best", amountCents: 180_000_00, kind: "contract" },
      { description: "Add-on: Garage storage wall", amountCents: 4_500_00, kind: "option" },
    ]);
  });
});

describe("the award plan", () => {
  const plan = (over: Partial<Parameters<typeof planAward>[0]> = {}) =>
    planAward({
      opportunity: OPP,
      proposal: proposal(),
      proposalNumber: "EST-26-0042",
      accepted: ACCEPTED,
      policies: { ...POLICY_DEFAULTS },
      choices: defaultChoices(OPP),
      today: "2026-10-19",
      ...over,
    });

  it("drafts the deposit from Company policies, numbered first on the job", () => {
    const p = plan();
    expect(p.deposit).toMatchObject({ number: "7120-01", totalCents: 18_450_00 });
    expect(p.deposit?.snapshot.lines?.[0].description).toBe("Deposit: 10% of the contract ($184,500.00)");
    expect(p.deposit?.snapshot.note).toMatch(/Special-order materials/);
    expect(plan({ policies: { ...POLICY_DEFAULTS, "policy.deposit.pct": 25, "policy.deposit.specialOrders": false } }).deposit).toMatchObject({ totalCents: 46_125_00 });
    expect(plan({ policies: { ...POLICY_DEFAULTS, "policy.deposit.specialOrders": false } }).deposit?.snapshot.note).toBeUndefined();
  });

  it("drafts no deposit without a number prefix, or when the owner turns it off", () => {
    expect(plan({ choices: { ...defaultChoices(OPP), prefix: "" } }).deposit).toBeNull();
    expect(plan({ choices: { ...defaultChoices(OPP), deposit: false } }).deposit).toBeNull();
  });

  it("asks for the full agreement over the policy line, or always when the proposal is never the contract", () => {
    expect(needsAgreement(1_000_000, POLICY_DEFAULTS)).toBe(false);
    expect(needsAgreement(1_000_001, POLICY_DEFAULTS)).toBe(true);
    expect(needsAgreement(5_000_00, { ...POLICY_DEFAULTS, "policy.contract.proposalIsContract": false })).toBe(true);
    const p = plan();
    expect(p.agreementNeeded).toBe(true);
    expect(p.watches.map((w) => w.kind)).toEqual(["agreement", "deposit", "prelim_notice"]);
    expect(p.watches[0].dueOn).toBe("2026-10-26");
  });

  it("watches the certificate for a GC and drafts no deposit for one by default", () => {
    const gc = { ...OPP, kind: "framing_sub" as const, contact: { name: "Chris", company: "AFT Construction", email: "chris@aft.example" } };
    const p = plan({ opportunity: gc, choices: defaultChoices(gc) });
    expect(p.client).toMatchObject({ name: "AFT Construction", kind: "gc", contact: { role: "pm", email: "chris@aft.example" } });
    expect(p.deposit).toBeNull();
    expect(p.watches.map((w) => w.kind)).toContain("coi_gc");
    expect(p.watches.find((w) => w.kind === "agreement")?.title).toBe("Their subcontract signed");
  });

  it("uses the signed paper's amount when the owner enters one: one contract line, deposit on that amount", () => {
    const p = plan({ choices: { ...defaultChoices(OPP), contractCents: 150_000_00 } });
    expect(p.job.contractCents).toBe(150_000_00);
    expect(p.job.sov).toEqual([{ description: "Contract work: Patrick Lane remodel", amountCents: 150_000_00, kind: "contract" }]);
    expect(p.deposit?.totalCents).toBe(15_000_00);
  });

  it("works with no proposal from the app", () => {
    const p = plan({ proposal: null, accepted: { ...ACCEPTED, packageId: "", options: [], totalCents: 0 }, choices: { ...defaultChoices(OPP), contractCents: 9_000_00 } });
    expect(p.job.sov).toHaveLength(1);
    expect(p.agreementNeeded).toBe(false);
    expect(p.deposit?.snapshot.terms).toBe("Due at signing, before the work is scheduled.");
  });

  it("keeps the contact's email in lower case and the PM's choice", () => {
    const p = plan({ choices: { ...defaultChoices(OPP), pmEmail: " Eli@SaddlewoodContracting.com " } });
    expect(p.client.contact?.email).toBe("dana@example.com");
    expect(p.crew.pmEmail).toBe("eli@saddlewoodcontracting.com");
  });
});

describe("paperwork on Waiting on you", () => {
  const w = (over: Partial<JobWatch>): JobWatch => ({
    id: 1,
    jobId: "j1",
    kind: "deposit",
    title: "Deposit received",
    dueOn: "2026-10-22",
    note: "7120-01",
    doneAt: null,
    doneBy: "",
    createdBy: "Lando",
    createdAt: "2026-10-19T15:00:00Z",
    ...over,
  });
  const NOW = new Date("2026-10-19T16:00:00Z");
  const run = (watches: Parameters<typeof buildWaiting>[0]["watches"]) =>
    buildWaiting({ now: NOW, people: [], reports: [], tasks: [], jobs: [], timefixes: 0, reviews: 0, money: null, watches }).filter((i) => i.key.startsWith("watch-"));

  it("dates the 20-day notice from the first day of work", () => {
    expect(watchDue({ kind: "prelim_notice", dueOn: null }, null)).toBeNull();
    expect(watchDue({ kind: "prelim_notice", dueOn: null }, "2026-10-01")).toBe("2026-10-21");
    expect(watchDue({ kind: "deposit", dueOn: "2026-10-22" }, "2026-10-01")).toBe("2026-10-22");
  });

  it("shows a watch from five days before it is due, in its lane, and a late one as a signal", () => {
    const items = run([
      { watch: w({}), jobName: "7120 E Patrick Ln", opportunityId: "o1", firstDay: null },
      { watch: w({ id: 2, kind: "agreement", title: "Full agreement signed", dueOn: "2026-10-30" }), jobName: "7120 E Patrick Ln", opportunityId: "o1", firstDay: null },
      { watch: w({ id: 3, kind: "prelim_notice", title: "20-day preliminary notice served", dueOn: null }), jobName: "7120 E Patrick Ln", opportunityId: "o1", firstDay: "2026-09-25" },
      { watch: w({ id: 4, doneAt: "2026-10-19T10:00:00Z" }), jobName: "x", opportunityId: null, firstDay: null },
    ]);
    expect(items.map((i) => [i.key, i.lane, i.kind])).toEqual([
      ["watch-1", "money", "decision"],
      ["watch-3", "money", "signal"],
    ]);
    expect(items[0]).toMatchObject({ title: "Deposit received: 7120 E Patrick Ln", href: "/app/sales/o1" });
    expect(items[1].detail).toMatch(/^Was due/);
  });
});
