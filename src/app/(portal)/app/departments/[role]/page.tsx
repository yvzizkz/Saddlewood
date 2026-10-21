import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Card } from "@/components/bot/ui";
import Breadcrumbs from "@/components/data/Breadcrumbs";
import DataTable, { type TableRow } from "@/components/data/DataTable";
import KpiHeader from "@/components/data/KpiHeader";
import { drill, type DrillSpec } from "@/lib/analytics/drill";
import { formatValue } from "@/lib/analytics/format";
import { resolvePeriod } from "@/lib/analytics/period";
import { getViewer, viewerIsOwner } from "@/lib/crew/auth";
import { addDays, localDay } from "@/lib/crew/time";
import { departmentTiles } from "@/lib/departments/home";
import { jobHref, listJobRefs } from "@/lib/jobs/hub";
import { ROLE_INFO, ROLES, seatHolder, type Role } from "@/lib/roles/seats";
import { loadPeople, loadSeats } from "@/lib/roles/store";
import { eventOverlaps, loadScheduleFeed } from "@/lib/schedule/feed";
import { KIND_LABEL, loadFeed, type FeedItem } from "@/lib/tasks/feed";

export const dynamic = "force-dynamic";

// A department's home: who holds the seat, the department's own figures,
// what is waiting on it (the one task feed), and its week (the one schedule).
// Every department uses the same page; what differs is read from the sections
// that own it.

type SP = Record<string, string | string[] | undefined>;

export default async function DepartmentPage({ params, searchParams }: { params: Promise<{ role: string }>; searchParams: Promise<SP> }) {
  if (!(await viewerIsOwner(await getViewer()))) redirect("/app");
  const [{ role: raw }, sp] = await Promise.all([params, searchParams]);
  if (!(ROLES as readonly string[]).includes(raw)) notFound();
  const role = raw as Role;
  const info = ROLE_INFO[role];
  const path = `/app/departments/${role}`;
  const today = localDay();

  const [refs, seats, people] = await Promise.all([listJobRefs(), loadSeats(), loadPeople()]);
  const [feed, schedule] = await Promise.all([loadFeed(refs, seats, today), loadScheduleFeed(refs, today).catch(() => [])]);
  const { tiles, table } = await departmentTiles(role, refs, feed, today);
  const holder = seatHolder(role, seats, people);
  const mine = feed.filter((i) => i.nowRole === role);

  const window = { ...resolvePeriod({ p: "custom", from: addDays(today, -28), to: addDays(today, 28) }, today), grain: "week" as const };
  const spec: DrillSpec<FeedItem> = {
    path,
    title: info.department,
    dims: [
      { key: "kind", label: "Kind", plural: "kinds", of: (i) => ({ key: i.kind, label: KIND_LABEL[i.kind] }) },
      { key: "job", label: "Job", plural: "jobs", of: (i) => (i.jobKey ? { key: i.jobKey, label: i.job } : null) },
    ],
    value: () => 1,
    dayOf: (i) => i.dueOn,
  };
  const d = drill(spec, mine, window, sp);
  const strip = (h: string) => h.replace(/([?&])(p|from|to)=[^&]*/g, "$1").replace(/&&+/g, "&").replace(/\?&/, "?").replace(/[?&]$/, "");
  for (const o of d.byOptions) o.href = strip(o.href);
  for (const s of d.breakdown.slices) if (s.href) s.href = strip(s.href);

  const week = schedule.filter((e) => e.role === role && eventOverlaps(e, today, addDays(today, 7))).sort((a, b) => a.startDay.localeCompare(b.startDay));
  const rows: TableRow[] = d.rows.map((i) => ({
    id: i.id,
    title: i.title,
    detail: i.detail,
    href: i.href,
    kind: KIND_LABEL[i.kind],
    job: i.job || null,
    jobHref: i.jobKey ? jobHref(i.jobKey) : null,
    due: i.dueOn,
    late: i.overdueDays || null,
    moved: i.escalated ? `from ${ROLE_INFO[i.role].label}` : null,
  }));

  return (
    <div className="px-4 pb-10 pt-4 md:px-8 md:pt-6">
      <Breadcrumbs crumbs={[{ label: "Departments", href: "/app/departments" }, ...d.crumbs.map((c) => ({ ...c, href: strip(c.href) }))]} filters={d.filters.map((f) => ({ ...f, clearHref: strip(f.clearHref) }))} />
      <header className="mb-4 mt-3 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--color-gold-accessible)]">Department</p>
          <h1 className="text-[var(--color-charcoal)]" style={{ fontFamily: "var(--font-fraunces)" }}>
            {info.department}
          </h1>
          <p className="mt-1 text-sm text-[var(--color-charcoal-light)]">
            {info.label} · held by <span className="font-medium text-[var(--color-charcoal)]">{holder.name}</span>
            {holder.covering ? " (covering)" : ""} ·{" "}
            <Link className="underline" href="/app/policies/rights">
              change
            </Link>
          </p>
        </div>
      </header>

      <div className="space-y-4">
        <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {tiles.map((t) => {
            const body = (
              <>
                <dt className="text-[11px] text-[var(--color-charcoal-light)]">{t.label}</dt>
                <dd className={`text-2xl font-semibold ${t.alert ? "text-[#9a2a1f]" : "text-[var(--color-charcoal)]"}`}>{formatValue(t.kind, t.value)}</dd>
                {t.hint ? <dd className="text-[11px] text-[var(--color-charcoal-light)]">{t.hint}</dd> : null}
              </>
            );
            return (
              <Card key={t.label} className="p-3">
                {t.href ? (
                  <Link href={t.href} className="block">
                    {body}
                  </Link>
                ) : (
                  body
                )}
              </Card>
            );
          })}
        </dl>

        <KpiHeader
          label="Waiting on this department"
          value={d.rows.length}
          kind="count"
          change={null}
          stats={[
            { label: "Overdue", value: d.rows.filter((i) => i.dueOn && i.dueOn < today).length, kind: "count" },
            { label: "Moved up to it", value: d.rows.filter((i) => i.escalated).length, kind: "count" },
            { label: "Due this week", value: d.rows.filter((i) => i.dueOn && i.dueOn >= today && i.dueOn <= addDays(today, 7)).length, kind: "count" },
          ]}
          trend={d.trend}
          trendLabel="Falling due, by week"
          breakdown={d.breakdown}
          byOptions={d.byOptions}
        />

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-4">
            <div className="mb-2 flex items-baseline justify-between">
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--color-charcoal-light)]">The next 7 days</p>
              <Link className="text-xs underline" href="/app/schedule">
                Schedule
              </Link>
            </div>
            {week.length ? (
              <ul className="divide-y divide-[var(--color-stone)]">
                {week.slice(0, 12).map((e) => (
                  <li key={e.id} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                    <Link href={e.href} className="min-w-0 truncate hover:underline">
                      {e.title}
                      {e.job ? <span className="text-[var(--color-charcoal-light)]"> · {e.job}</span> : null}
                    </Link>
                    <span className="shrink-0 text-xs text-[var(--color-charcoal-light)]">{formatValue("date", e.startDay)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-[var(--color-charcoal-light)]">Nothing dated for this department this week.</p>
            )}
          </Card>
          {table ? (
            <Card className="p-4">
              <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--color-charcoal-light)]">{table.title}</p>
              <ul className="divide-y divide-[var(--color-stone)]">
                {table.rows.map((r) => (
                  <li key={String(r.id)} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                    <span>{r.source}</span>
                    <span className="text-xs text-[var(--color-charcoal-light)]">
                      {r.open} open · {r.won} won · {r.rate === null ? "no decisions yet" : `${Math.round(Number(r.rate) * 100)}% win rate`}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>

        <DataTable
          rows={rows}
          columns={[
            { key: "title", header: "Waiting", kind: "text", hrefKey: "href", subKey: "detail", phone: "title" },
            { key: "kind", header: "Kind", kind: "text", filter: true },
            { key: "job", header: "Job", kind: "text", filter: true, hrefKey: "jobHref" },
            { key: "due", header: "Due", kind: "date", phone: "value" },
            { key: "late", header: "Days late", kind: "count" },
            { key: "moved", header: "Moved up", kind: "text", phone: "hide" },
          ]}
          searchKeys={["title", "detail", "kind", "job"]}
          name={`department-${role}`}
          rowHrefKey="href"
          initialSort={{ key: "late", dir: "desc" }}
          empty="Nothing is waiting on this department."
        />
      </div>
    </div>
  );
}
