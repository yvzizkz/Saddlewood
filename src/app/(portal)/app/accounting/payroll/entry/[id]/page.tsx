import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import AccountingFrame from "@/components/accounting/AccountingFrame";
import { Card } from "@/components/bot/ui";
import { formatValue } from "@/lib/analytics/format";
import { when } from "@/components/money/format";
import { hrefOf } from "@/lib/analytics/drill";
import { listTrades, resolveTrade } from "@/lib/accounting/trades";
import { getViewer, viewerIsOwner } from "@/lib/crew/auth";
import { getJob, getPerson, getShift } from "@/lib/crew/queries";
import { clockText, localClock, weekStart, workedMinutes } from "@/lib/crew/time";

export const dynamic = "force-dynamic";

// One time entry: when, where, who, what it cost, how it was entered and every
// change made to it, with the way back to the person's week and the job.

const PATH = "/app/accounting/payroll";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-[var(--color-stone)] py-2.5 last:border-0">
      <dt className="text-sm text-[var(--color-charcoal-light)]">{label}</dt>
      <dd className="text-right text-sm font-medium text-[var(--color-charcoal)]">{children}</dd>
    </div>
  );
}

export default async function EntryPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await viewerIsOwner(await getViewer()))) redirect("/app");
  const { id } = await params;
  const n = Number(id);
  if (!Number.isInteger(n)) notFound();
  const shift = await getShift(n);
  if (!shift) notFound();
  const [person, job, trades] = await Promise.all([getPerson(shift.email), getJob(shift.jobId), listTrades()]);

  const minutes = workedMinutes(shift);
  const rate = person?.payRate ?? null;
  const trade = resolveTrade(person?.trade, trades);
  const week = { p: "custom", from: weekStart(shift.day), to: shift.day };
  const name = person?.name || shift.email;

  return (
    <AccountingFrame
      title={`${name}, ${formatValue("date", shift.day)}`}
      crumbs={[
        { label: "Accounting", href: "/app/accounting" },
        { label: "Payroll", href: PATH },
        { label: name, href: hrefOf(PATH, { p: "wtd", person: shift.email }) },
        { label: "Time entry", href: `${PATH}/entry/${shift.id}` },
      ]}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-4">
          <dl>
            <Row label="Hours">{formatValue("hours", minutes)}</Row>
            <Row label="Clock">
              {clockText(localClock(shift.startedAt))} – {shift.endedAt ? clockText(localClock(shift.endedAt)) : "on the clock"}
            </Row>
            <Row label="Unpaid break">{shift.breakMin} min</Row>
            <Row label="Labor cost">{rate !== null ? `${formatValue("money", Math.round((minutes / 60) * rate * 100))} at $${rate.toFixed(2)}/h` : "No pay rate on file"}</Row>
            <Row label="Trade">{trade?.label ?? "None"}</Row>
            <Row label="Entered">{shift.source === "app" ? "Clocked in on the phone" : shift.source === "late" ? "Late entry by the worker" : "Entered by the office"}</Row>
            {shift.fromJobM.in !== null ? <Row label="Clock-in distance">{Math.round(shift.fromJobM.in)} m from the job</Row> : null}
            {shift.note ? <Row label="Note">{shift.note}</Row> : null}
          </dl>
        </Card>
        <div className="space-y-3">
          <Card className="p-4">
            <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--color-charcoal-light)]">Linked</p>
            <ul className="space-y-2 text-sm">
              <li>
                <Link className="underline underline-offset-2" href={hrefOf(PATH, { ...week, person: shift.email })}>
                  {name}&apos;s hours this week
                </Link>
              </li>
              <li>
                <Link className="underline underline-offset-2" href={hrefOf(PATH, { p: "mtd", job: shift.jobId })}>
                  Labor on {job?.name ?? shift.jobName} this month
                </Link>
              </li>
              <li>
                <Link className="underline underline-offset-2" href="/app/crew?view=hours">
                  Fix the time in Crew › Hours
                </Link>
              </li>
            </ul>
          </Card>
          {shift.edits.length ? (
            <Card className="p-4">
              <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--color-charcoal-light)]">Changes</p>
              <ul className="space-y-1.5 text-sm text-[var(--color-charcoal)]">
                {shift.edits.map((e, i) => (
                  <li key={i}>
                    <span className="font-medium">{when(e.at)}</span> by {e.by}
                    {e.why ? `: ${e.why}` : ""}
                    <span className="block text-xs text-[var(--color-charcoal-light)]">
                      Was {clockText(localClock(e.was.startedAt))} – {e.was.endedAt ? clockText(localClock(e.was.endedAt)) : "open"}, {e.was.breakMin} min break, {e.was.jobName}
                      {e.was.status === "void" ? " (void)" : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      </div>
    </AccountingFrame>
  );
}
