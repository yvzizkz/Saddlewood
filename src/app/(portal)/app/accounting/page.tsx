import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";

import AccountingFrame from "@/components/accounting/AccountingFrame";
import { Sparkline } from "@/components/data/charts";
import { trend } from "@/lib/analytics/aggregate";
import { formatValue, type ValueKind } from "@/lib/analytics/format";
import { inRange, periodParams, resolvePeriod } from "@/lib/analytics/period";
import { hrefOf } from "@/lib/analytics/drill";
import { loadLabor } from "@/lib/accounting/labor";
import { loadPayables } from "@/lib/accounting/payables";
import PayablesMissing from "@/components/accounting/PayablesMissing";
import { loadPurchases } from "@/lib/accounting/purchases";
import { loadBillingCalendar, loadIssued, loadOpenReceivables } from "@/lib/accounting/receivables";
import { moneySeatForPage, seesBillingJob, seesCrewJob } from "@/lib/accounting/access";
import { localDay } from "@/lib/crew/time";

export const dynamic = "force-dynamic";

// The Accounting hub: one card per section with its number for the period,
// how it ran, and the one thing that needs attention. Every card opens its
// section on the same period.

type SP = Record<string, string | string[] | undefined>;

type Tile = {
  href: string;
  title: string;
  value: number;
  kind: ValueKind;
  sub: string;
  spark?: number[];
  alert?: { text: string; href?: string } | null;
};

function SectionCard({ t }: { t: Tile }) {
  return (
    <div className="flex h-full flex-col rounded-2xl border border-[var(--color-stone)] bg-white p-4 transition-shadow hover:shadow-sm">
      <Link href={t.href} className="group flex-1">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-[var(--color-charcoal)]">{t.title}</p>
          <ArrowRight className="size-4 text-[var(--color-charcoal-light)] transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </div>
        <div className="mt-3 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[28px] font-semibold leading-none tracking-tight text-[var(--color-charcoal)]">{formatValue(t.kind, t.value)}</p>
            <p className="mt-1.5 text-xs text-[var(--color-charcoal-light)]">{t.sub}</p>
          </div>
          {t.spark ? <Sparkline values={t.spark} /> : null}
        </div>
      </Link>
      {t.alert ? (
        t.alert.href ? (
          <Link href={t.alert.href} className="mt-3 rounded-lg bg-[rgba(212,175,55,0.16)] px-2.5 py-1.5 text-xs font-medium text-[#6b5212] hover:bg-[rgba(212,175,55,0.26)]">
            {t.alert.text}
          </Link>
        ) : (
          <p className="mt-3 rounded-lg bg-[rgba(212,175,55,0.16)] px-2.5 py-1.5 text-xs font-medium text-[#6b5212]">{t.alert.text}</p>
        )
      ) : null}
    </div>
  );
}

export default async function AccountingHome({ searchParams }: { searchParams: Promise<SP> }) {
  const seat = await moneySeatForPage("overview");
  if (!seat) redirect("/app");
  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]?.[0] : (sp[k] as string | undefined));
  const period = resolvePeriod({ p: one("p"), from: one("from"), to: one("to") }, undefined, "wtd");
  const today = localDay();
  const q = periodParams(period);
  const link = (path: string, extra: Record<string, string> = {}) => hrefOf(path, { ...q, ...extra });

  const [laborAll, purchasesAll, payablesAll, openAll, issuedAll, calendar] = await Promise.all([
    loadLabor(period.from, period.to, { withPay: seat.laborCost }),
    loadPurchases(period.from, period.to),
    seat.owner ? loadPayables(today) : Promise.resolve({ rows: [], payments: [], trades: [], fridayCutoff: today, missing: false }),
    loadOpenReceivables(today),
    loadIssued(period.from, period.to),
    loadBillingCalendar(today),
  ]);
  // Narrowed to the seat's jobs (a PM sees theirs; owners see all).
  const labor = { ...laborAll, rows: laborAll.rows.filter((r) => seesCrewJob(seat, r.jobId)), ratesMissing: seat.owner ? laborAll.ratesMissing : 0 };
  const purchases = { ...purchasesAll, rows: purchasesAll.rows.filter((r) => seesCrewJob(seat, r.rawJobId)), unmatched: seat.owner ? purchasesAll.unmatched : [] };
  const payables = payablesAll;
  const open = { ...openAll, rows: openAll.rows.filter((r) => seesBillingJob(seat, r.jobId)) };
  const issued = issuedAll.filter((r) => seesBillingJob(seat, r.jobId));

  const spark = <T,>(rows: T[], day: (r: T) => string | null, v: (r: T) => number) =>
    trend(rows, day, v, period.from, period.to, period.grain).map((p) => p.value);

  const minutes = labor.rows.reduce((a, r) => a + r.minutes, 0);
  const laborCost = labor.rows.reduce((a, r) => a + (r.costCents ?? 0), 0);
  const lines = purchases.rows.filter((r) => !r.ignored && inRange(r.purchasedOn, period.from, period.to));
  const spend = lines.reduce((a, r) => a + r.lineTotalCents, 0);
  const unassigned = purchases.unmatched.length;
  const openAp = payables.rows.filter((r) => r.balanceCents > 0);
  const apOpen = openAp.reduce((a, r) => a + r.balanceCents, 0);
  const dueFriday = openAp.filter((r) => r.dueOn && r.dueOn <= payables.fridayCutoff).reduce((a, r) => a + r.balanceCents, 0);
  const held = openAp.filter((r) => r.holdReason).length;
  const arOpen = open.rows.reduce((a, r) => a + r.balanceCents, 0);
  const late = open.rows.filter((r) => (r.daysLate ?? 0) > 0 && !r.payWhenPaid);
  const billed = issued.filter((r) => r.status === "issued").reduce((a, r) => a + r.totalCents, 0);
  const drafts = issued.filter((r) => r.status === "draft").length;
  const next = calendar[0];
  const bills = payables.rows.filter((r) => inRange(r.issuedOn, period.from, period.to) && !r.purchaseTripKey).reduce((a, r) => a + r.amountCents, 0);
  const cost = laborCost + spend + bills;

  const tiles: Tile[] = [
    {
      href: link("/app/accounting/payroll"),
      title: "Payroll and labor",
      value: minutes,
      kind: "hours",
      sub: `${formatValue("money", laborCost)} labor cost · ${new Set(labor.rows.map((r) => r.email)).size} people`,
      spark: spark(labor.rows, (r) => r.day, (r) => r.minutes),
      alert: labor.ratesMissing ? { text: `${labor.ratesMissing} people have no pay rate`, href: "/app/crew?view=team" } : null,
    },
    {
      href: link("/app/accounting/purchases"),
      title: "Purchases",
      value: spend,
      kind: "money",
      sub: `${new Set(lines.map((r) => r.tripKey)).size} trips · ${new Set(lines.map((r) => r.vendor)).size} vendors`,
      spark: spark(lines, (r) => r.purchasedOn, (r) => r.lineTotalCents),
      alert: unassigned ? { text: `${unassigned} lines need a job: "Which job is this?"`, href: link("/app/accounting/purchases") } : null,
    },
    {
      href: "/app/accounting/payables",
      title: "Payables",
      value: apOpen,
      kind: "money",
      sub: `${formatValue("money", dueFriday)} due by Friday's pay run (${formatValue("date", payables.fridayCutoff)})`,
      alert: held ? { text: `${held} bill${held === 1 ? "" : "s"} on hold (waiver or COI)`, href: "/app/accounting/payables" } : null,
    },
    {
      href: "/app/accounting/receivables",
      title: "Receivables",
      value: arOpen,
      kind: "money",
      sub: `${open.rows.length} open · ${formatValue("money", late.reduce((a, r) => a + r.balanceCents, 0))} past due`,
      alert: late.length ? { text: `${late.length} invoice${late.length === 1 ? "" : "s"} past due`, href: hrefOf("/app/accounting/receivables", { by: "age" }) } : null,
    },
    {
      href: link("/app/accounting/billing"),
      title: "Billing",
      value: billed,
      kind: "money",
      sub: next ? `Next: ${next.client.replace(/ \(Synthetic\)$/, "")}, ${formatValue("date", next.day)}` : "No billing dates ahead",
      spark: spark(issued.filter((r) => r.status === "issued"), (r) => r.day, (r) => r.totalCents),
      alert: drafts && seat.owner ? { text: `${drafts} draft${drafts === 1 ? "" : "s"} waiting to go`, href: "/app/bill" } : next && next.prepOn <= today ? { text: `% complete for ${next.client} is due`, href: link("/app/accounting/billing") } : null,
    },
    {
      href: link("/app/accounting/job-costing"),
      title: "Job costing",
      value: cost,
      kind: "money",
      sub: `cost against ${formatValue("money", billed)} billed`,
    },
  ];

  const allowed = (href: string) => seat.sections.includes((href.split("?")[0].replace("/app/accounting", "").replace(/^\//, "") || "overview") as never);
  const shown = tiles.filter((t) => allowed(t.href)).map((t) => (t.title === "Payroll and labor" && !seat.laborCost ? { ...t, sub: `${new Set(labor.rows.map((r) => r.email)).size} people on your jobs` } : t));

  return (
    <AccountingFrame sections={seat.sections} title="Overview" intro="Every money section in one place. Pick a period; each card opens its section on it." period={period}>
      {payables.missing ? <PayablesMissing /> : null}
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {shown.map((t) => (
          <li key={t.title}>
            <SectionCard t={t} />
          </li>
        ))}
      </ul>
    </AccountingFrame>
  );
}
