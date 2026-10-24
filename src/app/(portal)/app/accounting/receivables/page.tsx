import Link from "next/link";
import { redirect } from "next/navigation";

import AccountingFrame from "@/components/accounting/AccountingFrame";
import DataTable, { type Column, type TableRow } from "@/components/data/DataTable";
import KpiHeader from "@/components/data/KpiHeader";
import { drill, hrefOf, type DrillSpec } from "@/lib/analytics/drill";
import { inRange, periodParams, resolvePeriod } from "@/lib/analytics/period";
import { AGE_BUCKETS, loadCollected, loadOpenReceivables, type CollectedRow, type OpenRow } from "@/lib/accounting/receivables";
import { moneySeatForPage, seesBillingJob } from "@/lib/accounting/access";

export const dynamic = "force-dynamic";

// Receivables: who owes us, how late, and what is next on the collection
// ladder (Open), or what came in during a period (Collected). Each invoice
// opens its own page in Money, with the payments and the proof record.

const PATH = "/app/accounting/receivables";
type SP = Record<string, string | string[] | undefined>;

export default async function ReceivablesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const seat = await moneySeatForPage("receivables");
  if (!seat) redirect("/app");
  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]?.[0] : (sp[k] as string | undefined));
  const mode = one("m") === "collected" ? "collected" : "open";
  const modeHref = (m: "open" | "collected") => hrefOf(PATH, { p: one("p"), from: one("from"), to: one("to"), m: m === "collected" ? "collected" : undefined });

  const switcher = (
    <div className="flex rounded-xl border border-[var(--color-stone)] bg-[var(--color-cream)] p-1 text-[13px] font-medium" role="group" aria-label="Show">
      {(["open", "collected"] as const).map((m) => (
        <Link
          key={m}
          href={modeHref(m)}
          scroll={false}
          aria-current={mode === m ? "true" : undefined}
          className={`rounded-lg px-3 py-1.5 ${mode === m ? "bg-white text-[var(--color-charcoal)] shadow-sm" : "text-[var(--color-charcoal-light)]"}`}
        >
          {m === "open" ? "Open" : "Collected"}
        </Link>
      ))}
    </div>
  );

  if (mode === "collected") {
    const period = resolvePeriod({ p: one("p"), from: one("from"), to: one("to") }, undefined, "mtd");
    const rows = (await loadCollected(period.previous.from, period.to)).filter((r) => seesBillingJob(seat, r.jobId));
    const spec: DrillSpec<CollectedRow> = {
      path: PATH,
      title: "Collected",
      dims: [
        { key: "client", label: "Client", plural: "clients", of: (r) => ({ key: r.clientId, label: r.client }) },
        { key: "job", label: "Job", plural: "jobs", of: (r) => (r.jobId ? { key: r.jobId, label: r.job } : null) },
        { key: "method", label: "Method", plural: "methods", of: (r) => ({ key: r.method, label: r.method.toUpperCase() === "ACH" ? "ACH" : r.method[0].toUpperCase() + r.method.slice(1) }) },
      ],
      value: (r) => r.amountCents,
      dayOf: (r) => r.receivedOn,
    };
    const d = drill(
      spec,
      rows.filter((r) => inRange(r.receivedOn, period.from, period.to)),
      period,
      sp,
      { previousRows: rows.filter((r) => inRange(r.receivedOn, period.previous.from, period.previous.to)) },
    );
    const withMode = (h: string) => `${h}${h.includes("?") ? "&" : "?"}m=collected`;
    for (const o of d.byOptions) o.href = withMode(o.href);
    for (const s of d.breakdown.slices) if (s.href) s.href = withMode(s.href);
    const crumbs = d.crumbs.map((c) => ({ ...c, href: withMode(c.href) }));
    const filters = d.filters.map((f) => ({ ...f, clearHref: withMode(f.clearHref) }));
    const fees = d.rows.reduce((a, r) => a + r.feeCents, 0);
    const payments = new Set(d.rows.map((r) => r.paymentId)).size;

    const tableRows: TableRow[] = d.rows.map((r) => ({
      id: r.id,
      day: r.receivedOn,
      client: r.client,
      job: r.job,
      number: r.number || "Not placed",
      numberHref: r.documentId ? `/app/money/${r.documentId}` : null,
      method: r.method,
      reference: r.reference,
      recordedIn: r.recordedIn,
      amount: r.amountCents,
      fee: r.feeCents || null,
    }));
    const columns: Column[] = [
      { key: "day", header: "Received", kind: "date", phone: "detail" },
      { key: "client", header: "Client", kind: "text", filter: true, phone: "title" },
      { key: "job", header: "Job", kind: "text", filter: true },
      { key: "number", header: "Invoice", kind: "text", hrefKey: "numberHref" },
      { key: "method", header: "Method", kind: "text", filter: true },
      { key: "reference", header: "Reference", kind: "text", phone: "hide" },
      { key: "recordedIn", header: "Recorded", kind: "text", filter: true, phone: "hide" },
      { key: "amount", header: "Amount", kind: "money", total: true, phone: "value" },
      { key: "fee", header: "Fee", kind: "money", total: true, phone: "hide" },
    ];
    return (
      <AccountingFrame sections={seat.sections} title="Receivables" intro="Payments received, placed on the invoices they paid. Melio's fee is shown apart: the gross is what the client paid." period={period} crumbs={[{ label: "Accounting", href: "/app/accounting" }, { label: "Receivables", href: PATH }, ...crumbs]} filters={filters} actions={switcher}>
        <KpiHeader
          label="Collected"
          value={d.total}
          kind="money"
          change={d.change}
          upIsGood
          compareLabel={period.previous.label}
          stats={[
            { label: "Payments", value: payments, kind: "count" },
            { label: "Fees", value: fees, kind: "money" },
            { label: "Net", value: d.total - fees, kind: "money" },
          ]}
          trend={d.trend}
          trendLabel="Received"
          breakdown={d.breakdown}
          byOptions={d.byOptions}
        />
        <DataTable rows={tableRows} columns={columns} searchKeys={["client", "job", "number", "reference", "method"]} name={`collected-${period.key}`} initialQuery={one("q") ?? ""} initialSort={{ key: "day", dir: "desc" }} empty="No payments in this period." />
      </AccountingFrame>
    );
  }

  // Open: a snapshot as of today. The trend shows what is still open by the month it was billed.
  const open = await loadOpenReceivables();
  const today = open.today;
  const rows = open.rows.filter((r) => seesBillingJob(seat, r.jobId));
  const year = resolvePeriod({ p: "ytd" }, today);
  const trendPeriod = { ...year, from: rows.reduce((m, r) => (r.issuedOn && r.issuedOn < m ? r.issuedOn : m), year.from) };
  trendPeriod.grain = "month";
  const spec: DrillSpec<OpenRow> = {
    path: PATH,
    title: "Open",
    dims: [
      { key: "client", label: "Client", plural: "clients", of: (r) => ({ key: r.clientId, label: r.client }) },
      { key: "job", label: "Job", plural: "jobs", of: (r) => (r.jobId ? { key: r.jobId, label: r.job } : null) },
      { key: "age", label: "Age", plural: "ages", of: (r) => ({ key: r.age, label: r.ageLabel }) },
    ],
    value: (r) => r.balanceCents,
    dayOf: (r) => r.issuedOn,
  };
  const d = drill(spec, rows, trendPeriod, sp);
  // The open view has no period: keep the links clean of one.
  const strip = (h: string) => h.replace(/([?&])(p|from|to)=[^&]*&?/g, "$1").replace(/[?&]$/, "");
  for (const o of d.byOptions) o.href = strip(o.href);
  for (const s of d.breakdown.slices) if (s.href) s.href = strip(s.href);
  const crumbs = d.crumbs.map((c) => ({ ...c, href: strip(c.href) }));
  const filters = d.filters.map((f) => ({ ...f, clearHref: strip(f.clearHref) }));
  // Age reads oldest last, not biggest first.
  if (d.breakdown.dim.key === "age") d.breakdown.slices.sort((a, b) => AGE_BUCKETS.findIndex((x) => x.key === a.key) - AGE_BUCKETS.findIndex((x) => x.key === b.key));

  const late = d.rows.filter((r) => (r.daysLate ?? 0) > 0 && !r.payWhenPaid);
  const lateCents = late.reduce((a, r) => a + r.balanceCents, 0);
  const over30 = d.rows.filter((r) => (r.daysLate ?? 0) > 30).reduce((a, r) => a + r.balanceCents, 0);
  const notViewed = d.rows.filter((r) => r.standing === "Not viewed" || r.standing === "Bounced").length;
  const base = Object.fromEntries(d.filters.map((f) => [f.dim, f.key]));

  const tableRows: TableRow[] = d.rows.map((r) => ({
    id: r.id,
    number: r.number,
    href: `/app/money/${r.id}`,
    title: r.title,
    client: r.client,
    clientHref: hrefOf(PATH, { ...base, client: r.clientId }),
    job: r.job,
    jobHref: r.jobId ? hrefOf(PATH, { ...base, job: r.jobId }) : null,
    issued: r.issuedOn,
    due: r.dueOn,
    late: r.daysLate && r.daysLate > 0 ? r.daysLate : null,
    age: r.ageLabel,
    standing: r.standing,
    next: r.next,
    total: r.totalCents,
    paid: r.paidCents,
    balance: r.balanceCents,
  }));
  const columns: Column[] = [
    { key: "number", header: "Invoice", kind: "text", hrefKey: "href", subKey: "title", phone: "title" },
    { key: "client", header: "Client", kind: "text", filter: true, hrefKey: "clientHref" },
    { key: "job", header: "Job", kind: "text", filter: true, hrefKey: "jobHref" },
    { key: "issued", header: "Issued", kind: "date", phone: "hide" },
    { key: "due", header: "Due", kind: "date" },
    { key: "late", header: "Days late", kind: "count" },
    { key: "age", header: "Age", kind: "text", filter: true, phone: "hide" },
    { key: "standing", header: "Proof", kind: "text", filter: true },
    { key: "next", header: "Next step", kind: "text", phone: "hide" },
    { key: "total", header: "Billed", kind: "money", total: true, phone: "hide" },
    { key: "paid", header: "Paid", kind: "money", total: true, phone: "hide" },
    { key: "balance", header: "Open", kind: "money", total: true, phone: "value" },
  ];

  return (
    <AccountingFrame
      sections={seat.sections}
      title="Receivables"
      intro="Every issued invoice, change order and statement with money still owed, as of today."
      crumbs={[{ label: "Accounting", href: "/app/accounting" }, { label: "Receivables", href: PATH }, ...crumbs.slice(1)]}
      filters={filters}
      actions={switcher}
    >
      <KpiHeader
        label="Open receivables"
        value={d.total}
        kind="money"
        change={null}
        stats={[
          { label: "Past due", value: lateCents, kind: "money", hint: `${late.length} invoice${late.length === 1 ? "" : "s"}` },
          { label: "Over 30 days", value: over30, kind: "money" },
          { label: "Not viewed", value: notViewed, kind: "count", hint: "resend, confirm receipt" },
          { label: "Invoices", value: d.rows.length, kind: "count" },
        ]}
        trend={d.trend}
        trendLabel="Still open, by month billed"
        breakdown={d.breakdown}
        byOptions={d.byOptions}
      />
      <DataTable rows={tableRows} columns={columns} searchKeys={["number", "title", "client", "job", "standing", "next"]} name="receivables-open" rowHrefKey="href" initialQuery={one("q") ?? ""} initialSort={{ key: "late", dir: "desc" }} empty="Nothing is owed. Everything issued is paid." />
      <p className="text-xs text-[var(--color-charcoal-light)]">
        Recording a payment, resending or voiding happens on the invoice&apos;s own page (owners only). <Link className="underline" href={hrefOf(PATH, { ...periodParams(resolvePeriod({ p: "mtd" }, today)), m: "collected" })}>See what came in this month</Link>.
      </p>
    </AccountingFrame>
  );
}
