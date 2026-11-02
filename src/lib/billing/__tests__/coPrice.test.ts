import { describe, expect, it } from "vitest";

import { applyPrices, coEmail, coFollowUpEmail, defaultTo, parseDollars, readPriceEdit, sendBlockers } from "../coPrice";
import type { DocumentSnapshot } from "../types";

const DRAFT: DocumentSnapshot = {
  billTo: { name: "AFT", attention: "Chris Turner (AFT)" },
  job: { name: "Jury Residence" },
  date: "2026-10-30",
  lines: [
    { description: "Hold-Downs at Revised Shear Wall", quantity: 10, unit: "ea", amountCents: 0, note: "Set in epoxy per SK8." },
    { description: "3/4\" Plywood at Hallway", amountCents: 0, note: "Approximately ______ sq ft." },
    { description: "Materials", amountCents: 0 },
  ],
  notIncluded: [{ description: "Paneling", note: "By others" }],
  note: "Requested by Chris Turner (AFT).",
};

describe("Price it: the draft with the owner's prices", () => {
  it("prices each line and keeps who, where, quantities and what is not included", () => {
    const s = applyPrices(DRAFT, {
      title: "Shear wall",
      lines: [
        { description: "Hold-Downs at Revised Shear Wall", note: "Set in epoxy per SK8.", amountCents: 180000 },
        { description: "3/4\" Plywood at Hallway", note: "Approximately 120 sq ft.", amountCents: 120000 },
        { description: "Materials", amountCents: 0, noCharge: true },
      ],
    });
    expect(s.lines).toEqual([
      { description: "Hold-Downs at Revised Shear Wall", quantity: 10, unit: "ea", amountCents: 180000, note: "Set in epoxy per SK8." },
      { description: "3/4\" Plywood at Hallway", amountCents: 120000, note: "Approximately 120 sq ft." },
      { description: "Materials", amountCents: 0, noCharge: true },
    ]);
    expect(s.billTo).toEqual(DRAFT.billTo);
    expect(s.notIncluded).toEqual(DRAFT.notIncluded);
    expect(s.note).toBe(DRAFT.note);
  });

  it("a line marked no charge is $0 whatever was typed", () => {
    const s = applyPrices(DRAFT, { title: "x", lines: DRAFT.lines!.map((l) => ({ description: l.description, amountCents: 5000, noCharge: true })) });
    expect(s.lines!.map((l) => [l.amountCents, l.noCharge])).toEqual([[0, true], [0, true], [0, true]]);
  });
});

describe("Price it: what blocks Send", () => {
  it("names every $0 line not marked no charge, and every blank left to fill", () => {
    expect(sendBlockers("Shear wall", DRAFT)).toEqual([
      "Line 1 has no price. Price it, or mark it no charge.",
      "Line 2 has no price. Price it, or mark it no charge.",
      "Line 2 still has a blank to fill.",
      "Line 3 has no price. Price it, or mark it no charge.",
    ]);
  });

  it("is clear once every line is priced or no charge and the blanks are filled", () => {
    const s = applyPrices(DRAFT, {
      title: "Shear wall",
      lines: [
        { description: "Hold-downs", amountCents: 180000 },
        { description: "Plywood", note: "Approximately 120 sq ft.", amountCents: 120000 },
        { description: "Materials", amountCents: 0, noCharge: true },
      ],
    });
    expect(sendBlockers("Shear wall", s)).toEqual([]);
    expect(sendBlockers("Shear wall at ___", s)).toEqual(["Fill the blank in the title."]);
    expect(sendBlockers("Shear wall", { ...s, note: "Per SK___" })).toEqual(["The note still has a blank to fill."]);
  });
});

describe("Price it: who it goes to and what it says", () => {
  const contacts = [
    { name: "Vanessa Winters", email: "ap.aft@example.com", role: "ap" },
    { name: "Chris Turner", email: "chris@aft.example", role: "pm" },
  ];

  it("goes to the person who asked when they are on file, else the first contact", () => {
    expect(defaultTo(contacts, "Chris Turner (AFT)")).toEqual(["chris@aft.example"]);
    expect(defaultTo(contacts, "Someone Else")).toEqual(["ap.aft@example.com"]);
    expect(defaultTo([], "Chris Turner")).toEqual([]);
  });

  it("is short: the number, what, where, how much", () => {
    const e = coEmail({ number: "8009-CO10", title: "Shear Wall Revision", job: "Jury Residence", totalCents: 300000, to: contacts[1] });
    expect(e.subject).toBe("Change order 8009-CO10: Shear Wall Revision (Jury Residence)");
    expect(e.body.split("\n")[0]).toBe("Hi Chris,");
    expect(e.body).toContain("8009-CO10 for Shear Wall Revision at Jury Residence, $3,000.00");
  });
});

describe("Price it: reading the screen's Save", () => {
  it("takes prices in whole cents and refuses what a change order does not have", () => {
    expect(readPriceEdit({ title: "Shear wall", lines: [{ description: "Hold-downs", amountCents: 180000 }] })).toEqual({ ok: true, value: { title: "Shear wall", lines: [{ description: "Hold-downs", amountCents: 180000 }] } });
    expect(readPriceEdit({ title: "x", lines: [{ description: "a", amountCents: 12.5 }] })).toMatchObject({ ok: false });
    expect(readPriceEdit({ title: "x", lines: [{ description: "a", amountCents: -100 }] })).toMatchObject({ ok: false });
    expect(readPriceEdit({ title: "x", lines: [{ description: "a", amountCents: 1, status: "sent" }] })).toMatchObject({ ok: false, error: "line 1: status is not part of a line" });
    expect(readPriceEdit({ title: "x", number: "CO-1", lines: [{ description: "a", amountCents: 1 }] })).toMatchObject({ ok: false, error: "number is not something a change order has" });
  });

  it("reads dollars as typed on a phone", () => {
    expect(parseDollars("$1,250.50")).toBe(125050);
    expect(parseDollars("1800")).toBe(180000);
    expect(parseDollars("")).toBe(0);
    expect(parseDollars("12.345")).toBeNull();
    expect(parseDollars("abc")).toBeNull();
  });
});

describe("a line marked no charge, as every draft is read", () => {
  it("is kept on a $0 line and refused on a priced one", async () => {
    const { readSnapshot } = await import("../drafts");
    expect(readSnapshot({ lines: [{ description: "Materials", amountCents: 0, noCharge: true }] })).toEqual({ ok: true, value: { lines: [{ description: "Materials", amountCents: 0, noCharge: true }] } });
    expect(readSnapshot({ lines: [{ description: "Materials", amountCents: 500, noCharge: true }] })).toEqual({ ok: false, error: "snapshot.lines[0] is marked no charge but has a price" });
    expect(readSnapshot({ lines: [{ description: "Materials", amountCents: 0, noCharge: "yes" }] })).toMatchObject({ ok: false });
  });
});

describe("coFollowUpEmail", () => {
  it("says which change order, what it comes to and when it went", () => {
    const m = coFollowUpEmail({ number: "8009-CO50", title: "Shear wall", job: "8009 N Ironwood Dr", totalCents: 310050, sentOn: "2026-10-30", to: { name: "Chris Turner", email: "c@x", role: "" } });
    expect(m.subject).toBe("Following up: change order 8009-CO50, Shear wall (8009 N Ironwood Dr)");
    expect(m.body).toMatch(/^Hi Chris,/);
    expect(m.body).toContain("$3,100.50, which we sent on October 30.");
  });
});
