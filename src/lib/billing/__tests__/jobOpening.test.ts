import { describe, expect, it } from "vitest";

import { summarizeJobMoney } from "../jobMoney";
import { jobMargin, openingItem, openingProblem, type JobOpening } from "../jobOpening";

const POWELL: JobOpening = { settledCents: 61_317_283, asOf: "2026-10-30", source: "Powell tracker #3526-12", enteredBy: "o@x", enteredAt: "2026-11-05T00:00:00Z" };
const OK = { settledCents: 100, asOf: "2026-10-30", source: "x", contractCents: 200 };

describe("margin on a job with an opening", () => {
  it("stays on what the app billed: Powell with $50,000 of cost is -$20,000, not $593,172.83", () => {
    const m = jobMargin({ billedCents: 64_317_283, settledCents: 61_317_283, costCents: 5_000_000 });
    expect(m).toEqual({ cents: -2_000_000, pct: -67, appOnly: true });
  });

  it("is the same with or without the opening", () => {
    const without = jobMargin({ billedCents: 3_000_000, settledCents: 0, costCents: 5_000_000 });
    expect(without).toEqual({ cents: -2_000_000, pct: -67, appOnly: false });
  });

  it("has no percent with nothing billed in the app, opening or not", () => {
    expect(jobMargin({ billedCents: 61_317_283, settledCents: 61_317_283, costCents: 100 })).toEqual({ cents: -100, pct: null, appOnly: true });
    expect(jobMargin({ billedCents: 0, settledCents: 0, costCents: 0 }).pct).toBeNull();
  });
});

describe("a job's opening", () => {
  it("adds to Billed and Paid and never to what's owed", () => {
    const bill = { number: "3526-13", title: "Draw", documentId: "d", lineIndex: null, billedCents: 3_000_000, paidCents: 0, dueOn: null, payWhenPaid: false };
    const m = summarizeJobMoney("j", [bill, openingItem(POWELL)!], 81_798_097, "2026-11-04");
    expect(m).toMatchObject({ billedCents: 64_317_283, paidCents: 61_317_283, owedCents: 3_000_000, contractCents: 81_798_097 });
    expect(m.open.map((o) => o.number)).toEqual(["3526-13"]);
  });

  it("carries nothing when there's no figure", () => {
    expect(openingItem(null)).toBeNull();
    expect(openingItem({ ...POWELL, settledCents: 0 })).toBeNull();
  });

  it("refuses a future date, more than the contract, and a bill it would count twice", () => {
    expect(openingProblem(OK, "2026-11-04", [])).toBeNull();
    expect(openingProblem({ ...OK, contractCents: null }, "2026-11-04", [])).toBeNull();
    expect(openingProblem({ ...OK, asOf: "2026-11-05" }, "2026-11-04", [])).toMatch(/future/);
    expect(openingProblem({ ...OK, contractCents: 99 }, "2026-11-04", [])).toMatch(/more than the contract/);
    expect(openingProblem(OK, "2026-11-04", ["3526-13"])).toMatch(/3526-13 would count twice/);
  });
});
