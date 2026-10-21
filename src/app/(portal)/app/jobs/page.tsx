import { redirect } from "next/navigation";

import DataTable, { type Column, type TableRow } from "@/components/data/DataTable";
import KpiHeader from "@/components/data/KpiHeader";
import Breadcrumbs from "@/components/data/Breadcrumbs";
import PeriodPicker from "@/components/data/PeriodPicker";
import { drill, type DrillSpec } from "@/lib/analytics/drill";
import { inRange, resolvePeriod } from "@/lib/analytics/period";
import { CATEGORY_LABEL, loadJobCost, type CostLine } from "@/lib/accounting/jobCost";
import { loadOpenReceivables } from "@/lib/accounting/receivables";
import { localDay } from "@/lib/crew/time";
import { seesJob, workSeat } from "@/lib/jobs/access";
import { jobHref, listJobRefs, type JobRef } from "@/lib/jobs/hub";

export const dynamic = "force-dynamic";

// Every job, the hub everything else hangs off. The header shows where the
// money went in the period (by job, client, PM, kind of cost); the table is
// one row per job with its contract, billing, cost and margin, and opens the
// job page. A project manager sees their own jobs, and of the cost only what
// their seat may (jobs/access.ts): materials, labor dollars and sub bills by
// policy, margin only when cost and margin are on.

const PATH = "/app/jobs";
type SP = Record<string, string | string[] | undefined>;

export default async function JobsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const seat = await workSeat();
  if (!seat) redirect("/app");
  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]?.[0] : (sp[k] as string | undefined));
  const period = resolvePeriod({ p: one("p"), from: one("from"), to: one("to") }, undefined, "mtd");
  const today = localDay();

  const [allRefs, allCost, allPrev, allOpen] = await Promise.all([
    listJobRefs(),
    loadJobCost(period.from, period.to),
    loadJobCost(period.previous.from, period.previous.to),
    loadOpenReceivables(today),
  ]);
  const refs = allRefs.filter((r) => seesJob(seat, r));
  // The kinds of cost this seat sees: all of it with margin on; else materials, and labor when labor cost is on.
  const kinds = new Set<CostLine["category"]>(seat.margin ? ["labor", "materials", "subs"] : seat.laborCost ? ["labor", "materials"] : ["materials"]);
  const inView = (l: CostLine) => seat.owner || (kinds.has(l.category) && refs.some((r) => r.billingId === l.jobKey || `crew:${r.crewId}` === l.jobKey));
  const cost = { lines: allCost.lines.filter(inView), jobs: allCost.jobs };
  const prev = { lines: allPrev.lines.filter(inView) };
  const open = { rows: seat.owner ? allOpen.rows : allOpen.rows.filter((o) => refs.some((r) => r.billingId === o.jobId)) };
  const costLabel = seat.margin ? "Cost on jobs" : seat.laborCost ? "Labor and materials" : "Materials on jobs";
  // Cost lines are keyed by billing id or "crew:<id>"; find each one's job.
  const refOf = (key: string): JobRef | undefined => refs.find((r) => r.billingId === key || `crew:${r.crewId}` === key);

  type Line = CostLine & { client: string; pm: string };
  const enrich = (l: CostLine): Line => {
    const r = refOf(l.jobKey);
    return { ...l, client: r?.client || "No client", pm: r?.pm.join(", ") || "No PM" };
  };
  const spec: DrillSpec<Line> = {
    path: PATH,
    title: "Jobs",
    dims: [
      { key: "job", label: "Job", plural: "jobs", of: (l) => (l.jobKey ? { key: l.jobKey, label: l.job } : null) },
      { key: "client", label: "Client", plural: "clients", of: (l) => ({ key: l.client, label: l.client }) },
      { key: "pm", label: "PM", plural: "PMs", of: (l) => ({ key: l.pm, label: l.pm }) },
      { key: "category", label: "Kind", plural: "kinds", of: (l) => ({ key: l.category, label: CATEGORY_LABEL[l.category] }) },
    ],
    value: (l) => l.cents,
    dayOf: (l) => l.day,
  };
  const d = drill(spec, cost.lines.map(enrich).filter((l) => inRange(l.day, period.from, period.to)), period, sp, { previousRows: prev.lines.map(enrich) });

  const totals = new Map(cost.jobs.map((j) => [j.jobKey, j]));
  const rows: TableRow[] = refs.map((r) => {
    const t = totals.get(r.billingId ?? "") ?? totals.get(`crew:${r.crewId}`);
    const c = t ? (kinds.has("labor") ? t.laborCents : 0) + t.materialsCents + (kinds.has("subs") ? t.subsCents : 0) : 0;
    const owed = r.billingId ? open.rows.filter((o) => o.jobId === r.billingId) : [];
    return {
      id: r.key,
      job: r.name,
      href: jobHref(r.key),
      status: r.active ? "Active" : "Closed",
      client: r.client || "—",
      pm: r.pm.join(", ") || "—",
      contract: r.contractCents,
      billed: t?.billedCents ?? 0,
      cost: c,
      margin: (t?.billedCents ?? 0) - c,
      open: owed.reduce((a, o) => a + o.balanceCents, 0),
      late: owed.filter((o) => (o.daysLate ?? 0) > 0).length || null,
    };
  });
  const columns: Column[] = [
    { key: "job", header: "Job", kind: "text", hrefKey: "href", phone: "title" },
    { key: "status", header: "Status", kind: "text", filter: true, phone: "hide" },
    { key: "client", header: "Client", kind: "text", filter: true },
    { key: "pm", header: "PM", kind: "text", filter: true },
    { key: "contract", header: "Contract", kind: "money", total: true, phone: "hide" },
    { key: "billed", header: "Billed (period)", kind: "money", total: true },
    { key: "cost", header: seat.margin ? "Cost (period)" : `${costLabel.replace(" on jobs", "")} (period)`, kind: "money", total: true, phone: "hide" },
    ...(seat.margin ? [{ key: "margin", header: "Margin", kind: "money", total: true, phone: "hide" } as Column] : []),
    { key: "open", header: "Owed now", kind: "money", total: true, phone: "value" },
    { key: "late", header: "Late invoices", kind: "count", phone: "hide" },
  ];
  const active = refs.filter((r) => r.active);

  return (
    <div className="px-4 pb-10 pt-4 md:px-8 md:pt-6">
      <header className="mb-4">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--color-gold-accessible)]">Work</p>
        <h1 className="text-[var(--color-charcoal)]" style={{ fontFamily: "var(--font-fraunces)" }}>
          Jobs
        </h1>
        <p className="mt-1 text-sm text-[var(--color-charcoal-light)]">{seat.owner ? "Every job" : "Your jobs"}, and everything on it: money, labor, materials, subs, changes, documents and crew.</p>
      </header>
      <div className="mb-4">
        <PeriodPicker period={period} compareLabel={period.previous.label} />
      </div>
      {d.crumbs.length > 1 ? (
        <div className="mb-4">
          <Breadcrumbs crumbs={d.crumbs} filters={d.filters} />
        </div>
      ) : null}
      <div className="space-y-4">
        <KpiHeader
          label={costLabel}
          value={d.total}
          kind="money"
          change={d.change}
          upIsGood={false}
          compareLabel={period.previous.label}
          stats={[
            { label: "Active jobs", value: active.length, kind: "count" },
            { label: "Contract value", value: active.reduce((a, r) => a + (r.contractCents ?? 0), 0), kind: "money" },
            { label: "Owed now", value: open.rows.reduce((a, o) => a + o.balanceCents, 0), kind: "money", href: "/app/accounting/receivables" },
          ]}
          trend={d.trend}
          trendLabel="Cost"
          breakdown={d.breakdown}
          byOptions={d.byOptions}
        />
        <DataTable rows={rows} columns={columns} searchKeys={["job", "client", "pm"]} name={`jobs-${period.key}`} rowHrefKey="href" initialSort={{ key: "open", dir: "desc" }} empty="No jobs yet. Award a sale to open one." />
      </div>
    </div>
  );
}
