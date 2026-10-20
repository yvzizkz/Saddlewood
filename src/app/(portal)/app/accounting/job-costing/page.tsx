import { redirect } from "next/navigation";

import AccountingFrame from "@/components/accounting/AccountingFrame";
import DataTable, { type Column, type TableRow } from "@/components/data/DataTable";
import KpiHeader from "@/components/data/KpiHeader";
import { drill, hrefOf, type DrillSpec } from "@/lib/analytics/drill";
import { inRange, periodParams, resolvePeriod } from "@/lib/analytics/period";
import { CATEGORY_LABEL, loadJobCost, type CostLine } from "@/lib/accounting/jobCost";
import PayablesMissing from "@/components/accounting/PayablesMissing";
import { getViewer, viewerIsOwner } from "@/lib/crew/auth";

export const dynamic = "force-dynamic";

// Job costing: what each job cost (labor at pay rates, materials, sub and
// vendor bills) against what it was billed and paid, for any period. The
// charts break the cost down by job, kind and trade; tapping narrows it. The
// first table is one row per job; the second is every cost line behind the
// numbers, each opening its record. Owners only (margins, pay).

const PATH = "/app/accounting/job-costing";
type SP = Record<string, string | string[] | undefined>;

export default async function JobCostingPage({ searchParams }: { searchParams: Promise<SP> }) {
  if (!(await viewerIsOwner(await getViewer()))) redirect("/app");
  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]?.[0] : (sp[k] as string | undefined));
  const period = resolvePeriod({ p: one("p"), from: one("from"), to: one("to") }, undefined, "ytd");

  const [cur, prev] = await Promise.all([loadJobCost(period.from, period.to), loadJobCost(period.previous.from, period.previous.to)]);
  const spec: DrillSpec<CostLine> = {
    path: PATH,
    title: "Job costing",
    dims: [
      { key: "job", label: "Job", plural: "jobs", of: (r) => (r.jobKey ? { key: r.jobKey, label: r.job } : null) },
      { key: "category", label: "Kind", plural: "kinds", of: (r) => ({ key: r.category, label: CATEGORY_LABEL[r.category] }) },
      { key: "trade", label: "Trade", plural: "trades", of: (r) => (r.trade ? { key: r.trade, label: r.tradeLabel } : null), trades: true },
    ],
    value: (r) => r.cents,
    dayOf: (r) => r.day,
  };
  const d = drill(spec, cur.lines.filter((l) => inRange(l.day, period.from, period.to)), period, sp, { previousRows: prev.lines });

  const jobFilter = one("job");
  const jobs = cur.jobs.filter((j) => (jobFilter ? j.jobKey === jobFilter : true));
  const billed = jobs.reduce((a, j) => a + j.billedCents, 0);
  const cost = d.total;
  const margin = billed - cost;
  const base = { ...periodParams(period) };

  const jobRows: TableRow[] = jobs
    .map((j) => {
      const c = j.laborCents + j.materialsCents + j.subsCents;
      return {
        id: j.jobKey || "none",
        job: j.job,
        jobHref: j.jobKey ? hrefOf(PATH, { ...base, job: j.jobKey, by: "category" }) : null,
        contract: j.contractCents,
        billed: j.billedCents,
        collected: j.collectedCents,
        labor: j.laborCents,
        materials: j.materialsCents,
        subs: j.subsCents,
        cost: c,
        margin: j.billedCents - c,
        marginPct: j.billedCents > 0 ? (j.billedCents - c) / j.billedCents : null,
        burn: j.contractCents ? c / j.contractCents : null,
      };
    })
    .sort((a, b) => Number(b.cost) - Number(a.cost));
  const jobColumns: Column[] = [
    { key: "job", header: "Job", kind: "text", hrefKey: "jobHref", phone: "title" },
    { key: "contract", header: "Contract", kind: "money", total: true, phone: "hide" },
    { key: "billed", header: "Billed", kind: "money", total: true },
    { key: "collected", header: "Collected", kind: "money", total: true, phone: "hide" },
    { key: "labor", header: "Labor", kind: "money", total: true },
    { key: "materials", header: "Materials", kind: "money", total: true },
    { key: "subs", header: "Subs", kind: "money", total: true },
    { key: "cost", header: "Cost", kind: "money", total: true, phone: "value" },
    { key: "margin", header: "Margin", kind: "money", total: true },
    { key: "marginPct", header: "Margin %", kind: "percent" },
    { key: "burn", header: "Cost / contract", kind: "percent", phone: "hide" },
  ];

  const lineRows: TableRow[] = d.rows.map((l) => ({
    id: l.id,
    day: l.day,
    job: l.job,
    kind: CATEGORY_LABEL[l.category],
    trade: l.tradeLabel,
    what: l.label,
    href: l.href,
    cents: l.cents,
  }));
  const lineColumns: Column[] = [
    { key: "what", header: "Line", kind: "text", hrefKey: "href", phone: "title" },
    { key: "day", header: "Date", kind: "date" },
    { key: "job", header: "Job", kind: "text", filter: true },
    { key: "kind", header: "Kind", kind: "text", filter: true },
    { key: "trade", header: "Trade", kind: "text", filter: true },
    { key: "cents", header: "Cost", kind: "money", total: true, phone: "value" },
  ];

  return (
    <AccountingFrame
      title="Job costing"
      intro="Labor (hours × current pay rate), materials and sub/vendor bills against what each job billed. Margin = billed − cost in the period."
      period={period}
      crumbs={[{ label: "Accounting", href: "/app/accounting" }, ...d.crumbs]}
      filters={d.filters}
    >
      {cur.payablesMissing ? <PayablesMissing /> : null}
      <KpiHeader
        label="Cost"
        value={cost}
        kind="money"
        change={d.change}
        upIsGood={false}
        compareLabel={period.previous.label}
        stats={[
          { label: "Billed", value: billed, kind: "money" },
          { label: "Margin", value: margin, kind: "money" },
          { label: "Margin %", value: billed > 0 ? margin / billed : null, kind: "percent" },
          { label: "Jobs", value: jobs.length, kind: "count", hint: cur.laborWithoutRate ? `${cur.laborWithoutRate} people without a rate` : undefined },
        ]}
        trend={d.trend}
        trendLabel="Cost"
        breakdown={d.breakdown}
        byOptions={d.byOptions}
      />
      <DataTable rows={jobRows} columns={jobColumns} searchKeys={["job"]} name={`job-costing-${period.key}`} initialSort={{ key: "cost", dir: "desc" }} empty="No job had cost or billing in this period." />
      <p className="pt-2 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--color-charcoal-light)]">Every cost line</p>
      <DataTable rows={lineRows} columns={lineColumns} searchKeys={["what", "job", "kind", "trade"]} name={`job-cost-lines-${period.key}`} rowHrefKey="href" initialSort={{ key: "day", dir: "desc" }} empty="No cost in this period." />
    </AccountingFrame>
  );
}
