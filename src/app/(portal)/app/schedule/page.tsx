import Link from "next/link";
import { redirect } from "next/navigation";

import { Card } from "@/components/bot/ui";
import Breadcrumbs from "@/components/data/Breadcrumbs";
import DataTable, { type Column, type TableRow } from "@/components/data/DataTable";
import KpiHeader from "@/components/data/KpiHeader";
import { LookAheadDraftCard, NewScheduleItem, ScheduleStatusButton } from "@/components/schedule/ScheduleActions";
import { drill, hrefOf, type DrillSpec } from "@/lib/analytics/drill";
import { formatValue } from "@/lib/analytics/format";
import { resolvePeriod } from "@/lib/analytics/period";
import { addDays, dayShort, localDay } from "@/lib/crew/time";
import { PM_ROLES, seesJob, workSeat } from "@/lib/jobs/access";
import { jobHref, listJobRefs } from "@/lib/jobs/hub";
import { ROLE_INFO, ROLES, seatHolder } from "@/lib/roles/seats";
import { loadPeople, loadSeats } from "@/lib/roles/store";
import {
  buildGcLookAheadDrafts,
  EDITABLE_SCHEDULE_KINDS,
  eventFallsOn,
  eventOverlaps,
  loadScheduleFeed,
  monthGrid,
  scheduleForSeat,
  weekDays,
  type ScheduleEvent,
} from "@/lib/schedule/feed";

export const dynamic = "force-dynamic";

const PATH = "/app/schedule";
type SP = Record<string, string | string[] | undefined>;
type ViewMode = "day" | "week" | "month" | "lookahead";

const KIND_TONE: Record<string, string> = {
  inspection: "border-[#9a2a1f]/30 bg-[#9a2a1f]/10 text-[#9a2a1f]",
  delivery: "border-[var(--color-teal)]/30 bg-[var(--color-teal)]/10 text-[var(--color-teal)]",
  sub_mobilization: "border-[#8a5a19]/30 bg-[#8a5a19]/10 text-[#8a5a19]",
  site_visit: "border-[var(--color-charcoal)]/20 bg-[var(--color-cream)] text-[var(--color-charcoal)]",
  crew: "border-[var(--color-stone)] bg-white text-[var(--color-charcoal)]",
  phase: "border-[var(--color-stone)] bg-[var(--color-cream)] text-[var(--color-charcoal-light)]",
  billing_cutoff: "border-[#9a2a1f]/30 bg-[#9a2a1f]/10 text-[#9a2a1f]",
  pay_day: "border-[#8a5a19]/30 bg-[#8a5a19]/10 text-[#8a5a19]",
};

export default async function SchedulePage({ searchParams }: { searchParams: Promise<SP> }) {
  // Owners see every job; a project manager their own (jobs/access.ts), and writes on them.
  const seat = await workSeat();
  if (!seat) redirect("/app");
  const owner = seat.owner;
  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]?.[0] : (sp[k] as string | undefined));

  const today = localDay();
  const rawView = one("view");
  const view: ViewMode =
    rawView === "day" || rawView === "week" || rawView === "month" || rawView === "lookahead" ? rawView : "week";
  const anchor = one("day") && /^\d{4}-\d{2}-\d{2}$/.test(one("day")!) ? one("day")! : today;

  const [allRefs, seats, people] = await Promise.all([listJobRefs(), loadSeats(), loadPeople()]);
  const refs = owner ? allRefs : allRefs.filter((r) => seesJob(seat, r));
  const allEvents = scheduleForSeat(await loadScheduleFeed(allRefs, today), owner ? null : new Set(refs.map((r) => r.key)), refs, seat.money);

  const wDays = weekDays(anchor);
  const mGrid = monthGrid(anchor);

  const rangeFrom =
    view === "day"
      ? anchor
      : view === "week"
        ? wDays[0]
        : view === "month"
          ? mGrid.weeks[0][0]
          : anchor;
  const rangeTo =
    view === "day"
      ? anchor
      : view === "week"
        ? wDays[6]
        : view === "month"
          ? mGrid.weeks[mGrid.weeks.length - 1][6]
          : addDays(anchor, 13);

  const windowEvents = allEvents.filter((e) => eventOverlaps(e, rangeFrom, rangeTo));
  const period = {
    ...resolvePeriod({ p: "custom", from: rangeFrom, to: rangeTo }, today),
    grain: view === "month" ? ("week" as const) : ("day" as const),
  };

  const spec: DrillSpec<ScheduleEvent> = {
    path: PATH,
    title: "Schedule",
    fixed: { view, ...(anchor !== today ? { day: anchor } : {}) },
    dims: [
      { key: "kind", label: "Kind", plural: "kinds", of: (e) => ({ key: e.kind, label: e.kindLabel }) },
      { key: "job", label: "Job", plural: "jobs", of: (e) => (e.jobKey ? { key: e.jobKey, label: e.job } : { key: "company", label: "Company-wide" }) },
      { key: "role", label: "Role", plural: "roles", of: (e) => ({ key: e.role, label: ROLE_INFO[e.role].label }) },
    ],
    value: () => 1,
    dayOf: (e) => e.startDay,
  };
  const d = drill(spec, windowEvents, period, sp);
  const strip = (h: string) => h.replace(/([?&])(p|from|to)=[^&]*/g, "$1").replace(/&&+/g, "&").replace(/\?&/, "?").replace(/[?&]$/, "");
  for (const o of d.byOptions) o.href = strip(o.href);
  for (const s of d.breakdown.slices) if (s.href) s.href = strip(s.href);
  const crumbs = d.crumbs.map((c) => ({ ...c, href: strip(c.href) }));
  const filters = d.filters.map((f) => ({ ...f, clearHref: strip(f.clearHref) }));

  const inspectionsCount = d.rows.filter((e) => e.kind === "inspection" || e.kind === "site_visit").length;
  const crewCount = d.rows.filter((e) => e.kind === "crew").length;
  const cutoffsCount = d.rows.filter((e) => e.kind === "billing_cutoff" || e.kind === "pay_day").length;
  const overdueCount = allEvents.filter((e) => e.status === "overdue").length;

  const activeJobs = refs.filter((r) => r.active);
  const lookAheadDrafts = buildGcLookAheadDrafts(allEvents, refs, anchor);
  const editableItems = d.rows.filter((e) => e.editable && e.itemId);

  const tableRows: TableRow[] = d.rows.map((e) => ({
    id: e.id,
    day: e.startDay,
    time: e.startTime || "All day",
    title: e.title,
    detail: e.detail,
    href: e.href,
    kind: e.kindLabel,
    job: e.job,
    jobHref: e.jobKey ? jobHref(e.jobKey, "schedule") : null,
    who: e.who,
    status: e.status === "overdue" ? "Overdue" : e.status === "done" ? "Done" : "Scheduled",
  }));
  const columns: Column[] = [
    { key: "day", header: "Date", kind: "date" },
    { key: "time", header: "Time", kind: "text", phone: "hide" },
    { key: "title", header: "Event", kind: "text", hrefKey: "href", subKey: "detail", phone: "title" },
    { key: "kind", header: "Kind", kind: "text", filter: true },
    { key: "job", header: "Job", kind: "text", filter: true, hrefKey: "jobHref" },
    { key: "who", header: "Who", kind: "text", filter: true, phone: "hide" },
    { key: "status", header: "Status", kind: "text", filter: true, phone: "value" },
  ];

  const prevAnchor =
    view === "day"
      ? addDays(anchor, -1)
      : view === "week"
        ? addDays(anchor, -7)
        : view === "month"
          ? addDays(`${anchor.slice(0, 7)}-01`, -1).slice(0, 8) + "01"
          : addDays(anchor, -7);
  const nextAnchor =
    view === "day"
      ? addDays(anchor, 1)
      : view === "week"
        ? addDays(anchor, 7)
        : view === "month"
          ? addDays(`${anchor.slice(0, 7)}-28`, 7).slice(0, 8) + "01"
          : addDays(anchor, 7);

  return (
    <div className="px-4 pb-10 pt-4 md:px-8 md:pt-6">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--color-gold-accessible)]">Work</p>
          <h1 className="text-[var(--color-charcoal)]" style={{ fontFamily: "var(--font-fraunces)" }}>
            Schedule
          </h1>
          <p className="mt-1 text-sm text-[var(--color-charcoal-light)]">
            {owner
              ? "One schedule over crew dispatch, job phases, inspections, deliveries, sub mobilizations, client billing cutoffs and compliance dates."
              : "Your jobs: crew dispatch, phases, inspections, deliveries, sub mobilizations and your clients' billing cutoffs."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl border border-[var(--color-stone)] bg-[var(--color-cream)] p-1 text-[13px] font-medium" role="group" aria-label="Schedule view">
            {(
              [
                ["day", "My day"],
                ["week", "Week board"],
                ["month", "Month"],
                ["lookahead", "GC look-ahead"],
              ] as const
            ).map(([k, label]) => (
              <Link
                key={k}
                href={hrefOf(PATH, { view: k, ...(anchor !== today ? { day: anchor } : {}) })}
                aria-current={view === k ? "true" : undefined}
                className={`rounded-lg px-3 py-1.5 ${view === k ? "bg-white text-[var(--color-charcoal)] shadow-sm" : "text-[var(--color-charcoal-light)]"}`}
              >
                {label}
              </Link>
            ))}
          </div>
          <div className="flex items-center gap-1 rounded-xl border border-[var(--color-stone)] bg-white p-1 text-xs">
            <Link href={hrefOf(PATH, { view, day: prevAnchor })} className="rounded-lg px-2.5 py-1 text-[var(--color-charcoal)] hover:bg-[var(--color-cream)]">
              ← Prev
            </Link>
            <Link href={hrefOf(PATH, { view })} className="rounded-lg px-2.5 py-1 font-medium text-[var(--color-charcoal)] hover:bg-[var(--color-cream)]">
              Today
            </Link>
            <Link href={hrefOf(PATH, { view, day: nextAnchor })} className="rounded-lg px-2.5 py-1 text-[var(--color-charcoal)] hover:bg-[var(--color-cream)]">
              Next →
            </Link>
          </div>
        </div>
      </header>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        {owner || activeJobs.length ? (
          <NewScheduleItem
            jobs={activeJobs.map((r) => ({ value: r.key, label: r.name }))}
            kinds={EDITABLE_SCHEDULE_KINDS}
            roles={(owner ? ROLES : PM_ROLES).map((r) => ({ value: r, label: `${ROLE_INFO[r].label} (${seatHolder(r, seats, people).name})` }))}
            defaultDay={anchor}
            jobRequired={!owner}
          />
        ) : (
          <span />
        )}
        <span className="text-xs text-[var(--color-charcoal-light)]">
          Showing {formatValue("date", rangeFrom)} – {formatValue("date", rangeTo)}
          {owner ? (
            <>
              {" · "}
              <Link href="/internal/ops/calendar" className="underline">
                Company 30/90-day goals
              </Link>
            </>
          ) : null}
        </span>
      </div>

      {crumbs.length > 1 ? (
        <div className="mb-4">
          <Breadcrumbs crumbs={crumbs} filters={filters} />
        </div>
      ) : null}

      <div className="space-y-5">
        <KpiHeader
          label={view === "day" ? `Events on ${dayShort(anchor)}` : "Scheduled events"}
          value={d.rows.length}
          kind="count"
          change={null}
          stats={[
            { label: "Crew dispatches", value: crewCount, kind: "count" },
            { label: "Inspections & walks", value: inspectionsCount, kind: "count" },
            { label: "Cutoffs & pay runs", value: cutoffsCount, kind: "count" },
            { label: "Overdue items", value: overdueCount, kind: "count" },
          ]}
          trend={d.trend}
          trendLabel="Events by day"
          breakdown={d.breakdown}
          byOptions={d.byOptions}
        />

        {/* VIEW 1: MY DAY (phone-first agenda) */}
        {view === "day" ? (
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="p-4">
              <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--color-charcoal-light)]">
                Where to be & what&apos;s happening · {dayShort(anchor)}
              </p>
              {d.rows.length ? (
                <ul className="divide-y divide-[var(--color-stone)]">
                  {d.rows.map((e) => (
                    <li key={e.id} className="flex items-start justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className={`inline-block rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${KIND_TONE[e.kind] ?? "border-[var(--color-stone)] bg-[var(--color-cream)]"}`}>
                            {e.kindLabel}
                          </span>
                          {e.startTime ? <span className="font-mono text-xs text-[var(--color-charcoal-light)]">{e.startTime}</span> : null}
                          <Link href={e.href} className="text-sm font-medium text-[var(--color-charcoal)] hover:underline">
                            {e.title}
                          </Link>
                        </div>
                        <p className="mt-0.5 text-xs text-[var(--color-charcoal-light)]">
                          {[e.job, e.who, e.detail].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                      {e.editable && e.itemId ? <ScheduleStatusButton id={e.itemId} status={e.status} /> : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-[var(--color-charcoal-light)]">Nothing scheduled on {dayShort(anchor)}.</p>
              )}
            </Card>
            <Card className="p-4">
              <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--color-charcoal-light)]">
                Overdue or needs attention ({overdueCount})
              </p>
              {overdueCount ? (
                <ul className="divide-y divide-[var(--color-stone)]">
                  {allEvents
                    .filter((e) => e.status === "overdue")
                    .slice(0, 10)
                    .map((e) => (
                      <li key={e.id} className="py-2">
                        <div className="flex items-center justify-between gap-2">
                          <Link href={e.href} className="text-sm font-medium text-[#9a2a1f] hover:underline">
                            {e.title}
                          </Link>
                          <span className="text-xs text-[#9a2a1f]">{dayShort(e.startDay)}</span>
                        </div>
                        <p className="text-xs text-[var(--color-charcoal-light)]">{[e.kindLabel, e.job, e.detail].filter(Boolean).join(" · ")}</p>
                      </li>
                    ))}
                </ul>
              ) : (
                <p className="text-sm text-[var(--color-charcoal-light)]">Nothing overdue on the schedule.</p>
              )}
            </Card>
          </div>
        ) : null}

        {/* VIEW 2: WEEK BOARD (jobs × 7 days matrix) */}
        {view === "week" ? (
          <Card className="overflow-x-auto p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--color-charcoal-light)]">
                Week board · Jobs × Days ({dayShort(wDays[0])} – {dayShort(wDays[6])})
              </p>
              {owner ? (
                <Link href="/app/crew" className="text-xs underline text-[var(--color-charcoal-light)]">
                  Edit crew dispatch in Crew
                </Link>
              ) : null}
            </div>
            <table className="w-full min-w-[920px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-[var(--color-stone)] text-[11px] uppercase tracking-wider text-[var(--color-charcoal-light)]">
                  <th className="w-48 py-2 pr-3 font-medium">Job / Lane</th>
                  {wDays.map((day) => (
                    <th
                      key={day}
                      className={`px-2 py-2 font-medium ${day === today ? "bg-[var(--color-cream)] text-[var(--color-charcoal)] rounded-t-lg" : ""}`}
                    >
                      <Link href={hrefOf(PATH, { view: "day", day })} className="hover:underline">
                        {new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })}
                      </Link>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-stone)]">
                {activeJobs.map((j) => {
                  const jobEvs = d.rows.filter((e) => e.jobKey === j.key);
                  return (
                    <tr key={j.key} className="align-top">
                      <td className="py-2.5 pr-3">
                        <Link href={jobHref(j.key, "schedule")} className="font-medium text-[var(--color-charcoal)] hover:underline">
                          {j.name}
                        </Link>
                        {j.client ? <p className="text-[11px] text-[var(--color-charcoal-light)]">{j.client}</p> : null}
                      </td>
                      {wDays.map((day) => {
                        const cell = jobEvs.filter((e) => eventFallsOn(e, day));
                        return (
                          <td key={day} className={`px-1.5 py-2 ${day === today ? "bg-[var(--color-cream)]/40" : ""}`}>
                            <div className="space-y-1">
                              {cell.map((ev) => (
                                <Link
                                  key={ev.id}
                                  href={ev.href}
                                  className={`block rounded-md border px-1.5 py-1 text-[11px] leading-tight ${KIND_TONE[ev.kind] ?? "border-[var(--color-stone)] bg-white text-[var(--color-charcoal)]"}`}
                                >
                                  <span className="font-medium">
                                    {ev.startTime ? `${ev.startTime} ` : ""}
                                    {ev.kind === "crew" ? ev.who : ev.title}
                                  </span>
                                  {ev.kind !== "crew" ? (
                                    <span className="block text-[10px] opacity-80">{ev.kindLabel}</span>
                                  ) : null}
                                </Link>
                              ))}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
                {/* Company-wide row: billing cutoffs, Friday payroll/Melio runs, COI watches, goals */}
                <tr className="align-top bg-[var(--color-background)]/60">
                  <td className="py-2.5 pr-3">
                    <span className="font-medium text-[var(--color-charcoal)]">{owner ? "Billing, Pay Runs & Compliance" : "Billing cutoffs"}</span>
                    <p className="text-[11px] text-[var(--color-charcoal-light)]">{owner ? "Cutoffs, Friday runs, COI watches" : "Your clients' cutoffs and % complete due"}</p>
                  </td>
                  {wDays.map((day) => {
                    const cell = d.rows.filter((e) => !e.jobKey && eventFallsOn(e, day));
                    return (
                      <td key={day} className="px-1.5 py-2">
                        <div className="space-y-1">
                          {cell.map((ev) => (
                            <Link
                              key={ev.id}
                              href={ev.href}
                              className={`block rounded-md border px-1.5 py-1 text-[11px] leading-tight ${KIND_TONE[ev.kind] ?? "border-[var(--color-stone)] bg-white"}`}
                            >
                              <span className="font-medium">{ev.title}</span>
                              <span className="block text-[10px] opacity-80">{ev.kindLabel}</span>
                            </Link>
                          ))}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </Card>
        ) : null}

        {/* VIEW 3: MONTH CALENDAR */}
        {view === "month" ? (
          <Card className="p-4">
            <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--color-charcoal-light)]">
              {mGrid.monthLabel}
            </p>
            <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium uppercase text-[var(--color-charcoal-light)] mb-1">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((wd) => (
                <div key={wd} className="py-1">
                  {wd}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {mGrid.weeks.flat().map((day) => {
                const inMonth = day.startsWith(mGrid.monthPrefix);
                const cell = d.rows.filter((e) => eventFallsOn(e, day) && e.kind !== "phase");
                return (
                  <div
                    key={day}
                    className={`min-h-24 rounded-xl border p-1.5 text-xs ${
                      day === today
                        ? "border-[var(--color-teal)] bg-[var(--color-cream)]/60"
                        : inMonth
                          ? "border-[var(--color-stone)] bg-white"
                          : "border-[var(--color-stone)]/50 bg-[var(--color-background)] opacity-60"
                    }`}
                  >
                    <div className="mb-1 flex items-center justify-between">
                      <Link href={hrefOf(PATH, { view: "day", day })} className="font-mono text-[11px] font-semibold text-[var(--color-charcoal)] hover:underline">
                        {Number(day.slice(-2))}
                      </Link>
                      {cell.length ? <span className="text-[10px] text-[var(--color-charcoal-light)]">{cell.length}</span> : null}
                    </div>
                    <div className="space-y-1">
                      {cell.slice(0, 3).map((ev) => (
                        <Link
                          key={ev.id}
                          href={ev.href}
                          className={`block truncate rounded border px-1 py-0.5 text-[10px] ${KIND_TONE[ev.kind] ?? "border-[var(--color-stone)] bg-[var(--color-cream)]"}`}
                        >
                          {ev.kind === "crew" ? ev.who : ev.title}
                        </Link>
                      ))}
                      {cell.length > 3 ? (
                        <Link href={hrefOf(PATH, { view: "day", day })} className="block text-[10px] text-[var(--color-charcoal-light)] hover:underline">
                          +{cell.length - 3} more
                        </Link>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        ) : null}

        {/* VIEW 4: TWO-WEEK GC LOOK-AHEAD DRAFTS */}
        {view === "lookahead" ? (
          <div className="space-y-4">
            <Card className="p-4">
              <p className="text-sm text-[var(--color-charcoal)]">
                <strong>Wednesday Two-Week Look-Ahead per GC/Client (SOP-006).</strong> Drafted from live phases, crew dispatches, inspections, deliveries and sub mobilizations for the next 14 days ({formatValue("date", anchor)} – {formatValue("date", addDays(anchor, 13))}). Review and copy — never sent automatically.
              </p>
            </Card>
            {lookAheadDrafts.map((draft) => (
              <LookAheadDraftCard key={draft.client} draft={draft} />
            ))}
          </div>
        ) : null}

        {/* EDITABLE SCHEDULE ITEMS QUICK CARD */}
        {editableItems.length && view !== "day" ? (
          <Card className="p-4">
            <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--color-charcoal-light)]">
              Inspections, deliveries, site visits & sub mobilizations in window ({editableItems.length})
            </p>
            <ul className="divide-y divide-[var(--color-stone)]">
              {editableItems.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`inline-block rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${KIND_TONE[e.kind] ?? ""}`}>
                        {e.kindLabel}
                      </span>
                      <Link href={e.href} className="text-sm font-medium text-[var(--color-charcoal)] hover:underline">
                        {e.title}
                      </Link>
                    </div>
                    <p className="text-xs text-[var(--color-charcoal-light)]">
                      {[
                        e.endDay !== e.startDay ? `${dayShort(e.startDay)} – ${dayShort(e.endDay)}` : dayShort(e.startDay),
                        e.startTime,
                        e.job,
                        e.who,
                        e.detail,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <ScheduleStatusButton id={e.itemId!} status={e.status} />
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        <DataTable
          rows={tableRows}
          columns={columns}
          searchKeys={["title", "detail", "kind", "job", "who", "status"]}
          name={`schedule-${view}-${anchor}`}
          rowHrefKey="href"
          initialSort={{ key: "day", dir: "asc" }}
          empty="No events in this window."
        />
      </div>
    </div>
  );
}
