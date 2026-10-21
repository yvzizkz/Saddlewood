// The rows the Payables page measures, per measure (pure, for tests):
//   open    every unpaid bill, whenever it was issued, valued at what is
//           payable now (retainage held is shown apart, paid on release), as
//           Receivables and the Overview count it
//   billed  bills issued in the period
//   paid    payments out made in the period, one row per payment, dated by
//           when it was paid (not when the bill came in)

import { inRange } from "@/lib/analytics/period";
import type { BillPaymentItem, PayableRow } from "./payables";

export type Measure = "open" | "billed" | "paid";
export type ApRow = PayableRow & { rowId: string; day: string; value: number };

export function payablesRows(rows: PayableRow[], payments: BillPaymentItem[], measure: Measure, from: string, to: string): ApRow[] {
  // Open AP is payable now; a bill that owes only retainage stays listed at 0 so its held retainage shows.
  if (measure === "open") return rows.filter((r) => r.balanceCents > 0).map((r) => ({ ...r, rowId: r.id, day: r.issuedOn, value: r.payableNowCents }));
  if (measure === "billed") return rows.filter((r) => inRange(r.issuedOn, from, to)).map((r) => ({ ...r, rowId: r.id, day: r.issuedOn, value: r.amountCents }));
  const byId = new Map(rows.map((r) => [r.id, r]));
  const out: ApRow[] = [];
  for (const p of payments) {
    const bill = byId.get(p.billId);
    if (!bill || !inRange(p.paidOn, from, to)) continue;
    out.push({ ...bill, rowId: p.id, day: p.paidOn, value: p.amountCents });
  }
  return out;
}
