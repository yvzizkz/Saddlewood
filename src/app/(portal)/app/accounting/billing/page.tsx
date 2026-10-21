import Link from "next/link";
import { redirect } from "next/navigation";

import AccountingFrame from "@/components/accounting/AccountingFrame";
import { Card } from "@/components/bot/ui";
import DataTable, { type Column, type TableRow } from "@/components/data/DataTable";
import KpiHeader from "@/components/data/KpiHeader";
import { drill, type DrillSpec } from "@/lib/analytics/drill";
import { formatValue } from "@/lib/analytics/format";
import { inRange, resolvePeriod } from "@/lib/analytics/period";
import { loadBillingCalendar, loadIssued, type IssuedRow } from "@/lib/accounting/receivables";
import { moneySeatForPage, seesBillingJob } from "@/lib/accounting/access";
import { CO_LABEL, loadChangeOrders, loadWaivers } from "@/lib/billing/registers";
import { jobHref, listJobRefs } from "@/lib/jobs/hub";
import { localDay } from "@/lib/crew/time";

export const dynamic = "force-dynamic";

// Billing: what we billed in a period (invoices, change orders, statements,
// and drafts waiting to go), and what is next to bill: each client's cutoff
// with the day the PM's percent complete is due and what has to go with it.

const PATH = "/app/accounting/billing";
type SP = Record<string, string | string[] | undefined>;

const KIND: Record<string, string> = { invoice: "Invoice", change_order: "Change order", statement: "Statement" };

export default async function BillingPage({ searchParams }: { searchParams: Promise<SP> }) {
  const seat = await moneySeatForPage("billing");
  if (!seat) redirect("/app");
  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]?.[0] : (sp[k] as string | undefined));
  const period = resolvePeriod({ p: one("p"), from: one("from"), to: one("to") }, undefined, "mtd");
  const today = localDay();

  const allRefs = await listJobRefs();
  // A PM's seat sees its own jobs; everything below is narrowed to them.
  const refs = allRefs.filter((r) => seesBillingJob(seat, r.billingId));
  const keys = new Set(refs.map((r) => r.key));
  const clientsInView = new Set(refs.map((r) => r.clientId).filter(Boolean));
  const [allRows, allCalendar, allRegister, allWaivers] = await Promise.all([loadIssued(period.previous.from, period.to), loadBillingCalendar(today), loadChangeOrders(allRefs, today), loadWaivers(allRefs)]);
  const rows = allRows.filter((r) => seesBillingJob(seat, r.jobId));
  const calendar = seat.owner ? allCalendar : allCalendar.filter((c) => clientsInView.has(c.clientId));
  const register = allRegister.filter((c) => seat.owner || (c.jobKey !== null && keys.has(c.jobKey)));
  const waivers = allWaivers.filter((w) => seat.owner || (w.direction === "out" && w.jobKey !== null && keys.has(w.jobKey)));
  const coRows: TableRow[] = register.map((c) => ({
    id: c.id,
    number: c.number,
    title: c.title,
    href: seat.owner && c.jobKey ? jobHref(c.jobKey, "changes") : c.documentId ? `/app/money/${c.documentId}` : null,
    job: c.job,
    status: CO_LABEL[c.status],
    requested: c.requestedOn,
    age: c.ageDays,
    amount: c.amountCents,
  }));
  const waiverRows: TableRow[] = waivers.map((w) => ({
    id: w.id,
    covers: w.covers,
    href: w.coversHref,
    dir: w.direction === "out" ? "We give (with invoice)" : "We get (from sub)",
    party: w.party,
    job: w.job,
    kind: w.kind.replace(/_/g, " "),
    status: w.statusLabel,
    amount: w.amountCents,
  }));
  const awaitingPrice = register.filter((c) => c.status === "requested").length;
  const missingWaivers = waivers.filter((w) => w.status === "missing").length;
  const spec: DrillSpec<IssuedRow> = {
    path: PATH,
    title: "Billing",
    dims: [
      { key: "client", label: "Client", plural: "clients", of: (r) => ({ key: r.clientId, label: r.client }) },
      { key: "job", label: "Job", plural: "jobs", of: (r) => (r.jobId ? { key: r.jobId, label: r.job } : null) },
      { key: "kind", label: "Kind", plural: "kinds", of: (r) => ({ key: r.kind, label: KIND[r.kind] ?? r.kind }) },
    ],
    value: (r) => (r.status === "draft" ? 0 : r.totalCents),
    dayOf: (r) => r.day,
  };
  const now = rows.filter((r) => inRange(r.day, period.from, period.to));
  const d = drill(spec, now, period, sp, { previousRows: rows.filter((r) => inRange(r.day, period.previous.from, period.previous.to)) });

  const drafts = d.rows.filter((r) => r.status === "draft");
  const cos = d.rows.filter((r) => r.kind === "change_order" && r.status !== "draft");
  const issued = d.rows.filter((r) => r.status === "issued");

  const tableRows: TableRow[] = d.rows.map((r) => ({
    id: r.id,
    number: r.number,
    title: r.title,
    href: r.status === "draft" ? (seat.owner ? "/app/bill" : null) : `/app/money/${r.id}`,
    kind: KIND[r.kind] ?? r.kind,
    status: r.status === "draft" ? "Draft" : "Issued",
    client: r.client,
    job: r.job,
    day: r.day,
    due: r.dueOn,
    total: r.totalCents,
  }));
  const columns: Column[] = [
    { key: "number", header: "Number", kind: "text", hrefKey: "href", subKey: "title", phone: "title" },
    { key: "kind", header: "Kind", kind: "text", filter: true },
    { key: "status", header: "Status", kind: "text", filter: true },
    { key: "client", header: "Client", kind: "text", filter: true },
    { key: "job", header: "Job", kind: "text", filter: true },
    { key: "day", header: "Date", kind: "date" },
    { key: "due", header: "Due", kind: "date", phone: "hide" },
    { key: "total", header: "Amount", kind: "money", total: true, phone: "value" },
  ];

  return (
    <AccountingFrame
      sections={seat.sections}
      title="Billing"
      intro="What went out in the period, and the next billing date for every client with an open job."
      period={period}
      crumbs={[{ label: "Accounting", href: "/app/accounting" }, ...d.crumbs]}
      filters={d.filters}
      actions={
        seat.owner ? (
          <Link href="/app/bill" className="inline-flex min-h-10 items-center rounded-xl bg-[var(--color-teal)] px-4 text-sm font-medium text-white">
            Bill
          </Link>
        ) : undefined
      }
    >
      <KpiHeader
        label="Billed"
        value={d.total}
        kind="money"
        change={d.change}
        upIsGood
        compareLabel={period.previous.label}
        stats={[
          { label: "Issued", value: issued.length, kind: "count" },
          { label: "Change orders", value: cos.reduce((a, r) => a + r.totalCents, 0), kind: "money", hint: `${cos.length} issued` },
          { label: "Drafts waiting", value: drafts.length, kind: "count", hint: drafts.length ? formatValue("money", drafts.reduce((a, r) => a + r.totalCents, 0)) : undefined, href: seat.owner && drafts.length ? "/app/bill" : undefined },
        ]}
        trend={d.trend}
        trendLabel="Billed"
        breakdown={d.breakdown}
        byOptions={d.byOptions}
      />

      <section aria-label="Billing calendar" className="rounded-2xl border border-[var(--color-stone)] bg-white p-4 md:p-5">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--color-charcoal-light)]">Next to bill</p>
          <p className="text-xs text-[var(--color-charcoal-light)]">PM&apos;s % complete is due 3 business days before each date</p>
        </div>
        {calendar.length === 0 ? (
          <p className="text-sm text-[var(--color-charcoal-light)]">No client has an open job.</p>
        ) : (
          <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {calendar.map((c) => {
              const soon = c.prepOn <= today;
              return (
                <li key={c.clientId}>
                  <Card className="h-full p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-[var(--color-charcoal)]">{c.client}</p>
                        <p className="text-xs text-[var(--color-charcoal-light)]">
                          {c.label} · {c.delivery}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-[var(--color-charcoal)]">{formatValue("date", c.day)}</p>
                        <p className={`text-[11px] ${soon ? "font-medium text-[#9a2a1f]" : "text-[var(--color-charcoal-light)]"}`}>% complete by {formatValue("date", c.prepOn)}</p>
                      </div>
                    </div>
                    {c.attachments.length ? <p className="mt-2 text-[11px] text-[var(--color-charcoal-light)]">With every invoice: {c.attachments.join(", ")}</p> : null}
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <DataTable rows={tableRows} columns={columns} searchKeys={["number", "title", "client", "job", "kind"]} name={`billing-${period.key}`} rowHrefKey="href" initialSort={{ key: "day", dir: "desc" }} empty="Nothing billed in this period." />

      <section id="changes" aria-label="Change orders" className="space-y-2 pt-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--color-charcoal-light)]">Change orders, every job</p>
          {awaitingPrice ? <p className="text-xs font-medium text-[#9a2a1f]">{awaitingPrice} awaiting a price</p> : null}
        </div>
        <DataTable
          rows={coRows}
          columns={[
            { key: "number", header: "CO", kind: "text", hrefKey: "href", subKey: "title", phone: "title" },
            { key: "job", header: "Job", kind: "text", filter: true },
            { key: "status", header: "Where it is", kind: "text", filter: true },
            { key: "requested", header: "Asked", kind: "date", phone: "hide" },
            { key: "age", header: "Days open", kind: "count" },
            { key: "amount", header: "Amount", kind: "money", total: true, phone: "value" },
          ]}
          searchKeys={["number", "title", "job", "status"]}
          name="change-orders"
          rowHrefKey="href"
          initialSort={{ key: "age", dir: "desc" }}
          empty="No change orders yet. Record one from the job's Changes tab."
        />
      </section>

      <section id="waivers" aria-label="Lien waivers" className="space-y-2 pt-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--color-charcoal-light)]">Lien waivers, both ways</p>
          {missingWaivers ? <p className="text-xs font-medium text-[#9a2a1f]">{missingWaivers} missing</p> : null}
        </div>
        <DataTable
          rows={waiverRows}
          columns={[
            { key: "covers", header: "For", kind: "text", hrefKey: "href", phone: "title" },
            { key: "dir", header: "Direction", kind: "text", filter: true },
            { key: "party", header: "With", kind: "text", filter: true },
            { key: "job", header: "Job", kind: "text", filter: true, phone: "hide" },
            { key: "kind", header: "Kind", kind: "text", filter: true, phone: "hide" },
            { key: "status", header: "Status", kind: "text", filter: true, phone: "value" },
            { key: "amount", header: "Amount", kind: "money", total: true, phone: "hide" },
          ]}
          searchKeys={["covers", "party", "job", "status"]}
          name="lien-waivers"
          rowHrefKey="href"
          initialSort={{ key: "status", dir: "asc" }}
          empty="No waivers are owed: no client asks for one and no sub bill is open."
        />
      </section>
    </AccountingFrame>
  );
}
