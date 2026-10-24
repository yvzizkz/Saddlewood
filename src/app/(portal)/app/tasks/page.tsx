import Link from "next/link";
import { redirect } from "next/navigation";

import Breadcrumbs from "@/components/data/Breadcrumbs";
import DataTable, { type Column, type TableRow } from "@/components/data/DataTable";
import KpiHeader from "@/components/data/KpiHeader";
import { Card } from "@/components/bot/ui";
import { CloseTask, NewTask } from "@/components/tasks/TaskActions";
import { drill, hrefOf, type DrillSpec } from "@/lib/analytics/drill";
import { formatValue } from "@/lib/analytics/format";
import { resolvePeriod } from "@/lib/analytics/period";
import { addDays, localDay } from "@/lib/crew/time";
import { PM_ROLES, seesJob, workSeat } from "@/lib/jobs/access";
import { jobHref, listJobRefs } from "@/lib/jobs/hub";
import { ROLE_INFO, ROLES, seatHolder } from "@/lib/roles/seats";
import { loadPeople, loadSeats } from "@/lib/roles/store";
import { canCloseHere, departmentOf, KIND_LABEL, loadFeed, type FeedItem } from "@/lib/tasks/feed";
import { mineOf, seatFeedOf } from "@/lib/tasks/mine";

export const dynamic = "force-dynamic";

// Every task in the company, wherever it waits: work handed out here, the
// owners' waiting list, crew tasks, the ops board, bills waiting on approval.
// Mine, my team's, by job, by department; overdue items move up a role.
// A project manager sees the same list narrowed to their jobs (jobs/access.ts).

const PATH = "/app/tasks";
type SP = Record<string, string | string[] | undefined>;

const SOURCE: Record<FeedItem["source"], string> = { work: "Handed out", waiting: "Waiting on you", crew: "Crew task", ops: "Ops board", bill: "Payables", billing: "Billing" };

export default async function TasksPage({ searchParams }: { searchParams: Promise<SP> }) {
  const seat = await workSeat();
  if (!seat) redirect("/app");
  const me = seat.email;
  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]?.[0] : (sp[k] as string | undefined));
  const view = one("view") === "all" ? "all" : "mine";
  const today = localDay();

  const [allRefs, seats, people] = await Promise.all([listJobRefs(), loadSeats(), loadPeople()]);
  const refs = allRefs.filter((r) => seesJob(seat, r));
  // The same Mine the 7 AM push and Home's "Your tasks" read (tasks/mine.ts).
  const raw = await loadFeed(allRefs, seats, today);
  const feedSeat = { email: me, owner: seat.owner, jobs: seat.owner ? null : new Set(refs.map((r) => r.key)) };
  const feed = seatFeedOf(raw, feedSeat, seats, people);
  const mineAll = mineOf(raw, feedSeat, seats, people);
  const scoped = view === "mine" ? mineAll : feed;

  // The trend shows what falls due, four weeks back to four weeks ahead.
  const window = { ...resolvePeriod({ p: "custom", from: addDays(today, -28), to: addDays(today, 28) }, today), grain: "week" as const };
  const spec: DrillSpec<FeedItem> = {
    path: PATH,
    title: view === "mine" ? "Mine" : "Everyone",
    fixed: view === "all" ? { view: "all" } : {},
    dims: [
      { key: "dept", label: "Department", plural: "departments", of: (i) => ({ key: i.nowRole, label: departmentOf(i.nowRole) }) },
      { key: "job", label: "Job", plural: "jobs", of: (i) => (i.jobKey ? { key: i.jobKey, label: i.job } : null) },
      { key: "kind", label: "Kind", plural: "kinds", of: (i) => ({ key: i.kind, label: KIND_LABEL[i.kind] }) },
    ],
    value: () => 1,
    dayOf: (i) => i.dueOn,
  };
  const d = drill(spec, scoped, window, sp);
  const strip = (h: string) => h.replace(/([?&])(p|from|to)=[^&]*/g, "$1").replace(/&&+/g, "&").replace(/\?&/, "?").replace(/[?&]$/, "");
  for (const o of d.byOptions) o.href = strip(o.href);
  for (const s of d.breakdown.slices) if (s.href) s.href = strip(s.href);
  const crumbs = d.crumbs.map((c) => ({ ...c, href: strip(c.href) }));
  const filters = d.filters.map((f) => ({ ...f, clearHref: strip(f.clearHref) }));

  const holderName = (i: FeedItem) => {
    if (i.assignee) return people.find((p) => p.email === i.assignee)?.name ?? i.assignee;
    return seatHolder(i.nowRole, seats, people).name;
  };
  const overdue = d.rows.filter((i) => i.overdueDays > 0 && i.dueOn && i.dueOn < today);
  const escalated = d.rows.filter((i) => i.escalated);
  const thisWeek = d.rows.filter((i) => i.dueOn && i.dueOn >= today && i.dueOn <= addDays(today, 7));

  const rows: TableRow[] = d.rows.map((i) => ({
    id: i.id,
    title: i.title,
    detail: i.detail,
    href: i.href,
    kind: KIND_LABEL[i.kind],
    dept: departmentOf(i.nowRole),
    who: holderName(i) + (i.escalated ? ` (moved up from ${ROLE_INFO[i.role].label})` : ""),
    job: i.job || null,
    jobHref: i.jobKey ? jobHref(i.jobKey) : null,
    due: i.dueOn,
    late: i.overdueDays || null,
    source: SOURCE[i.source],
  }));
  const columns: Column[] = [
    { key: "title", header: "Task", kind: "text", hrefKey: "href", subKey: "detail", phone: "title" },
    { key: "who", header: "With", kind: "text", filter: true },
    { key: "dept", header: "Department", kind: "text", filter: true, phone: "hide" },
    { key: "job", header: "Job", kind: "text", filter: true, hrefKey: "jobHref" },
    { key: "kind", header: "Kind", kind: "text", filter: true, phone: "hide" },
    { key: "due", header: "Due", kind: "date", phone: "value" },
    { key: "late", header: "Days late", kind: "count" },
    { key: "source", header: "From", kind: "text", filter: true, phone: "hide" },
  ];
  const myWork = mineAll.filter((i) => canCloseHere(i, seat.owner));
  const roles = seat.owner ? ROLES : PM_ROLES;
  const opts = (xs: { value: string; label: string }[]) => xs;

  return (
    <div className="px-4 pb-10 pt-4 md:px-8 md:pt-6">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--color-gold-accessible)]">Work</p>
          <h1 className="text-[var(--color-charcoal)]" style={{ fontFamily: "var(--font-fraunces)" }}>
            Tasks
          </h1>
          <p className="mt-1 text-sm text-[var(--color-charcoal-light)]">
            {seat.owner ? "Everything waiting on someone, in one list." : "Everything waiting on someone on your jobs."} Work goes to a role; overdue work moves up one.
          </p>
        </div>
        <div className="flex rounded-xl border border-[var(--color-stone)] bg-[var(--color-cream)] p-1 text-[13px] font-medium" role="group" aria-label="Whose">
          {(["mine", "all"] as const).map((v) => (
            <Link key={v} href={v === "mine" ? PATH : `${PATH}?view=all`} aria-current={view === v ? "true" : undefined} className={`rounded-lg px-3 py-1.5 ${view === v ? "bg-white text-[var(--color-charcoal)] shadow-sm" : "text-[var(--color-charcoal-light)]"}`}>
              {v === "mine" ? `Mine (${mineAll.length})` : `${seat.owner ? "Everyone" : "My jobs"} (${feed.length})`}
            </Link>
          ))}
        </div>
      </header>

      <div className="mb-4">
        <NewTask
          roles={opts(roles.map((r) => ({ value: r, label: `${ROLE_INFO[r].label} (${seatHolder(r, seats, people).name})` })))}
          jobs={opts(refs.filter((r) => r.active).map((r) => ({ value: r.key, label: r.name })))}
          kinds={opts(Object.entries(KIND_LABEL).map(([value, label]) => ({ value, label })))}
        />
      </div>

      {crumbs.length > 1 ? (
        <div className="mb-4">
          <Breadcrumbs crumbs={crumbs} filters={filters} />
        </div>
      ) : null}

      <div className="space-y-4">
        <KpiHeader
          label={view === "mine" ? "Waiting on you" : "Open tasks"}
          value={d.rows.length}
          kind="count"
          change={null}
          stats={[
            { label: "Overdue", value: overdue.length, kind: "count" },
            { label: "Moved up", value: escalated.length, kind: "count", hint: "past due + grace" },
            { label: "Due this week", value: thisWeek.length, kind: "count" },
          ]}
          trend={d.trend}
          trendLabel="Falling due, by week"
          breakdown={d.breakdown}
          byOptions={d.byOptions}
        />

        {myWork.length ? (
          <Card className="p-4">
            <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--color-charcoal-light)]">Handed to you here</p>
            <ul className="divide-y divide-[var(--color-stone)]">
              {myWork.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div className="min-w-0">
                    <p className="text-sm text-[var(--color-charcoal)]">{i.title}</p>
                    <p className="text-xs text-[var(--color-charcoal-light)]">
                      {[KIND_LABEL[i.kind], i.job, i.dueOn ? `due ${formatValue("date", i.dueOn)}` : null].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <CloseTask id={Number(i.id.slice(1))} />
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        <DataTable rows={rows} columns={columns} searchKeys={["title", "detail", "who", "job", "kind", "source"]} name={`tasks-${view}`} rowHrefKey="href" initialSort={{ key: "late", dir: "desc" }} empty={view === "mine" ? "Nothing is waiting on you." : "No open tasks."} />
        <p className="text-xs text-[var(--color-charcoal-light)]">
          {seat.owner ? (
            <>
              Roles and who holds them: <Link className="underline" href="/app/policies/rights">Who decides</Link>.{" "}
            </>
          ) : null}
          {view === "mine" ? <Link className="underline" href={hrefOf(PATH, { view: "all" })}>See everyone&apos;s</Link> : null}
        </p>
      </div>
    </div>
  );
}
