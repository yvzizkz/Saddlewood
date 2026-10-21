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
import { listJobRefs } from "@/lib/jobs/hub";
import { ROLE_INFO, ROLES, seatHolder } from "@/lib/roles/seats";
import { loadPeople, loadSeats } from "@/lib/roles/store";
import { KIND_LABEL, loadFeed } from "@/lib/tasks/feed";
import { NewTask } from "@/components/tasks/TaskActions";
import { ChangeOrderStep, RequestChangeOrder } from "@/components/billing/ChangeOrderActions";
import { CO_LABEL, loadChangeOrders } from "@/lib/billing/registers";
import { EDITABLE_SCHEDULE_KINDS, loadScheduleFeed, SCHEDULE_KIND_LABEL } from "@/lib/schedule/feed";
import { NewScheduleItem, ScheduleStatusButton } from "@/components/schedule/ScheduleActions";
import { loadJobFieldOps } from "@/lib/field/ops";
import { loadSubScorecards } from "@/lib/subs/scorecard";
import {
  ChecklistCard,
  NewChecklistForm,
  NewDailyLogForm,
  NewFieldReceiptForm,
  NewPunchForm,
  PunchStatusButton,
} from "@/components/field/FieldOpsActions";

export const dynamic = "force-dynamic";

// The job page: the hub every record hangs off. Each tab is an app section
// narrowed to this job (Labor is Payroll for this job, Money is Receivables
// and Billing for it, and so on), so the numbers here and there always agree.

type SP = Record<string, string | string[] | undefined>;

const TABS: JobTab[] = [
  { key: "overview", label: "Overview" },
  { key: "schedule", label: "Schedule" },
  { key: "log", label: "Log and QA" },
  { key: "money", label: "Money" },
  { key: "labor", label: "Labor" },
  { key: "purchases", label: "Purchases" },
  { key: "subs", label: "Subs" },
  { key: "changes", label: "Changes" },
  { key: "documents", label: "Documents" },
  { key: "tasks", label: "Tasks" },
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

  if (tab === "changes") {
    const refs = await listJobRefs();
    const cos = (await loadChangeOrders(refs, today)).filter((c) => c.jobKey === ref.key);
    const waiting = cos.filter((c) => c.registerId !== null && !["billed", "rejected", "void"].includes(c.status));
    const table: TableRow[] = cos.map((c) => ({
      id: c.id,
      number: c.number,
      title: c.title,
      href: c.documentId ? `/app/money/${c.documentId}` : null,
      status: CO_LABEL[c.status],
      source: c.source,
      requested: c.requestedOn,
      age: c.ageDays,
      amount: c.amountCents,
      billedHref: c.billedDocumentId ? `/app/money/${c.billedDocumentId}` : null,
    }));
    return (
      <JobFrame {...frame}>
        <RequestChangeOrder job={ref.key} />
        {waiting.length ? (
          <Card className="p-4">
            <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--color-charcoal-light)]">Moving</p>
            <ul className="divide-y divide-[var(--color-stone)]">
              {waiting.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm text-[var(--color-charcoal)]">
                      {c.number ? <span className="font-medium">{c.number} </span> : null}
                      {c.title}
                    </p>
                    <p className="text-xs text-[var(--color-charcoal-light)]">
                      {[CO_LABEL[c.status], c.amountCents !== null ? formatValue("money", c.amountCents) : null, c.ageDays !== null ? `${c.ageDays} day${c.ageDays === 1 ? "" : "s"} since asked` : null].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <ChangeOrderStep id={c.registerId!} status={c.status} />
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
        <DataTable
          rows={table}
          columns={[
            { key: "number", header: "CO", kind: "text", hrefKey: "href", subKey: "title", phone: "title" },
            { key: "status", header: "Where it is", kind: "text", filter: true },
            { key: "source", header: "From", kind: "text", filter: true, phone: "hide" },
            { key: "requested", header: "Asked", kind: "date" },
            { key: "age", header: "Days open", kind: "count", phone: "hide" },
            { key: "amount", header: "Amount", kind: "money", total: true, phone: "value" },
          ]}
          searchKeys={["number", "title", "status", "source"]}
          name={`${ref.key}-change-orders`}
          initialSort={{ key: "requested", dir: "desc" }}
          empty="No change orders on this job. Record one the day the change is asked for (SOP-002)."
        />
      </JobFrame>
    );
  }

  if (tab === "money" || tab === "documents") {
    const docs = money.issued;
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
        <DataTable rows={table} columns={columns} searchKeys={["number", "title", "kind", "status"]} name={`${ref.key}-${tab}`} rowHrefKey="href" initialSort={{ key: "day", dir: "desc" }} empty="Nothing billed on this job yet." />
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
    const [packages, bills, { scorecards }] = await Promise.all([jobPackages(ref), jobBills(ref), loadSubScorecards(today)]);
    const pk: TableRow[] = packages.map((p) => ({ id: p.id, title: p.title || p.trade, trade: p.trade, status: p.status, due: p.dueAt ? localDay(p.dueAt) : null, href: `/app/subs/bids/${p.id}` }));
    const bl: TableRow[] = bills.map((b) => ({ id: b.id, number: b.billNumber, vendor: b.vendorName, trade: b.tradeLabel, status: b.statusLabel, issued: b.issuedOn, due: b.dueOn, amount: b.amountCents, open: b.payableNowCents, retainage: b.retainageHeldCents || null, href: `/app/accounting/payables/bill/${b.id}` }));
    const jobVendorNames = new Set(bills.map((b) => b.vendorName.toLowerCase()));
    const jobTrades = new Set([...packages.map((p) => p.trade.toLowerCase()), ...bills.map((b) => b.trade.toLowerCase())]);
    const relevantScorecards = scorecards.filter(
      (s) => jobVendorNames.has(s.name.toLowerCase()) || s.trades.some((t) => jobTrades.has(t.toLowerCase())),
    );
    const scRows: TableRow[] = (relevantScorecards.length ? relevantScorecards : scorecards.slice(0, 10)).map((s) => ({
      id: s.subId,
      name: s.name,
      trades: s.trades.join(", "),
      gate: s.readyToMobilize ? "Cleared to mobilize" : `Hold (${s.missing.length} missing)`,
      coi: s.coiState === "ok" ? `Valid (${s.coiDaysLeft}d)` : s.coiState === "expiring_30d" ? `Expiring (${s.coiDaysLeft}d)` : s.coiState === "expired" ? "Expired" : "Missing",
      bids: `${s.submittedCount}/${s.invitedCount}`,
      awards: s.awardedCount,
      openBills: s.openBillsCents ?? null,
      href: "/app/subs",
    }));
    return (
      <JobFrame {...frame} actions={<Link className="text-sm underline" href="/app/subs">Open in Subs & Bids</Link>}>
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--color-charcoal-light)]">Bid packages</p>
        <DataTable rows={pk} columns={[{ key: "title", header: "Package", kind: "text", hrefKey: "href", phone: "title" }, { key: "trade", header: "Trade", kind: "text", filter: true }, { key: "status", header: "Status", kind: "text", filter: true, phone: "value" }, { key: "due", header: "Bids due", kind: "date" }]} searchKeys={["title", "trade"]} name={`${ref.key}-packages`} rowHrefKey="href" empty="No bid packages on this job." />
        <p className="pt-2 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--color-charcoal-light)]">Sub and vendor bills</p>
        <DataTable rows={bl} columns={[{ key: "number", header: "Bill", kind: "text", hrefKey: "href", phone: "title" }, { key: "vendor", header: "From", kind: "text", filter: true }, { key: "trade", header: "Trade", kind: "text", filter: true }, { key: "status", header: "Status", kind: "text", filter: true }, { key: "issued", header: "Issued", kind: "date", phone: "hide" }, { key: "due", header: "Due", kind: "date" }, { key: "amount", header: "Amount", kind: "money", total: true, phone: "hide" }, { key: "open", header: "Payable now", kind: "money", total: true, phone: "value" }, { key: "retainage", header: "Retainage held", kind: "money", total: true, phone: "hide" }]} searchKeys={["number", "vendor", "trade", "status"]} name={`${ref.key}-bills`} rowHrefKey="href" initialSort={{ key: "issued", dir: "desc" }} empty="No bills on this job." />
        <p className="pt-2 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--color-charcoal-light)]">Sub compliance & scorecard (SOP-008)</p>
        <DataTable rows={scRows} columns={[{ key: "name", header: "Sub", kind: "text", hrefKey: "href", phone: "title" }, { key: "trades", header: "Trades", kind: "text", phone: "hide" }, { key: "gate", header: "Mobilization gate", kind: "text", filter: true, phone: "value" }, { key: "coi", header: "COI", kind: "text", filter: true }, { key: "bids", header: "Bids / Invited", kind: "text", phone: "hide" }, { key: "awards", header: "Awards", kind: "count", phone: "hide" }, { key: "openBills", header: "Open AP", kind: "money", total: true }]} searchKeys={["name", "trades", "gate", "coi"]} name={`${ref.key}-sub-scorecard`} rowHrefKey="href" empty="No subs in directory." />
      </JobFrame>
    );
  }

  if (tab === "tasks") {
    const [refs, seats, people] = await Promise.all([listJobRefs(), loadSeats(), loadPeople()]);
    const items = (await loadFeed(refs, seats, today)).filter((i) => i.jobKey === ref.key);
    const table: TableRow[] = items.map((i) => ({
      id: i.id,
      title: i.title,
      detail: i.detail,
      href: i.href,
      kind: KIND_LABEL[i.kind],
      who: i.assignee ? (people.find((p) => p.email === i.assignee)?.name ?? i.assignee) : seatHolder(i.nowRole, seats, people).name,
      due: i.dueOn,
      late: i.overdueDays || null,
    }));
    return (
      <JobFrame {...frame}>
        <NewTask
          job={ref.key}
          roles={ROLES.map((r) => ({ value: r, label: `${ROLE_INFO[r].label} (${seatHolder(r, seats, people).name})` }))}
          jobs={[{ value: ref.key, label: ref.name }]}
          kinds={Object.entries(KIND_LABEL).map(([value, label]) => ({ value, label }))}
        />
        <DataTable
          rows={table}
          columns={[
            { key: "title", header: "Task", kind: "text", hrefKey: "href", subKey: "detail", phone: "title" },
            { key: "who", header: "With", kind: "text", filter: true },
            { key: "kind", header: "Kind", kind: "text", filter: true },
            { key: "due", header: "Due", kind: "date", phone: "value" },
            { key: "late", header: "Days late", kind: "count" },
          ]}
          searchKeys={["title", "detail", "who", "kind"]}
          name={`${ref.key}-tasks`}
          rowHrefKey="href"
          initialSort={{ key: "late", dir: "desc" }}
          empty="Nothing open on this job."
        />
      </JobFrame>
    );
  }

  if (tab === "schedule") {
    const [refs, seats, people] = await Promise.all([listJobRefs(), loadSeats(), loadPeople()]);
    const allSched = await loadScheduleFeed(refs, today);
    const jobSched = allSched.filter((i) => i.jobKey === ref.key || (!i.jobKey && i.client && i.client === ref.client));
    const table: TableRow[] = jobSched.map((i) => ({
      id: i.id,
      day: i.startDay,
      time: i.startTime ? clockText(i.startTime) : "All day",
      title: i.title,
      detail: i.detail,
      kind: i.kindLabel || SCHEDULE_KIND_LABEL[i.kind],
      who: i.who || seatHolder(i.role, seats, people).name,
      status: i.status,
      href: i.href,
    }));
    const editableItems = jobSched.filter((i) => i.editable && i.itemId);
    return (
      <JobFrame {...frame} actions={<Link className="text-sm underline" href={hrefOf("/app/schedule", { job: ref.key })}>Open in Schedule</Link>}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <NewScheduleItem
            job={ref.key}
            defaultDay={today}
            jobs={[{ value: ref.key, label: ref.name }]}
            roles={ROLES.map((r) => ({ value: r, label: `${ROLE_INFO[r].label} (${seatHolder(r, seats, people).name})` }))}
            kinds={EDITABLE_SCHEDULE_KINDS}
          />
          <Link className="text-xs underline text-[var(--color-charcoal-light)]" href={hrefOf("/app/schedule", { view: "lookahead", job: ref.key })}>
            Wednesday two-week look-ahead draft →
          </Link>
        </div>

        <Card className="p-4">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--color-charcoal-light)]">Job timeline · phases & promised completion</p>
          {crew.phases.length ? (
            <ol className="divide-y divide-[var(--color-stone)]">
              {crew.phases.map((ph) => (
                <li key={ph.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <div>
                    <span className="font-medium text-[var(--color-charcoal)]">{ph.name}</span>
                    {ph.trade ? <span className="ml-2 text-xs text-[var(--color-charcoal-light)]">{ph.trade}</span> : null}
                  </div>
                  <span className="text-xs text-[var(--color-charcoal-light)]">
                    {ph.verified_at
                      ? `Verified ${formatValue("date", ph.verified_at)}`
                      : ph.planned_from || ph.planned_to
                        ? `${ph.planned_from ? formatValue("date", ph.planned_from) : "start"} → ${ph.planned_to ? formatValue("date", ph.planned_to) : "end"}`
                        : "Unscheduled"}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-[var(--color-charcoal-light)]">No phases defined yet.</p>
          )}
        </Card>

        {editableItems.length ? (
          <Card className="p-4">
            <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--color-charcoal-light)]">Scheduled inspections, visits, deliveries & sub mobilizations</p>
            <ul className="divide-y divide-[var(--color-stone)]">
              {editableItems.map((it) => (
                <li key={it.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <div>
                    <p className="font-medium text-[var(--color-charcoal)]">
                      {formatValue("date", it.startDay)} · {it.title}
                    </p>
                    <p className="text-xs text-[var(--color-charcoal-light)]">
                      {[it.kindLabel, it.startTime ? clockText(it.startTime) : null, it.detail].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <ScheduleStatusButton id={it.itemId!} status={it.status} />
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        <DataTable
          rows={table}
          columns={[
            { key: "day", header: "Date", kind: "date" },
            { key: "time", header: "Time", kind: "text", phone: "hide" },
            { key: "title", header: "Event", kind: "text", hrefKey: "href", subKey: "detail", phone: "title" },
            { key: "kind", header: "Type", kind: "text", filter: true },
            { key: "who", header: "With", kind: "text", filter: true },
            { key: "status", header: "Status", kind: "text", filter: true, phone: "value" },
          ]}
          searchKeys={["title", "detail", "kind", "who", "status"]}
          name={`${ref.key}-schedule`}
          rowHrefKey="href"
          initialSort={{ key: "day", dir: "asc" }}
          empty="Nothing on this job's schedule yet."
        />
      </JobFrame>
    );
  }

  if (tab === "log") {
    const field = await loadJobFieldOps(ref);
    const logRows: TableRow[] = field.logs.map((l) => ({
      id: String(l.id),
      day: l.day,
      author: l.author,
      summary: l.body,
      meta: [
        l.weather,
        l.crewCount ? `${l.crewCount} on site` : "",
        l.tradesOnSite,
        l.inspections ? `Inspection: ${l.inspections}` : "",
        l.deliveries ? `Delivery: ${l.deliveries}` : "",
        l.visits ? `Visit: ${l.visits}` : "",
        l.asked ? `Directive: ${l.asked}` : "",
        l.decision ? `ASK: ${l.decision}` : "",
      ]
        .filter(Boolean)
        .join(" · "),
      photos: l.photoCount,
    }));
    const receiptRows: TableRow[] = field.receipts.map((r) => ({
      id: String(r.id),
      day: r.day,
      vendor: r.vendor,
      description: r.description,
      trade: r.trade,
      paidBy: r.paidBy,
      amount: r.amountCents,
      href: r.tripHref,
    }));

    return (
      <JobFrame {...frame}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <NewDailyLogForm jobKey={ref.key} today={today} />
            <NewChecklistForm jobKey={ref.key} phases={field.phases} />
            <NewPunchForm jobKey={ref.key} />
            <NewFieldReceiptForm jobKey={ref.key} today={today} />
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-medium ${field.closeoutReady ? "bg-[#e7f4ea] text-[#1f6a3b]" : "bg-[#fdf3dc] text-[#8a6100]"}`}>
            {field.closeoutReady
              ? "Closeout gate: 0 open punch · 0 open checklists"
              : `${field.openChecklistCount} open quality gate${field.openChecklistCount === 1 ? "" : "s"} · ${field.openPunchCount} open punch`}
          </span>
        </div>

        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--color-charcoal-light)]">
              Pre-cover & phase quality checklists (SOP-009 · gates phase verification)
            </p>
            <span className="text-xs text-[var(--color-charcoal-light)]">
              {field.checklists.filter((c) => c.status === "passed").length} of {field.checklists.length} passed
            </span>
          </div>
          {field.checklists.length ? (
            <div className="grid gap-3 md:grid-cols-2">
              {field.checklists.map((c) => (
                <ChecklistCard key={c.id} checklist={c} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-[var(--color-charcoal-light)]">
              No quality checklists on this job yet. Add a pre-cover or pre-tape gate above.
            </p>
          )}
        </Card>

        <Card className="p-4">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--color-charcoal-light)]">
            Punch list by room & wall face
          </p>
          {field.punch.length ? (
            <ul className="divide-y divide-[var(--color-stone)]">
              {field.punch.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                  <div>
                    <p className={p.status !== "open" ? "text-[var(--color-charcoal-light)] line-through" : "font-medium text-[var(--color-charcoal)]"}>
                      <span className="mr-2 rounded bg-[var(--color-background)] px-2 py-0.5 text-xs font-medium text-[var(--color-charcoal)]">
                        {p.location}
                      </span>
                      {p.title}
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--color-charcoal-light)]">
                      {[p.detail, `With ${p.assignee}`, p.dueOn ? `Due ${formatValue("date", p.dueOn)}` : null].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <PunchStatusButton id={p.id} status={p.status} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[var(--color-charcoal-light)]">Zero punch items on this job.</p>
          )}
        </Card>

        <p className="pt-2 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--color-charcoal-light)]">
          Daily logs & field notes (SOP-006 App C)
        </p>
        <DataTable
          rows={logRows}
          columns={[
            { key: "day", header: "Date", kind: "date" },
            { key: "author", header: "By", kind: "text", filter: true },
            { key: "summary", header: "Work performed & conditions", kind: "text", subKey: "meta", phone: "title" },
            { key: "photos", header: "Photos", kind: "count", total: true, phone: "value" },
          ]}
          searchKeys={["author", "summary", "meta"]}
          name={`${ref.key}-daily-logs`}
          initialSort={{ key: "day", dir: "desc" }}
          empty="No daily logs filed on this job yet."
        />

        <p className="pt-2 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--color-charcoal-light)]">
          Field receipts (normalized into Purchases & Payables)
        </p>
        <DataTable
          rows={receiptRows}
          columns={[
            { key: "day", header: "Date", kind: "date" },
            { key: "vendor", header: "Vendor", kind: "text", filter: true },
            { key: "description", header: "Items", kind: "text", hrefKey: "href", phone: "title" },
            { key: "trade", header: "Trade", kind: "text", filter: true },
            { key: "paidBy", header: "Paid by", kind: "text", filter: true },
            { key: "amount", header: "Amount", kind: "money", total: true, phone: "value" },
          ]}
          searchKeys={["vendor", "description", "trade", "paidBy"]}
          name={`${ref.key}-field-receipts`}
          rowHrefKey="href"
          initialSort={{ key: "day", dir: "desc" }}
          empty="No field receipts logged on this job."
        />
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
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--color-charcoal-light)]">Gate 0 Handoff & Watches (SOP-001)</p>
            <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${openWatches.length === 0 && crew.phases.length > 0 ? "bg-[#e7f4ea] text-[#1f6a3b]" : "bg-[#fdf3dc] text-[#8a6100]"}`}>
              {openWatches.length === 0 && crew.phases.length > 0 ? "Gate 0 cleared" : `${openWatches.length} pre-start watch${openWatches.length === 1 ? "" : "es"} open`}
            </span>
          </div>
          <div className="mb-3 grid grid-cols-2 gap-2 rounded-xl bg-[var(--color-background)] p-2.5 text-xs text-[var(--color-charcoal)]">
            <div>
              <span className="block text-[10px] uppercase tracking-wider text-[var(--color-charcoal-light)]">Sale & Award</span>
              <span className="font-medium">{ref.saleNumber ? `Sale ${ref.saleNumber}` : ref.awarded ? "Awarded" : "Direct job"}</span>
            </div>
            <div>
              <span className="block text-[10px] uppercase tracking-wider text-[var(--color-charcoal-light)]">Project Manager</span>
              <span className="font-medium">{ref.pm.length ? ref.pm.join(", ") : "Unassigned"}</span>
            </div>
            <div>
              <span className="block text-[10px] uppercase tracking-wider text-[var(--color-charcoal-light)]">Phases & Schedule</span>
              <span className="font-medium">{crew.phases.length ? `${crew.phases.length} phases (${crew.phases.filter((p) => p.verified_at).length} verified)` : "No phases yet"}</span>
            </div>
            <div>
              <span className="block text-[10px] uppercase tracking-wider text-[var(--color-charcoal-light)]">Contract Sum</span>
              <span className="font-mono font-medium">{formatValue("money", ref.contractCents)}</span>
            </div>
          </div>
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
