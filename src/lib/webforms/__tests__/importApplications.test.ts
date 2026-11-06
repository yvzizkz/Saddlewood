import { describe, expect, it } from "vitest";

import { companyKey, planImport } from "../../../../scripts/import-applications.mjs";

const NOW = new Date("2026-11-06T12:00:00Z");

const row = (over: Record<string, unknown> = {}) => ({
  date: "2026-10-20T22:12:42Z",
  company: "Wallcovering Solutions LLC",
  contact: "Nick R",
  email: "nick@wall.com",
  phone: "602-555-0108",
  trades: ["Other", "Drywall & Insulation"],
  summary: "Business: Wallcovering Solutions LLC\nLicense / ROC #: ROC #364307",
  ...over,
});

const names = (rows: { company: string }[]) => rows.map((r) => r.company);

describe("planImport", () => {
  it("keeps a row as the website form would, dated when it came in and waiting", () => {
    const { add, skip } = planImport([row()], [], NOW);
    expect(skip).toEqual([]);
    expect(add).toEqual([
      {
        form: "trade_partner",
        name: "Nick R",
        email: "nick@wall.com",
        phone: "602-555-0108",
        company: "Wallcovering Solutions LLC",
        about: "Other, Drywall & Insulation",
        summary: "Business: Wallcovering Solutions LLC\nLicense / ROC #: ROC #364307",
        status: "new",
        created_at: "2026-10-20T22:12:42.000Z",
      },
    ]);
  });

  it("takes a company's newest application, however it's spelled", () => {
    const { add, skip } = planImport(
      [row({ company: "HPM Flooring LLC", date: "2026-10-06T10:00:00Z", summary: "old" }), row({ company: "HPM FLOORING, L.L.C.", date: "2026-10-28T05:04:00Z", summary: "new" })],
      [],
      NOW,
    );
    expect(add.map((r: { summary: string }) => r.summary)).toEqual(["new"]);
    expect(skip.map((s: { why: string }) => s.why)).toEqual(["a newer application from them is going in"]);
  });

  it("adds nothing the second time: what went in is what's there", () => {
    const rows = [row(), row({ company: "Piñas Brothers Stucco and Lath LLC" })];
    const first = planImport(rows, [], NOW);
    expect(first.add).toHaveLength(2);
    expect(planImport(rows, first.add, NOW).add).toEqual([]);
    expect(planImport([row({ company: "Pinas Brothers Stucco and Lath" })], first.add, NOW).skip[0].why).toBe("already in the app");
  });

  it("skips what the page wouldn't show, so nothing goes in unseen", () => {
    const { add, skip } = planImport([row({ date: "2026-08-07T15:00:00Z" })], [], NOW);
    expect(add).toEqual([]);
    expect(skip[0].why).toBe("older than the 90 days the page shows");
  });

  it("skips a row it can't place rather than guessing", () => {
    const { add, skip } = planImport([row({ date: "soon" }), row({ company: "Other Co", summary: "" }), row({ company: "", contact: "", email: "" })], [], NOW);
    expect(add).toEqual([]);
    expect(skip.map((s: { why: string }) => s.why)).toEqual(Array(3).fill("no date, company or summary"));
  });

  it("falls back to the person, then the email, when there's no company", () => {
    const { add } = planImport([row({ company: "" }), row({ company: "", contact: "", email: "a@b.co" })], [{ company: "", name: "", email: "z@b.co" }], NOW);
    expect(add).toHaveLength(2);
    expect(planImport([row({ company: "" })], [{ company: "", name: "Nick R", email: "" }], NOW).add).toEqual([]);
  });

  it("is bounded like the form, and takes trades as text too", () => {
    const { add } = planImport([row({ phone: "1".repeat(60), trades: "Roofing", summary: "x".repeat(9000) })], [], NOW);
    expect(add[0]).toMatchObject({ about: "Roofing" });
    expect(add[0].phone).toHaveLength(40);
    expect(add[0].summary).toHaveLength(8000);
  });

  it("orders newest first, and a different company stays different", () => {
    const { add } = planImport([row({ company: "Older Co", date: "2026-09-01T00:00:00Z" }), row({ company: "Newer Pros" })], [], NOW);
    expect(names(add)).toEqual(["Newer Pros", "Older Co"]);
    expect(companyKey("A & B Drywall Inc.")).toBe(companyKey("A and B Drywall"));
  });
});
