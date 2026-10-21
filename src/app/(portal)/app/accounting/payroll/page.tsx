import Link from "next/link";
import { redirect } from "next/navigation";

import AccountingFrame from "@/components/accounting/AccountingFrame";
import DataTable, { type Column, type TableRow } from "@/components/data/DataTable";
import KpiHeader from "@/components/data/KpiHeader";
import { drill, hrefOf, type DrillSpec } from "@/lib/analytics/drill";
import { inRange, periodParams, resolvePeriod } from "@/lib/analytics/period";
import { loadLabor, type LaborRow } from "@/lib/accounting/labor";
import { moneySeatForPage, seesCrewJob } from "@/lib/accounting/access";
import { clockText, localClock } from "@/lib/crew/time";

export const dynamic = "force-dynamic";

// Payroll and labor: hours from the time clock, by trade, job and person, for
// any period. Tap a bar to narrow everything to it; the table under the charts
// is every time entry behind the numbers. Owners only (pay rates).

const PATH = "/app/accounting/payroll";

type SP = Record<string, string | string[] | undefined>;

export default async function PayrollPage({ searchParams }: { searchParams: Promise<SP> }) {
  const seat = await moneySeatForPage("payroll");
  if (!seat) redirect("/app");
  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]?.[0] : (sp[k] as string | undefined));
  const period = resolvePeriod({ p: one("p"), from: one("from"), to: one("to") }, undefined, "today");
  // Labor dollars only for a seat that may see pay (owners; a PM if the policy says so).
  const measure = one("m") === "cost" && seat.laborCost ? "cost" : "hours";

  const loaded = await loadLabor(period.previous.from, period.to, { withPay: seat.laborCost });
  const rows = loaded.rows.filter((r) => seesCrewJob(seat, r.jobId));
  const ratesMissing = seat.owner ? loaded.ratesMissing : 0;
  const now = rows.filter((r) => inRange(r.day, period.from, period.to));
  const before = rows.filter((r) => inRange(r.day, period.previous.from, period.previous.to));

  const spec: DrillSpec<LaborRow> = {
    path: PATH,
    title: "Payroll",
    dims: [
      { key: "trade", label: "Trade", plural: "trades", of: (r) => (r.trade ? { key: r.trade, label: r.tradeLabel } : null), trades: true },
      { key: "job", label: "Job", plural: "jobs", of: (r) => ({ key: r.jobId, label: r.job }) },
      { key: "person", label: "Person", plural: "people", of: (r) => ({ key: r.email, label: r.person }) },
    ],
    value: measure === "cost" ? (r) => r.costCents ?? 0 : (r) => r.minutes,
    dayOf: (r) => r.day,
  };
  const d = drill(spec, now, period, sp, { previousRows: before });
  if (measure === "cost") {
    for (const o of d.byOptions) o.href = o.href + "&m=cost";
    for (const s of d.breakdown.slices) if (s.href) s.href += "&m=cost";
  }

  const minutes = d.rows.reduce((a, r) => a + r.minutes, 0);
  const cost = d.rows.reduce((a, r) => a + (r.costCents ?? 0), 0);
  const people = new Set(d.rows.map((r) => r.email)).size;
  const jobs = new Set(d.rows.map((r) => r.jobId)).size;
  const open = d.rows.filter((r) => r.open).length;
  const base = { ...periodParams(period), ...Object.fromEntries(d.filters.map((f) => [f.dim, f.key])) };

  const tableRows: TableRow[] = d.rows.map((r) => ({
    id: r.id,
    day: r.day,
    person: r.person,
    personHref: hrefOf(PATH, { ...base, person: r.email }),
    job: r.job,
    jobHref: hrefOf(PATH, { ...base, job: r.jobId }),
    trade: r.tradeLabel,
    span: `${clockText(localClock(r.startedAt))} – ${r.endedAt ? clockText(localClock(r.endedAt)) : "on the clock"}`,
    minutes: r.minutes,
    cost: r.costCents,
    flags: [r.open ? "Open" : "", r.edited ? "Edited" : "", r.source !== "app" ? `Entered: ${r.source}` : ""].filter(Boolean).join(", "),
    href: `${PATH}/entry/${r.id}`,
  }));

  const columns: Column[] = [
    { key: "day", header: "Day", kind: "date", phone: "detail" },
    { key: "person", header: "Person", kind: "text", filter: true, hrefKey: "personHref", phone: "title" },
    { key: "job", header: "Job", kind: "text", filter: true, hrefKey: "jobHref" },
    { key: "trade", header: "Trade", kind: "text", filter: true },
    { key: "span", header: "Clock", kind: "text", phone: "hide" },
    { key: "minutes", header: "Hours", kind: "hours", total: true, phone: "value" },
    ...(seat.laborCost ? [{ key: "cost", header: "Labor cost", kind: "money", total: true, phone: "detail" } as Column] : []),
    { key: "flags", header: "Notes", kind: "text", phone: "detail" },
  ];

  const toggle = (m: "hours" | "cost") => hrefOf(PATH, { ...d.params, m: m === "cost" ? "cost" : undefined });

  return (
    <AccountingFrame
      title="Payroll and labor"
      intro={seat.laborCost ? "Hours from the time clock, less breaks. Labor cost is hours × each person's current pay rate." : "Hours from the time clock on your jobs, less breaks."}
      period={period}
      crumbs={[{ label: "Accounting", href: "/app/accounting" }, ...d.crumbs]}
      filters={d.filters}
      sections={seat.sections}
      actions={
        !seat.laborCost ? undefined : (
        <div className="flex rounded-xl border border-[var(--color-stone)] bg-[var(--color-cream)] p-1 text-[13px] font-medium" role="group" aria-label="Measure">
          {(["hours", "cost"] as const).map((m) => (
            <Link
              key={m}
              href={toggle(m)}
              scroll={false}
              aria-current={measure === m ? "true" : undefined}
              className={`rounded-lg px-3 py-1.5 ${measure === m ? "bg-white text-[var(--color-charcoal)] shadow-sm" : "text-[var(--color-charcoal-light)]"}`}
            >
              {m === "hours" ? "Hours" : "Cost"}
            </Link>
          ))}
        </div>
        )
      }
    >
      <KpiHeader
        label={measure === "cost" ? "Labor cost" : "Labor hours"}
        value={measure === "cost" ? cost : minutes}
        kind={measure === "cost" ? "money" : "hours"}
        change={d.change}
        upIsGood={measure !== "cost"}
        compareLabel={period.previous.label}
        stats={[
          measure === "cost"
            ? { label: "Hours", value: minutes, kind: "hours" }
            : seat.laborCost
              ? { label: "Labor cost", value: cost, kind: "money", hint: ratesMissing ? `${ratesMissing} without a rate` : undefined }
              : { label: "Entries", value: d.rows.length, kind: "count" },
          { label: "People", value: people, kind: "count" },
          { label: "Jobs", value: jobs, kind: "count" },
          period.key === "today"
            ? { label: "On the clock", value: open, kind: "count" }
            : { label: "Per person", value: people ? Math.round(minutes / people) : 0, kind: "hours" },
        ]}
        trend={d.trend}
        trendLabel={period.grain === "day" ? "Per day" : period.grain === "week" ? "Per week" : "Per month"}
        breakdown={d.breakdown}
        byOptions={d.byOptions}
      />
      <DataTable
        rows={tableRows}
        columns={columns}
        searchKeys={["person", "job", "trade", "flags"]}
        name={`payroll-${period.key}`}
        rowHrefKey="href"
        initialSort={{ key: "day", dir: "desc" }}
        empty="No time on the clock in this period."
      />
    </AccountingFrame>
  );
}
