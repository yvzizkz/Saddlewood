import Link from "next/link";
import { redirect } from "next/navigation";

import { Card, ScreenTitle, SectionTitle } from "@/components/bot/ui";
import SeatEditor from "@/components/roles/SeatEditor";
import { formatValue } from "@/lib/analytics/format";
import { getViewer, viewerIsOwner } from "@/lib/crew/auth";
import { loadPolicies } from "@/lib/policies/store";
import { decisionRights, ROLE_INFO, ROLES, seatHolder } from "@/lib/roles/seats";
import { loadPeople, loadSeats } from "@/lib/roles/store";

export const dynamic = "force-dynamic";

// Who decides: every role, who holds it and who covers it, and what each role
// may decide. Work in the app is assigned to roles, so changing a seat moves
// everything with it. The limits come from Company policies (edit them there).

export default async function RightsPage() {
  if (!(await viewerIsOwner(await getViewer()))) redirect("/app");
  const [seats, people, { values }] = await Promise.all([loadSeats(), loadPeople(), loadPolicies()]);
  const names = [...new Set(people.map((p) => p.name.split(/\s+/)[0]))].sort();
  const rights = decisionRights(values as Record<string, unknown>);

  return (
    <main className="mx-auto max-w-3xl px-4 pb-24 pt-5">
      <ScreenTitle eyebrow="Settings" title="Who decides">
        <p className="text-sm text-[var(--color-charcoal-light)]">
          Tasks, approvals and alerts go to a role. Whoever holds the role gets them; while a seat is empty, its cover does. The limits are set in{" "}
          <Link className="underline" href="/app/policies">
            Company policies
          </Link>
          .
        </p>
      </ScreenTitle>

      <SectionTitle>Seats</SectionTitle>
      <div className="space-y-2">
        {ROLES.map((role) => {
          const seat = seats.find((s) => s.role === role)!;
          const now = seatHolder(role, seats, people);
          return (
            <Card key={role} className="p-4">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-[var(--color-charcoal)]">{ROLE_INFO[role].label}</p>
                  {seat.note ? <p className="text-xs text-[var(--color-charcoal-light)]">{seat.note}</p> : null}
                </div>
                <p className="text-xs">
                  <span className="text-[var(--color-charcoal-light)]">Answers now: </span>
                  <span className={`font-medium ${now.covering ? "text-[#8f6c18]" : "text-[var(--color-charcoal)]"}`}>
                    {now.name}
                    {now.covering ? " (covering)" : ""}
                  </span>
                </p>
              </div>
              <SeatEditor role={role} holder={seat.holder} backup={seat.backup} names={names} />
            </Card>
          );
        })}
      </div>

      <SectionTitle>What each role decides</SectionTitle>
      <Card className="divide-y divide-[var(--color-stone)]">
        {rights.map((r, i) => (
          <div key={i} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm text-[var(--color-charcoal)]">{r.action}</p>
              <p className="text-xs text-[var(--color-charcoal-light)]">{r.condition}</p>
            </div>
            <p className="text-sm">
              <span className="font-medium text-[var(--color-charcoal)]">{ROLE_INFO[r.role].label}</span>
              <span className="ml-2 text-[var(--color-charcoal-light)]">{r.upToCents !== null ? `up to ${formatValue("money", r.upToCents)}` : "any amount"}</span>
            </p>
          </div>
        ))}
      </Card>
    </main>
  );
}
