import { describe, expect, it } from "vitest";

import type { Submission } from "@/lib/webforms/store";
import { findSub, subFromApplication } from "../fromApplication";
import type { Sub } from "../types";
import { readSubInput } from "../validate";

const application = (over: Partial<Submission> = {}): Submission => ({
  id: 1,
  form: "trade_partner",
  name: "Nick R",
  email: "nick@wall.com",
  phone: "602-555-0108",
  company: "Wallcovering Solutions LLC",
  about: "Drywall & Insulation, Other",
  summary: "Business: Wallcovering Solutions LLC\nLicense / ROC #: ROC #364307\nService area: All of Arizona",
  status: "new",
  createdAt: "2026-10-20T22:12:42Z",
  ...over,
});

const sub = (over: Partial<Sub>): Sub => ({ id: "s1", name: "Other Co", email: "", rocLicense: "", contacts: [], ...over }) as Sub;

describe("subFromApplication", () => {
  it("is a prospect with the directory's trades, the license and a primary contact", () => {
    const input = readSubInput(subFromApplication(application()));
    expect(input.ok && input.value).toMatchObject({
      name: "Wallcovering Solutions LLC",
      status: "prospect",
      trades: ["drywall", "insulation"],
      rocLicense: "ROC #364307",
      email: "nick@wall.com",
      contacts: [{ name: "Nick R", email: "nick@wall.com", phone: "602-555-0108", isPrimary: true }],
    });
    expect(input.ok && input.value.rocVerified).toBeUndefined();
  });

  it("keeps everything else on the note, and a trade the list doesn't know as typed", () => {
    const s = subFromApplication(application({ about: "Pools & Water Features, Scaffolding" }));
    expect(s.trades).toEqual(["pools", "scaffolding"]);
    expect(s.note).toContain("Service area: All of Arizona");
    expect(s.note).toContain("2026-10-20");
  });

  it("survives what a public form can send", () => {
    const input = readSubInput(subFromApplication(application({ email: "not an email", summary: "x".repeat(8000), company: "y".repeat(200) })));
    expect(input.ok).toBe(true);
    expect(input.ok && input.value.email).toBe("");
    expect(input.ok && input.value.note.length).toBeLessThanOrEqual(2000);
  });

  it("falls back to the person's name with no company", () => {
    expect(subFromApplication(application({ company: "" })).name).toBe("Nick R");
  });
});

describe("findSub", () => {
  it("knows a company however it's spelled", () => {
    expect(findSub(application(), [sub({ name: "WALLCOVERING SOLUTIONS, L.L.C." })])?.id).toBe("s1");
    expect(findSub(application({ company: "A & B Drywall Inc." }), [sub({ name: "A and B Drywall" })])?.id).toBe("s1");
  });

  it("knows it by license digits, or by the email on the sub or a contact", () => {
    expect(findSub(application(), [sub({ rocLicense: "364307" })])?.id).toBe("s1");
    expect(findSub(application(), [sub({ email: "nick@wall.com" })])?.id).toBe("s1");
    expect(findSub(application(), [sub({ contacts: [{ email: "nick@wall.com" } as Sub["contacts"][number]] })])?.id).toBe("s1");
  });

  it("doesn't match on nothing: a blank email, a short license, a name that's only LLC", () => {
    const blank = application({ email: "", company: "LLC", name: "", summary: "License / ROC #: 12" });
    expect(findSub(blank, [sub({ name: "Inc", email: "", rocLicense: "12" })])).toBeNull();
  });

  it("a different company stays different", () => {
    expect(findSub(application(), [sub({ name: "Wallcovering Pros LLC", rocLicense: "111111", email: "a@b.co" })])).toBeNull();
  });
});
