import { describe, expect, it, vi } from "vitest";

import type { BillPaymentItem, PayableRow } from "../payables";
import { payablesRows } from "../payablesView";

// Open AP is what is owed now, whenever billed; paid is the period's payments
// out by the day they went out; and a database without 0031 shows no bills
// instead of an error.

const bill = (id: string, issuedOn: string, amountCents: number, paidCents: number) => ({ id, issuedOn, amountCents, paidCents, balanceCents: amountCents - paidCents }) as PayableRow;
const pay = (id: string, billId: string, paidOn: string, amountCents: number) => ({ id, billId, paidOn, amountCents }) as BillPaymentItem;

const rows = [bill("old", "2026-08-02", 50_000, 0), bill("new", "2026-10-14", 30_000, 10_000), bill("done", "2026-09-01", 20_000, 20_000)];
const payments = [pay("p1", "new", "2026-10-15", 10_000), pay("p2", "done", "2026-10-02", 20_000), pay("p3", "done", "2026-09-05", 0)];

describe("payablesRows", () => {
  it("open: every unpaid bill, even one issued long before the period", () => {
    const r = payablesRows(rows, payments, "open", "2026-10-13", "2026-10-19");
    expect(r.map((x) => [x.id, x.value])).toEqual([["old", 50_000], ["new", 20_000]]);
  });

  it("billed: bills issued in the period", () => {
    expect(payablesRows(rows, payments, "billed", "2026-10-01", "2026-10-31").map((x) => x.id)).toEqual(["new"]);
  });

  it("paid: payments made in the period, by the day paid, even on a bill issued earlier", () => {
    const r = payablesRows(rows, payments, "paid", "2026-10-01", "2026-10-31");
    expect(r.map((x) => [x.rowId, x.id, x.day, x.value])).toEqual([["p1", "new", "2026-10-15", 10_000], ["p2", "done", "2026-10-02", 20_000]]);
  });
});

describe("loadPayables without 0031", () => {
  it("returns no bills and says the migration is missing", async () => {
    vi.resetModules();
    const missing = { data: null, error: { message: 'relation "public.bills" does not exist' } };
    const ok = { data: [], error: null };
    const q = (res: unknown) => {
      const b: Record<string, unknown> = {};
      for (const k of ["select", "neq", "order", "is", "eq", "range"]) b[k] = () => b;
      b.then = (f: (v: unknown) => unknown) => Promise.resolve(res).then(f);
      return b;
    };
    vi.doMock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => ({ from: (t: string) => q(t === "bills" || t === "bill_payments" ? missing : ok) }) }));
    vi.doMock("../trades", async (orig) => ({ ...(await orig<typeof import("../trades")>()), listTrades: async () => [] }));
    const { loadPayables, missingPayables } = await import("../payables");
    const out = await loadPayables("2026-10-20");
    expect(out).toMatchObject({ rows: [], payments: [], missing: true });
    expect(missingPayables({ message: "Could not find the table 'public.bills' in the schema cache" })).toBe(true);
    expect(missingPayables({ message: "permission denied" })).toBe(false);
  });
});
