import { describe, expect, it } from "vitest";

import type { PayableRow } from "../payables";
import { payablesRows } from "../payablesView";
import { splitBalance } from "../payablesRules";

// Retainage stays held until an owner releases it: what a bill owes splits
// into payable now (bill less retainage less paid) and retainage held, and
// Open AP, the pay run and the pay form count payable now only.

describe("splitBalance", () => {
  it("holds retainage back from what is payable now", () => {
    expect(splitBalance({ amountCents: 100_000, retainageCents: 10_000, paidCents: 0, status: "open" })).toEqual({ payableNowCents: 90_000, retainageHeldCents: 10_000, balanceCents: 100_000 });
    expect(splitBalance({ amountCents: 100_000, retainageCents: 10_000, paidCents: 40_000, status: "partial" })).toEqual({ payableNowCents: 50_000, retainageHeldCents: 10_000, balanceCents: 60_000 });
  });

  it("leaves only retainage once the rest is paid, and shrinks it as it is released", () => {
    expect(splitBalance({ amountCents: 100_000, retainageCents: 10_000, paidCents: 90_000, status: "partial" })).toEqual({ payableNowCents: 0, retainageHeldCents: 10_000, balanceCents: 10_000 });
    expect(splitBalance({ amountCents: 100_000, retainageCents: 10_000, paidCents: 95_000, status: "partial" })).toEqual({ payableNowCents: 0, retainageHeldCents: 5_000, balanceCents: 5_000 });
  });

  it("owes nothing on a paid or void bill, and nothing extra without retainage", () => {
    expect(splitBalance({ amountCents: 100_000, retainageCents: 10_000, paidCents: 0, status: "paid" }).balanceCents).toBe(0);
    expect(splitBalance({ amountCents: 50_000, retainageCents: 0, paidCents: 0, status: "open" })).toEqual({ payableNowCents: 50_000, retainageHeldCents: 0, balanceCents: 50_000 });
  });
});

describe("Open AP", () => {
  it("counts payable now, and keeps a bill owing only retainage listed at 0", () => {
    const row = (id: string, balanceCents: number, payableNowCents: number) => ({ id, issuedOn: "2026-10-01", balanceCents, payableNowCents, retainageHeldCents: balanceCents - payableNowCents }) as PayableRow;
    const r = payablesRows([row("a", 100_000, 90_000), row("b", 10_000, 0), row("c", 0, 0)], [], "open", "2026-10-01", "2026-10-31");
    expect(r.map((x) => [x.id, x.value, x.retainageHeldCents])).toEqual([["a", 90_000, 10_000], ["b", 0, 10_000]]);
  });
});
