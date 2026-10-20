import Link from "next/link";
import { redirect } from "next/navigation";

import AccountingFrame from "@/components/accounting/AccountingFrame";
import DataTable, { type Column, type TableRow } from "@/components/data/DataTable";
import KpiHeader from "@/components/data/KpiHeader";
import { loadPayables, type PayableRow } from "@/lib/accounting/payables";
import { drill, hrefOf, type DrillSpec } from "@/lib/analytics/drill";
import { formatValue } from "@/lib/analytics/format";
import { inRange, periodParams, resolvePeriod } from "@/lib/analytics/period";
import { getViewer, viewerIsOwner } from "@/lib/crew/auth";
import { ComplianceHoldBanner } from "./PayableActions";

export const dynamic = "force-dynamic";

const PATH = "/app/accounting/payables";

type SP = Record<string, string | string[] | undefined>;
type Measure = "open" | "billed" | "paid";

export default async function PayablesPage({ searchParams }: { searchParams: Promise<SP> }) {
  if (!(await viewerIsOwner(await getViewer()))) redirect("/app");
  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]?.[0] : (sp[k] as string | undefined));
  const period = resolvePeriod({ p: one("p"), from: one("from"), to: one("to") }, undefined, "mtd");
  const mParam = one("m");
  const measure: Measure = mParam === "billed" || mParam === "paid" ? mParam : "open";

  const { rows: allRows, fridayCutoff } = await loadPayables();
  const now = allRows.filter((r) => inRange(r.issuedOn, period.from, period.to));
  const before = allRows.filter((r) => inRange(r.issuedOn, period.previous.from, period.previous.to));

  const spec: DrillSpec<PayableRow> = {
    path: PATH,
    title: "Payables",
    dims: [
      { key: "vendor", label: "Vendor / Sub", plural: "vendors", of: (r) => ({ key: r.vendorName, label: r.vendorName }) },
      { key: "job", label: "Project", plural: "projects", of: (r) => ({ key: r.jobId, label: r.job }) },
      { key: "trade", label: "Trade", plural: "trades", of: (r) => ({ key: r.trade, label: r.tradeLabel }), trades: true },
      { key: "aging", label: "Aging", plural: "aging buckets", of: (r) => ({ key: r.agingBucket, label: r.agingBucket }) },
    ],
    value:
      measure === "billed"
        ? (r) => r.amountCents
        : measure === "paid"
          ? (r) => r.paidCents
          : (r) => r.balanceCents,
    dayOf: (r) => r.issuedOn,
  };

  const d = drill(spec, now, period, sp, { previousRows: before });
  if (measure !== "open") {
    for (const o of d.byOptions) o.href = `${o.href}&m=${measure}`;
    for (const s of d.breakdown.slices) if (s.href) s.href = `${s.href}&m=${measure}`;
  }

  const openCents = d.rows.reduce((a, r) => a + r.balanceCents, 0);
  const billedCents = d.rows.reduce((a, r) => a + r.amountCents, 0);
  const paidCents = d.rows.reduce((a, r) => a + r.paidCents, 0);
  const dueFridayCents = d.rows.filter((r) => r.dueByFriday && !r.isOnHold).reduce((a, r) => a + r.balanceCents, 0);
  const heldBills = d.rows.filter((r) => r.isOnHold && r.balanceCents > 0);
  const onHoldCents = heldBills.reduce((a, r) => a + r.balanceCents, 0);

  const base = {
    ...periodParams(period),
    ...Object.fromEntries(d.filters.map((f) => [f.dim, f.key])),
    ...(measure !== "open" ? { m: measure } : {}),
  };

  const tableRows: TableRow[] = d.rows.map((r) => {
    const billHref = `${PATH}/bill/${r.id}`;
    const complianceFlags = [
      r.holdReason ? r.holdReason : "",
      r.waiverStatus !== "not_required" ? r.waiverLabel : "",
      r.coiStatus === "expired" ? "COI expired" : r.coiStatus === "missing" ? "COI missing" : "",
      r.retainageCents > 0 ? `Retainage ${formatValue("money", r.retainageCents)}` : "",
    ]
      .filter(Boolean)
      .join(" · ");

    return {
      id: r.id,
      issuedOn: r.issuedOn,
      dueOn: r.dueOn,
      vendor: r.vendorName,
      vendorSub: `${r.billNumber} · ${r.description}`,
      vendorHref: hrefOf(PATH, { ...base, vendor: r.vendorName }),
      billHref,
      job: r.job,
      jobHref: hrefOf(PATH, { ...base, job: r.jobId }),
      trade: r.tradeLabel,
      tradeHref: hrefOf(PATH, { ...base, trade: r.trade }),
      status: r.statusLabel,
      complianceSub: complianceFlags || r.paymentTermsLabel,
      aging: r.agingBucket,
      amount: r.amountCents,
      paid: r.paidCents,
      balance: r.balanceCents,
      href: billHref,
    };
  });

  const columns: Column[] = [
    { key: "dueOn", header: "Due", kind: "date", phone: "detail" },
    { key: "vendor", header: "Vendor / Sub", kind: "text", filter: true, subKey: "vendorSub", hrefKey: "billHref", phone: "title" },
    { key: "job", header: "Project", kind: "text", filter: true, hrefKey: "jobHref" },
    { key: "trade", header: "Trade", kind: "text", filter: true, hrefKey: "tradeHref" },
    { key: "status", header: "Status", kind: "text", filter: true, subKey: "complianceSub" },
    { key: "aging", header: "Aging", kind: "text", filter: true, phone: "hide" },
    { key: "amount", header: "Billed", kind: "money", total: true, phone: "hide" },
    { key: "paid", header: "Paid", kind: "money", total: true, phone: "detail" },
    { key: "balance", header: "Open AP", kind: "money", total: true, phone: "value" },
  ];

  const toggleMeasure = (m: Measure) =>
    hrefOf(PATH, { ...d.params, m: m === "open" ? undefined : m });

  const headlineValue = measure === "billed" ? billedCents : measure === "paid" ? paidCents : openCents;
  const headlineLabel =
    measure === "billed" ? "Bills received" : measure === "paid" ? "Disbursed (Melio / ACH)" : "Open accounts payable";

  return (
    <AccountingFrame
      title="Accounts payable"
      intro="Subcontractor progress bills and supplier invoices — gated on PM verification, active COI and conditional lien waivers before the Friday Melio run."
      period={period}
      crumbs={[{ label: "Accounting", href: "/app/accounting" }, ...d.crumbs]}
      filters={d.filters}
      actions={
        <div
          className="flex rounded-xl border border-[var(--color-stone)] bg-[var(--color-cream)] p-1 text-[13px] font-medium"
          role="group"
          aria-label="Payables measure"
        >
          {(
            [
              ["open", "Open AP"],
              ["billed", "Billed"],
              ["paid", "Paid"],
            ] as const
          ).map(([m, label]) => (
            <Link
              key={m}
              href={toggleMeasure(m)}
              scroll={false}
              aria-current={measure === m ? "true" : undefined}
              className={`rounded-lg px-3 py-1.5 ${
                measure === m ? "bg-white text-[var(--color-charcoal)] shadow-sm" : "text-[var(--color-charcoal-light)]"
              }`}
            >
              {label}
            </Link>
          ))}
        </div>
      }
    >
      <KpiHeader
        label={headlineLabel}
        value={headlineValue}
        kind="money"
        change={d.change}
        upIsGood={false}
        compareLabel={period.previous.label}
        stats={[
          {
            label: "Ready for Friday run",
            value: dueFridayCents,
            kind: "money",
            hint: `Due by ${formatValue("date", fridayCutoff)}`,
          },
          {
            label: "On hold (waiver/COI)",
            value: onHoldCents,
            kind: "money",
            hint: heldBills.length > 0 ? `${heldBills.length} blocked` : "All clear",
          },
          {
            label: "Paid in period",
            value: paidCents,
            kind: "money",
            hint: "Melio / ACH / Check",
          },
          {
            label: "Total billed",
            value: billedCents,
            kind: "money",
            hint: `${d.rows.length} ${d.rows.length === 1 ? "bill" : "bills"}`,
          },
        ]}
        trend={d.trend}
        trendLabel={period.grain === "day" ? "Per day" : period.grain === "week" ? "Per week" : "Per month"}
        breakdown={d.breakdown}
        byOptions={d.byOptions}
      />

      {heldBills.length > 0 ? <ComplianceHoldBanner heldBills={heldBills} /> : null}

      <DataTable
        rows={tableRows}
        columns={columns}
        searchKeys={["vendor", "vendorSub", "job", "trade", "status", "complianceSub", "aging"]}
        name={`payables-${measure}-${period.key}`}
        rowHrefKey="href"
        initialSort={{ key: "dueOn", dir: "asc" }}
        empty="No vendor or subcontractor bills in this period."
      />
    </AccountingFrame>
  );
}
