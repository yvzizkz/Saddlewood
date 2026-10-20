import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Card } from "@/components/bot/ui";
import DataTable, { type Column, type TableRow } from "@/components/data/DataTable";
import KpiHeader from "@/components/data/KpiHeader";
import JobFrame, { type JobTab, type Stage } from "@/components/jobs/JobFrame";
import { drill, hrefOf, type DrillSpec } from "@/lib/analytics/drill";
import { formatValue } from "@/lib/analytics/format";
import { inRange, resolvePeriod } from "@/lib/analytics/period";
import type { LaborRow } from "@/lib/accounting/labor";
import type { PurchaseItemRow } from "@/lib/accounting/purchases";
import { getViewer, viewerIsOwner } from "@/lib/crew/auth";
import { clockText, localClock, localDay } from "@/lib/crew/time";
import { getJobRef, jobHref } from "@/lib/jobs/hub";
import { jobBills, jobCrew, jobLabor, jobMoney, jobPackages, jobPurchases, jobWatches } from "@/lib/jobs/jobData";

export const dynamic = "force-dynamic";

// The job page: the hub every record hangs off. Each tab is an app section
// narrowed to this job (Labor is Payroll for this job, Money is Receivables
// and Billing for it, and so on), so the numbers here and there always agree.

type SP = Record<string, string | string[] | undefined>;

const TABS: JobTab[] = [
  { key: "overview", label: "Overview" },
  { key: "money", label: "Money" },
  { key: "labor", label: "Labor" },
  { key: "purchases", label: "Purchases" },
  { key: "subs", label: "Subs" },
  { key: "changes", label: "Changes" },
  { key: "documents", label: "Documents" },
  { key: "crew", label: "Crew and phases" },
];

const KIND: Record<string, string> = { invoice: "Invoice", change_order: "Change order", statement: "Statement" };

export default async function JobPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  if (!(await viewerIsOwner(await getViewer()))) redirect("/app");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const ref = await getJobRef(id);
  if (!ref) notFound();
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]?.[0] : (sp[k] as string | undefined));
  const tab = TABS.some((t) => t.key === one("tab")) ? (one("tab") as string) : "overview";
  const base = jobHref(ref.key);
  const today = localDay();

  // What every tab needs to place the job on its lifecycle.
  const [money, crew, watches] = await Promise.all([jobMoney(ref, today), jobCrew(ref), jobWatches(ref)]);
  const issued = money.issued.filter((d) => d.status === "issued");
  const billed = issued.reduce((a, d) => a + d.totalCents, 0);
  const collected = money.collected.reduce((a, r) => a + r.amountCents, 0);
  const open = money.open.reduce((a, r) => a + r.balanceCents, 0);
  const built = crew.phases.length > 0 && crew.phases.every((p) => p.verified_at);
  const closed = !ref.active;

  const stages: Stage[] = [
    { key: "sale", label: ref.saleNumber ? `Sale ${ref.saleNumber}` : "Sale", state: ref.saleId || ref.awarded ? "done" : "next", href: ref.saleId ? `/app/sales/${ref.saleId}` : undefined },
    { key: "award", label: "Award", state: ref.awarded || ref.contractCents ? "done" : "next" },
    { key: "build", label: built ? "Built" : "Build", state: built || closed ? "done" : ref.crewId ? "now" : "next", href: `${base}?tab=crew` },
    { key: "billing", label: "Billing", state: closed ? "done" : issued.length ? "now" : "next", href: `${base}?tab=money` },
    { key: "closeout", label: "Closeout", state: closed ? "done" : "next" },
    { key: "warranty", label: "Warranty", state: closed ? "now" : "next" },
  ];
  // Only one "now": the furthest one reached.
  const nowIdx = stages.map((s) => s.state).lastIndexOf("now");
  stages.forEach((s, i) => {
    if (s.state === "now" && i !== nowIdx) s.state = "done";
  });

  const tabs = TABS.map((t) => ({
    ...t,
    count: t.key === "money" ? money.open.length : t.key === "changes" ? money.issued.filter((d) => d.kind === "change_order").length : undefined,
  }));
  const crumbs = [
    { label: "Jobs", href: "/app/jobs" },
    { label: ref.name, href: base },
    ...(tab === "overview" ? [] : [{ label: TABS.find((t) => t.key === tab)!.label, href: `${base}?tab=${tab}` }]),
  ];
  const sub = (
    <span>
      {[ref.client, ref.address, ref.pm.length ? `PM ${ref.pm.join(", ")}` : null].filter(Boolean).join(" · ")}
    </span>
  );
  const frame = { title: ref.name, sub, stages, tabs, tab, baseHref: base, crumbs };

  if (tab === "labor" || tab === "purchases") {
    const period = resolvePeriod({ p: one("p"), from: one("from"), to: one("to") }, today, "mtd");
    if (tab === "labor") {
      const rows = await jobLabor(ref, period.previous.from, period.to);
      const spec: DrillSpec<LaborRow> = {
        path: base,
        title: "Labor",
        fixed: { tab: "labor" },
        dims: [
          { key: "trade", label: "Trade", plural: "trades", of: (r) => (r.trade ? { key: r.trade, label: r.tradeLabel } : null), trades: true },
          { key: "person", label: "Person", plural: "people", of: (r) => ({ key: r.email, label: r.person }) },
        ],
        value: (r) => r.minutes,
        dayOf: (r) => r.day,
      };
      const d = drill(spec, rows.filter((r) => inRange(r.day, period.from, period.to)), period, sp, { previousRows: rows.filter((r) => inRange(r.day, period.previous.from, period.previous.to)) });
      const cost = d.rows.reduce((a, r) => a + (r.costCents ?? 0), 0);
      const table: TableRow[] = d.rows.map((r) => ({
        id: r.id,
        day: r.day,
        person: r.person,
        trade: r.tradeLabel,
        span: `${clockText(localClock(r.startedAt))} – ${r.endedAt ? clockText(localClock(r.endedAt)) : "on the clock"}`,
        minutes: r.minutes,
        cost: r.costCents,
        href: `/app/accounting/payroll/entry/${r.id}`,
      }));
      const columns: Column[] = [
        { key: "day", header: "Day", kind: "date" },
        { key: "person", header: "Person", kind: "text", filter: true, phone: "title" },
        { key: "trade", header: "Trade", kind: "text", filter: true },
        { key: "span", header: "Clock", kind: "text", phone: "hide" },
        { key: "minutes", header: "Hours", kind: "hours", total: true, phone: "value" },
        { key: "cost", header: "Labor cost", kind: "money", total: true },
      ];
      return (
        <JobFrame {...frame} period={period} filters={d.filters} actions={<Link className="text-sm underline" href={hrefOf("/app/accounting/payroll", { p: period.key, job: ref.crewId ?? undefined })}>Open in Payroll</Link>}>
          <KpiHeader label="Labor hours" value={d.total} kind="hours" change={d.change} compareLabel={period.previous.label} stats={[{ label: "Labor cost", value: cost, kind: "money" }, { label: "People", value: new Set(d.rows.map((r) => r.email)).size, kind: "count" }]} trend={d.trend} breakdown={d.breakdown} byOptions={d.byOptions} />
          <DataTable rows={table} columns={columns} searchKeys={["person", "trade"]} name={`${ref.key}-labor-${period.key}`} rowHrefKey="href" initialSort={{ key: "day", dir: "desc" }} empty="No time on this job in the period." />
        </JobFrame>
      );
    }
    const rows = await jobPurchases(ref, period.previous.from, period.to);
    const spec: DrillSpec<PurchaseItemRow> = {
      path: base,
      title: "Purchases",
      fixed: { tab: "purchases" },
      dims: [
        { key: "trade", label: "Trade", plural: "trades", of: (r) => (r.trade ? { key: r.trade, label: r.tradeLabel } : null), trades: true },
        { key: "vendor", label: "Vendor", plural: "vendors", of: (r) => ({ key: r.vendor, label: r.vendor }) },
      ],
      value: (r) => r.lineTotalCents,
      dayOf: (r) => r.purchasedOn,
    };
    const d = drill(spec, rows.filter((r) => inRange(r.purchasedOn, period.from, period.to)), period, sp, { previousRows: rows.filter((r) => inRange(r.purchasedOn, period.previous.from, period.previous.to)) });
    const table: TableRow[] = d.rows.map((r) => ({ id: r.id, day: r.purchasedOn, what: r.description, vendor: r.vendor, trade: r.tradeLabel, qty: r.qty, cents: r.lineTotalCents, href: `/app/accounting/purchases/trip/${encodeURIComponent(r.tripKey)}` }));
    const columns: Column[] = [
      { key: "what", header: "Item", kind: "text", hrefKey: "href", phone: "title" },
      { key: "day", header: "Date", kind: "date" },
      { key: "vendor", header: "Vendor", kind: "text", filter: true },
      { key: "trade", header: "Trade", kind: "text", filter: true },
      { key: "qty", header: "Qty", kind: "count", phone: "hide" },
      { key: "cents", header: "Amount", kind: "money", total: true, phone: "value" },
    ];
    return (
      <JobFrame {...frame} period={period} filters={d.filters} actions={<Link className="text-sm underline" href={hrefOf("/app/accounting/purchases", { p: period.key, job: ref.crewId ?? undefined })}>Open in Purchases</Link>}>
        <KpiHeader label="Materials" value={d.total} kind="money" change={d.change} upIsGood={false} compareLabel={period.previous.label} stats={[{ label: "Trips", value: new Set(d.rows.map((r) => r.tripKey)).size, kind: "count" }, { label: "Lines", value: d.rows.length, kind: "count" }]} trend={d.trend} breakdown={d.breakdown} byOptions={d.byOptions} />
        <DataTable rows={table} columns={columns} searchKeys={["what", "vendor", "trade"]} name={`${ref.key}-purchases-${period.key}`} rowHrefKey="href" initialSort={{ key: "day", dir: "desc" }} empty="No purchases on this job in the period." />
      </JobFrame>
    );
  }

  if (tab === "money" || tab === "changes" || tab === "documents") {
    const docs = tab === "changes" ? money.issued.filter((d) => d.kind === "change_order") : money.issued;
    const paidOn = new Map<string, number>();
    for (const c of money.collected) if (c.documentId) paidOn.set(c.documentId, (paidOn.get(c.documentId) ?? 0) + c.amountCents);
    const openBy = new Map(money.open.map((o) => [o.id, o]));
    const table: TableRow[] = docs.map((d) => ({
      id: d.id,
      number: d.number,
      title: d.title,
      href: d.status === "draft" ? "/app/bill" : `/app/money/${d.id}`,
      kind: KIND[d.kind] ?? d.kind,
      status: d.status === "draft" ? "Draft" : openBy.has(d.id) ? openBy.get(d.id)!.standing : "Paid",
      day: d.day,
      due: d.dueOn,
      total: d.totalCents,
      paid: paidOn.get(d.id) ?? 0,
      open: openBy.get(d.id)?.balanceCents ?? 0,
    }));
    const columns: Column[] = [
      { key: "number", header: "Number", kind: "text", hrefKey: "href", subKey: "title", phone: "title" },
      { key: "kind", header: "Kind", kind: "text", filter: true },
      { key: "status", header: "Status", kind: "text", filter: true },
      { key: "day", header: "Date", kind: "date" },
      { key: "due", header: "Due", kind: "date", phone: "hide" },
      { key: "total", header: "Amount", kind: "money", total: true },
      { key: "paid", header: "Paid", kind: "money", total: true, phone: "hide" },
      { key: "open", header: "Open", kind: "money", total: true, phone: "value" },
    ];
    const payments: TableRow[] = money.collected.map((c) => ({ id: c.id, day: c.receivedOn, number: c.number, method: c.method, reference: c.reference, amount: c.amountCents, fee: c.feeCents || null, href: c.documentId ? `/app/money/${c.documentId}` : null }));
    return (
      <JobFrame {...frame}>
        {tab === "money" ? (
          <dl className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {[
              ["Contract", ref.contractCents],
              ["Billed", billed],
              ["Collected", collected],
              ["Open", open],
              ["Left to bill", ref.contractCents !== null ? Math.max(0, ref.contractCents - billed) : null],
            ].map(([l, v]) => (
              <Card key={l as string} className="p-3">
                <dt className="text-[11px] text-[var(--color-charcoal-light)]">{l}</dt>
                <dd className="text-lg font-semibold text-[var(--color-charcoal)]">{formatValue("money", v)}</dd>
              </Card>
            ))}
          </dl>
        ) : null}
        <DataTable rows={table} columns={columns} searchKeys={["number", "title", "kind", "status"]} name={`${ref.key}-${tab}`} rowHrefKey="href" initialSort={{ key: "day", dir: "desc" }} empty={tab === "changes" ? "No change orders on this job yet." : "Nothing billed on this job yet."} />
        {tab === "money" ? (
          <>
            <p className="pt-2 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--color-charcoal-light)]">Payments received</p>
            <DataTable
              rows={payments}
              columns={[
                { key: "day", header: "Received", kind: "date" },
                { key: "number", header: "Invoice", kind: "text", hrefKey: "href", phone: "title" },
                { key: "method", header: "Method", kind: "text", filter: true },
                { key: "reference", header: "Reference", kind: "text", phone: "hide" },
                { key: "amount", header: "Amount", kind: "money", total: true, phone: "value" },
                { key: "fee", header: "Fee", kind: "money", total: true, phone: "hide" },
              ]}
              searchKeys={["number", "method", "reference"]}
              name={`${ref.key}-payments`}
              initialSort={{ key: "day", dir: "desc" }}
              empty="No payments on this job yet."
            />
          </>
        ) : null}
      </JobFrame>
    );
  }

  if (tab === "subs") {
    const [packages, bills] = await Promise.all([jobPackages(ref), jobBills(ref)]);
    const pk: TableRow[] = packages.map((p) => ({ id: p.id, title: p.title || p.trade, trade: p.trade, status: p.status, due: p.dueAt ? localDay(p.dueAt) : null, href: `/app/subs/bids/${p.id}` }));
    const bl: TableRow[] = bills.map((b) => ({ id: b.id, number: b.billNumber, vendor: b.vendorName, trade: b.tradeLabel, status: b.statusLabel, issued: b.issuedOn, due: b.dueOn, amount: b.amountCents, open: b.balanceCents, href: `/app/accounting/payables/bill/${b.id}` }));
    return (
      <JobFrame {...frame}>
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--color-charcoal-light)]">Bid packages</p>
        <DataTable rows={pk} columns={[{ key: "title", header: "Package", kind: "text", hrefKey: "href", phone: "title" }, { key: "trade", header: "Trade", kind: "text", filter: true }, { key: "status", header: "Status", kind: "text", filter: true, phone: "value" }, { key: "due", header: "Bids due", kind: "date" }]} searchKeys={["title", "trade"]} name={`${ref.key}-packages`} rowHrefKey="href" empty="No bid packages on this job." />
        <p className="pt-2 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--color-charcoal-light)]">Sub and vendor bills</p>
        <DataTable rows={bl} columns={[{ key: "number", header: "Bill", kind: "text", hrefKey: "href", phone: "title" }, { key: "vendor", header: "From", kind: "text", filter: true }, { key: "trade", header: "Trade", kind: "text", filter: true }, { key: "status", header: "Status", kind: "text", filter: true }, { key: "issued", header: "Issued", kind: "date", phone: "hide" }, { key: "due", header: "Due", kind: "date" }, { key: "amount", header: "Amount", kind: "money", total: true, phone: "hide" }, { key: "open", header: "Open", kind: "money", total: true, phone: "value" }]} searchKeys={["number", "vendor", "trade", "status"]} name={`${ref.key}-bills`} rowHrefKey="href" initialSort={{ key: "issued", dir: "desc" }} empty="No bills on this job." />
      </JobFrame>
    );
  }

  if (tab === "crew") {
    return (
      <JobFrame {...frame} actions={<Link className="text-sm underline" href="/app/crew?view=projects">Open the field view</Link>}>
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="p-4">
            <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--color-charcoal-light)]">People on this job</p>
            {crew.people.length ? (
              <ul className="divide-y divide-[var(--color-stone)]">
                {crew.people.map((p) => (
                  <li key={p.email} className="flex items-center justify-between py-2 text-sm">
                    <Link className="underline-offset-2 hover:underline" href={hrefOf("/app/accounting/payroll", { p: "wtd", person: p.email })}>
                      {p.name}
                    </Link>
                    <span className="text-xs text-[var(--color-charcoal-light)]">{[p.role.toUpperCase() === "PM" ? "PM" : p.role, p.trade].filter(Boolean).join(" · ")}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-[var(--color-charcoal-light)]">Nobody is assigned yet. Assign people in Crew › Team.</p>
            )}
          </Card>
          <Card className="p-4">
            <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--color-charcoal-light)]">Phases</p>
            {crew.phases.length ? (
              <ol className="space-y-2">
                {crew.phases.map((ph) => (
                  <li key={ph.id} className="flex items-center justify-between gap-3 text-sm">
                    <span>{ph.name}</span>
                    <span className="text-xs text-[var(--color-charcoal-light)]">
                      {ph.verified_at ? `Verified ${formatValue("date", ph.verified_at)}` : ph.planned_to ? `Planned by ${formatValue("date", ph.planned_to)}` : "Not planned"}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-[var(--color-charcoal-light)]">No phases yet. Add them from the template in Crew › Projects.</p>
            )}
          </Card>
        </div>
      </JobFrame>
    );
  }

  // Overview.
  const [labor, purchases, bills] = await Promise.all([jobLabor(ref, "2020-01-01", today), jobPurchases(ref, "2020-01-01", today), jobBills(ref)]);
  const laborCost = labor.reduce((a, r) => a + (r.costCents ?? 0), 0);
  const materials = purchases.reduce((a, r) => a + r.lineTotalCents, 0);
  const subs = bills.filter((b) => !b.purchaseTripKey).reduce((a, b) => a + b.amountCents, 0);
  const cost = laborCost + materials + subs;
  const hoursWeek = labor.filter((r) => inRange(r.day, resolvePeriod({ p: "wtd" }, today).from, today)).reduce((a, r) => a + r.minutes, 0);
  const openWatches = watches.filter((w) => !w.doneAt);
  const tile = (label: string, value: number | null, kind: "money" | "hours" | "percent", href?: string, hint?: string) => (
    <Card className="p-3">
      <Link href={href ?? base} className="block">
        <p className="text-[11px] text-[var(--color-charcoal-light)]">{label}</p>
        <p className="text-lg font-semibold text-[var(--color-charcoal)]">{formatValue(kind, value)}</p>
        {hint ? <p className="text-[11px] text-[var(--color-charcoal-light)]">{hint}</p> : null}
      </Link>
    </Card>
  );

  return (
    <JobFrame {...frame}>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        {tile("Contract", ref.contractCents, "money", `${base}?tab=money`)}
        {tile("Billed", billed, "money", `${base}?tab=money`)}
        {tile("Collected", collected, "money", `${base}?tab=money`)}
        {tile("Open", open, "money", `${base}?tab=money`, money.open.some((o) => (o.daysLate ?? 0) > 0) ? "some past due" : undefined)}
        {tile("Cost to date", cost, "money", hrefOf("/app/accounting/job-costing", { p: "custom", from: "2020-01-01", to: today, job: ref.billingId ?? `crew:${ref.crewId}`, by: "category" }))}
        {tile("Margin", billed - cost, "money", undefined, billed ? `${Math.round(((billed - cost) / billed) * 100)}% of billed` : undefined)}
        {tile("Labor this week", hoursWeek, "hours", `${base}?tab=labor&p=wtd`)}
        {tile("Materials", materials, "money", `${base}?tab=purchases&p=ytd`)}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-4">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--color-charcoal-light)]">Watches</p>
          {watches.length ? (
            <ul className="space-y-2 text-sm">
              {watches.map((w) => (
                <li key={w.id} className="flex items-center justify-between gap-3">
                  <span className={w.doneAt ? "text-[var(--color-charcoal-light)] line-through" : ""}>{w.title}</span>
                  <span className={`text-xs ${!w.doneAt && w.due && w.due < today ? "font-medium text-[#9a2a1f]" : "text-[var(--color-charcoal-light)]"}`}>
                    {w.doneAt ? `Done ${formatValue("date", w.doneAt)}` : w.due ? `Due ${formatValue("date", w.due)}` : "No date yet"}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[var(--color-charcoal-light)]">No watches. Award adds the agreement, deposit, 20-day notice, COI and permit watches.</p>
          )}
          {openWatches.length ? <p className="mt-2 text-xs text-[var(--color-charcoal-light)]">{openWatches.length} open</p> : null}
        </Card>
        <Card className="p-4">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--color-charcoal-light)]">Where things are</p>
          <ul className="space-y-2 text-sm">
            {ref.saleId ? (
              <li>
                <Link className="underline underline-offset-2" href={`/app/sales/${ref.saleId}`}>The sale ({ref.saleNumber}): estimates, proposal, award</Link>
              </li>
            ) : null}
            <li>
              <Link className="underline underline-offset-2" href={`${base}?tab=money`}>Invoices, change orders and payments</Link>
            </li>
            <li>
              <Link className="underline underline-offset-2" href={`${base}?tab=subs`}>Bid packages and sub bills</Link>
            </li>
            <li>
              <Link className="underline underline-offset-2" href={`${base}?tab=crew`}>People and phases</Link>
            </li>
            {ref.clientId ? (
              <li>
                <Link className="underline underline-offset-2" href={hrefOf("/app/accounting/receivables", { client: ref.clientId })}>Everything {ref.client} owes</Link>
              </li>
            ) : null}
          </ul>
        </Card>
      </div>
    </JobFrame>
  );
}
