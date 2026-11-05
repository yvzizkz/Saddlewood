import Link from "next/link";
import { redirect } from "next/navigation";

import PayrollRunEditor from "@/components/accounting/PayrollRunEditor";
import { moneySeatForPage } from "@/lib/accounting/access";
import { loadLabor } from "@/lib/accounting/labor";
import { payDateFor, startLines, type Clocked } from "@/lib/accounting/payrollRun";
import { loadRun, runBefore } from "@/lib/accounting/payrollRunStore";
import { addDays, isDay, localDay, weekStart } from "@/lib/crew/time";
import { loadSeats } from "@/lib/roles/store";

export const dynamic = "force-dynamic";

// The Wednesday run: one pay date, everyone on it by hours or by amount, and the
// email to the accountant. Owners only (lib/accounting/payrollRun.ts).

type SP = Record<string, string | string[] | undefined>;

export default async function PayrollRunPage({ searchParams }: { searchParams: Promise<SP> }) {
  const seat = await moneySeatForPage("payroll");
  if (!seat?.owner) redirect("/app");
  const asked = (await searchParams).date;
  const payDate = typeof asked === "string" && isDay(asked) ? asked : payDateFor(localDay());

  // The week before the pay date, Monday to Sunday.
  const from = addDays(weekStart(payDate), -7);
  const [saved, previous, labor, seats] = await Promise.all([loadRun(payDate), runBefore(payDate), loadLabor(from, addDays(from, 6), { withPay: true }), loadSeats()]);
  const byPerson = new Map<string, Clocked>();
  for (const r of labor.rows) {
    const c = byPerson.get(r.person) ?? { name: r.person, hours: 0, costCents: null };
    c.hours += r.minutes / 60;
    if (r.costCents !== null) c.costCents = (c.costCents ?? 0) + r.costCents;
    byPerson.set(r.person, c);
  }
  const lines = saved?.lines ?? startLines(previous?.lines ?? [], [...byPerson.values()]);
  const signer = seats.find((s) => s.role === "finance")?.holder ?? "";

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <p className="text-sm">
        <Link className="underline" href="/app/accounting/payroll">
          Payroll and labor
        </Link>
      </p>
      <PayrollRunEditor key={payDate} payDate={payDate} initial={lines} saved={!!saved} startedFrom={saved ? null : (previous?.payDate ?? null)} signer={signer} />
    </div>
  );
}
