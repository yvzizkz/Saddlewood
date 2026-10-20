import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import AccountingFrame from "@/components/accounting/AccountingFrame";
import { Card } from "@/components/bot/ui";
import { loadPayableBill } from "@/lib/accounting/payables";
import { hrefOf } from "@/lib/analytics/drill";
import { formatValue } from "@/lib/analytics/format";
import { getViewer, viewerIsOwner } from "@/lib/crew/auth";
import { BillDetailControls } from "../../PayableActions";

export const dynamic = "force-dynamic";

const PATH = "/app/accounting/payables";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-[var(--color-stone)] py-2.5 last:border-0">
      <dt className="text-sm text-[var(--color-charcoal-light)]">{label}</dt>
      <dd className="text-right text-sm font-medium text-[var(--color-charcoal)]">{children}</dd>
    </div>
  );
}

export default async function PayableBillPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await viewerIsOwner(await getViewer()))) redirect("/app");
  const { id } = await params;
  const detail = await loadPayableBill(id);
  if (!detail) notFound();

  const { bill, payments, otherVendorBills, bidPackage } = detail;

  return (
    <AccountingFrame
      title={`${bill.vendorName} · ${bill.billNumber}`}
      intro={bill.description || `${bill.tradeLabel} · ${bill.job}`}
      crumbs={[
        { label: "Accounting", href: "/app/accounting" },
        { label: "Payables", href: PATH },
        { label: bill.vendorName, href: hrefOf(PATH, { p: "ytd", vendor: bill.vendorName }) },
        { label: bill.billNumber, href: `${PATH}/bill/${bill.id}` },
      ]}
    >
      <BillDetailControls bill={bill} />

      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-4 md:col-span-2">
          <Card className="p-4">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--color-charcoal-light)]">
                Bill & compliance summary
              </p>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  bill.status === "paid"
                    ? "bg-[#e8f2ec] text-[#2f6b4a]"
                    : bill.isOnHold
                      ? "bg-[#fae8e5] text-[#9a2a1f]"
                      : "bg-[var(--color-cream)] text-[var(--color-charcoal)]"
                }`}
              >
                {bill.statusLabel}
              </span>
            </div>
            <dl>
              <Row label="Bill number">{bill.billNumber}</Row>
              <Row label="Vendor / Subcontractor">{bill.vendorName}</Row>
              <Row label="Project">{bill.job}</Row>
              <Row label="Trade">{bill.tradeLabel}</Row>
              <Row label="Issued date">{formatValue("date", bill.issuedOn)}</Row>
              <Row label="Due date">
                {formatValue("date", bill.dueOn)} ({bill.agingBucket})
              </Row>
              <Row label="Bill total">{formatValue("money", bill.amountCents)}</Row>
              {bill.retainageCents > 0 ? (
                <Row label="10% Retainage held">{formatValue("money", bill.retainageCents)}</Row>
              ) : null}
              <Row label="Paid to date">{formatValue("money", bill.paidCents)}</Row>
              <Row label="Open AP balance">{formatValue("money", bill.balanceCents)}</Row>
              <Row label="Payment terms">{bill.paymentTermsLabel}</Row>
              {bill.holdReason ? (
                <Row label="Compliance / Approval status">
                  <span className="text-[#9a2a1f]">{bill.holdReason}</span>
                </Row>
              ) : null}
              <Row label="Lien waiver (AZ statutory)">{bill.waiverLabel}</Row>
              {bill.subId ? (
                <>
                  <Row label="Sub COI status">
                    {bill.coiStatus === "valid"
                      ? `Active${bill.coiExpiresAt ? ` (expires ${formatValue("date", bill.coiExpiresAt)})` : ""}`
                      : bill.coiStatus === "expired"
                        ? `Expired (${bill.coiExpiresAt ? formatValue("date", bill.coiExpiresAt) : "renewal needed"})`
                        : "Missing COI"}
                  </Row>
                  <Row label="W-9 on file">{bill.w9OnFile ? "Yes" : "Missing"}</Row>
                </>
              ) : null}
              {bill.notes ? <Row label="Internal notes">{bill.notes}</Row> : null}
            </dl>
          </Card>

          <Card className="p-4">
            <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--color-charcoal-light)]">
              Payments & disbursements ({payments.length})
            </p>
            {payments.length === 0 ? (
              <p className="py-4 text-sm text-[var(--color-charcoal-light)]">
                No disbursements recorded yet. Approved bills are queued for the Friday Melio / ACH run.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-y border-[var(--color-stone)] bg-[#faf7f2] text-left text-[11px] uppercase tracking-[0.08em] text-[var(--color-charcoal-light)]">
                      <th className="px-3 py-2 font-medium">Paid date</th>
                      <th className="px-3 py-2 font-medium">Method / Ref</th>
                      <th className="px-3 py-2 font-medium">Waiver collected</th>
                      <th className="px-3 py-2 text-right font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-stone)]">
                    {payments.map((p) => (
                      <tr key={p.id}>
                        <td className="px-3 py-2.5 text-[var(--color-charcoal)]">{formatValue("date", p.paidOn)}</td>
                        <td className="px-3 py-2.5">
                          <p className="font-medium text-[var(--color-charcoal)]">
                            {p.method.toUpperCase()}
                            {p.reference ? ` · ${p.reference}` : ""}
                          </p>
                          {p.note ? (
                            <p className="text-xs text-[var(--color-charcoal-light)]">{p.note}</p>
                          ) : null}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-[var(--color-charcoal-light)]">
                          {p.waiverCollected ? "Signed waiver on file" : "Pending"}
                        </td>
                        <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-[var(--color-charcoal)]">
                          {formatValue("money", p.amountCents)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="p-4">
            <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--color-charcoal-light)]">
              Connected records
            </p>
            <ul className="space-y-2 text-sm">
              <li>
                <Link className="underline underline-offset-2" href={hrefOf(PATH, { p: "ytd", vendor: bill.vendorName })}>
                  All bills from {bill.vendorName}
                </Link>
              </li>
              {bill.jobId !== "overhead" ? (
                <li>
                  <Link className="underline underline-offset-2" href={hrefOf(PATH, { p: "ytd", job: bill.jobId })}>
                    All AP bills on {bill.job}
                  </Link>
                </li>
              ) : null}
              {bill.rawCrewJobId ? (
                <>
                  <li>
                    <Link
                      className="underline underline-offset-2"
                      href={hrefOf("/app/accounting/purchases", { p: "ytd", job: bill.rawCrewJobId })}
                    >
                      Material purchases on {bill.job}
                    </Link>
                  </li>
                  <li>
                    <Link
                      className="underline underline-offset-2"
                      href={hrefOf("/app/accounting/payroll", { p: "ytd", job: bill.rawCrewJobId })}
                    >
                      Labor hours on {bill.job}
                    </Link>
                  </li>
                </>
              ) : null}
              {bill.purchaseTripKey ? (
                <li>
                  <Link
                    className="underline underline-offset-2 font-medium text-[var(--color-teal)]"
                    href={`/app/accounting/purchases/trip/${encodeURIComponent(bill.purchaseTripKey)}`}
                  >
                    Linked purchase receipt ({bill.purchaseTripKey})
                  </Link>
                </li>
              ) : null}
              {bidPackage ? (
                <li>
                  <Link className="underline underline-offset-2" href="/app/subs">
                    Awarded bid package: {bidPackage.title} ({bidPackage.status})
                  </Link>
                </li>
              ) : null}
              {bill.subId ? (
                <li>
                  <Link className="underline underline-offset-2" href="/app/subs">
                    Subcontractor profile & COI in Subs and bids
                  </Link>
                </li>
              ) : null}
            </ul>
          </Card>

          {otherVendorBills.length > 0 ? (
            <Card className="p-4">
              <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--color-charcoal-light)]">
                Other bills from {bill.vendorName}
              </p>
              <ul className="space-y-2 text-sm">
                {otherVendorBills.map((ob) => (
                  <li key={ob.id} className="flex items-baseline justify-between gap-2">
                    <Link href={`${PATH}/bill/${ob.id}`} className="truncate underline underline-offset-2">
                      {ob.billNumber} · {formatValue("date", ob.issuedOn)}
                    </Link>
                    <span className="shrink-0 font-medium tabular-nums">{formatValue("money", ob.amountCents)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      </div>
    </AccountingFrame>
  );
}
