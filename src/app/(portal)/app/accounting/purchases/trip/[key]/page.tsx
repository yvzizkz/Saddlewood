import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import AccountingFrame from "@/components/accounting/AccountingFrame";
import { Card } from "@/components/bot/ui";
import { moneySeatForPage, seesCrewJob } from "@/lib/accounting/access";
import { loadPurchaseTrip, tripInScope } from "@/lib/accounting/purchases";
import { hrefOf } from "@/lib/analytics/drill";
import { formatValue } from "@/lib/analytics/format";
import { LineTradeSelector, TripJobAndTradeControl } from "../../PurchaseActions";

export const dynamic = "force-dynamic";

const PATH = "/app/accounting/purchases";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-[var(--color-stone)] py-2.5 last:border-0">
      <dt className="text-sm text-[var(--color-charcoal-light)]">{label}</dt>
      <dd className="text-right text-sm font-medium text-[var(--color-charcoal)]">{children}</dd>
    </div>
  );
}

export default async function PurchaseTripPage({ params }: { params: Promise<{ key: string }> }) {
  const seat = await moneySeatForPage("purchases");
  if (!seat) redirect("/app");
  const { key } = await params;
  const trip = await loadPurchaseTrip(key);
  // Every line must be on a job the seat sees, not just the first.
  if (!trip || !tripInScope(trip, (j) => seesCrewJob(seat, j))) notFound();

  return (
    <AccountingFrame
      title={`${trip.vendor} · ${formatValue("date", trip.purchasedOn)}`}
      intro={`${trip.store}${trip.orderRef ? ` · PO ${trip.orderRef}` : ""} · ${trip.lines.length} ${trip.lines.length === 1 ? "item" : "items"}`}
      sections={seat.sections}
      crumbs={[
        { label: "Accounting", href: "/app/accounting" },
        { label: "Purchases", href: PATH },
        { label: trip.vendor, href: hrefOf(PATH, { p: "ytd", vendor: trip.vendor }) },
        { label: `${formatValue("date", trip.purchasedOn)}${trip.orderRef ? ` (${trip.orderRef})` : ""}`, href: `${PATH}/trip/${encodeURIComponent(trip.tripKey)}` },
      ]}
    >
      {seat.owner ? (
        <TripJobAndTradeControl
          tripKey={trip.tripKey}
          currentJobId={trip.rawJobId}
          trades={trip.trades}
          jobs={trip.jobs}
        />
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-4 md:col-span-2">
          <div className="mb-3 flex items-baseline justify-between">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--color-charcoal-light)]">
              Receipt line items ({trip.lines.length})
            </p>
            <p className="text-base font-semibold tabular-nums text-[var(--color-charcoal)]">
              Total: {formatValue("money", trip.totalCents)}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-[var(--color-stone)] bg-[#faf7f2] text-left text-[11px] uppercase tracking-[0.08em] text-[var(--color-charcoal-light)]">
                  <th className="px-3 py-2 font-medium">Item / SKU</th>
                  <th className="px-3 py-2 font-medium">Trade</th>
                  <th className="px-3 py-2 text-right font-medium">Qty</th>
                  <th className="px-3 py-2 text-right font-medium">Unit</th>
                  <th className="px-3 py-2 text-right font-medium">Line total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-stone)]">
                {trip.lines.map((l) => (
                  <tr key={l.sourceKey}>
                    <td className="px-3 py-2.5">
                      <p className="font-medium text-[var(--color-charcoal)]">{l.description || l.sku}</p>
                      <p className="text-xs text-[var(--color-charcoal-light)]">
                        {[l.sku ? `SKU ${l.sku}` : "", l.department, l.class].filter(Boolean).join(" · ")}
                      </p>
                    </td>
                    <td className="px-3 py-2.5">
                      {seat.owner ? (
                        <LineTradeSelector
                          sourceKey={l.sourceKey}
                          currentTrade={l.trade}
                          tradeManual={l.tradeManual}
                          trades={trip.trades}
                        />
                      ) : (
                        <span className="text-xs text-[var(--color-charcoal)]">{l.tradeLabel}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-[var(--color-charcoal)]">
                      {formatValue("count", l.qty)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-[var(--color-charcoal-light)]">
                      {l.unitCents !== null ? formatValue("money", l.unitCents) : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-[var(--color-charcoal)]">
                      {formatValue("money", l.lineTotalCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="p-4">
            <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--color-charcoal-light)]">
              Receipt summary
            </p>
            <dl>
              <Row label="Date">{formatValue("date", trip.purchasedOn)}</Row>
              <Row label="Vendor">{trip.vendor}</Row>
              <Row label="Store / Yard">{trip.store}</Row>
              <Row label="PO / Order ref">{trip.orderRef || "—"}</Row>
              <Row label="Register job text">{trip.jobNameRaw || "—"}</Row>
              <Row label="Assigned project">{trip.jobName}</Row>
              {trip.runner ? <Row label="Runner / Buyer">{trip.runner}</Row> : null}
              <Row label="Trip total">{formatValue("money", trip.totalCents)}</Row>
            </dl>
          </Card>

          <Card className="p-4">
            <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--color-charcoal-light)]">
              Connected records
            </p>
            <ul className="space-y-2 text-sm">
              {trip.rawJobId ? (
                <li>
                  <Link className="underline underline-offset-2" href={hrefOf(PATH, { p: "ytd", job: trip.rawJobId })}>
                    All purchases on {trip.jobName} (YTD)
                  </Link>
                </li>
              ) : null}
              {trip.rawJobId ? (
                <li>
                  <Link
                    className="underline underline-offset-2"
                    href={hrefOf("/app/accounting/payroll", { p: "ytd", job: trip.rawJobId })}
                  >
                    Labor hours on {trip.jobName} (YTD)
                  </Link>
                </li>
              ) : null}
              <li>
                <Link className="underline underline-offset-2" href={hrefOf(PATH, { p: "ytd", vendor: trip.vendor })}>
                  All purchases from {trip.vendor}
                </Link>
              </li>
              {seat.owner && trip.linkedBill ? (
                <li>
                  <Link
                    className="underline underline-offset-2 font-medium text-[var(--color-teal)]"
                    href={`/app/accounting/payables/bill/${trip.linkedBill.id}`}
                  >
                    AP Bill {trip.linkedBill.billNumber} ({formatValue("money", trip.linkedBill.amountCents)} · {trip.linkedBill.status})
                  </Link>
                </li>
              ) : null}
            </ul>
          </Card>
        </div>
      </div>
    </AccountingFrame>
  );
}
