import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";

import { getViewer, viewerIsOwner } from "@/lib/crew/auth";
import { localDay } from "@/lib/crew/time";
import { listJobRefs } from "@/lib/jobs/hub";
import { ROLE_INFO, ROLES, seatHolder } from "@/lib/roles/seats";
import { loadPeople, loadSeats } from "@/lib/roles/store";
import { loadFeed } from "@/lib/tasks/feed";

export const dynamic = "force-dynamic";

// Every department, who holds it, and how much is waiting on it. Each opens
// its home.

export default async function DepartmentsPage() {
  if (!(await viewerIsOwner(await getViewer()))) redirect("/app");
  const today = localDay();
  const [refs, seats, people] = await Promise.all([listJobRefs(), loadSeats(), loadPeople()]);
  const feed = await loadFeed(refs, seats, today);

  return (
    <div className="px-4 pb-10 pt-4 md:px-8 md:pt-6">
      <header className="mb-4">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--color-gold-accessible)]">Work</p>
        <h1 className="text-[var(--color-charcoal)]" style={{ fontFamily: "var(--font-fraunces)" }}>
          Departments
        </h1>
        <p className="mt-1 text-sm text-[var(--color-charcoal-light)]">Each department is a role, who holds it, and the work waiting on it. Change who holds a seat on Who decides.</p>
      </header>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {ROLES.map((role) => {
          const h = seatHolder(role, seats, people);
          const items = feed.filter((i) => i.nowRole === role);
          const late = items.filter((i) => i.dueOn && i.dueOn < today).length;
          return (
            <li key={role}>
              <Link href={`/app/departments/${role}`} className="group flex h-full flex-col rounded-2xl border border-[var(--color-stone)] bg-white p-4 hover:shadow-sm">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-[var(--color-charcoal)]">{ROLE_INFO[role].department}</p>
                  <ArrowRight className="size-4 text-[var(--color-charcoal-light)] transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </div>
                <p className="mt-0.5 text-xs text-[var(--color-charcoal-light)]">
                  {h.name}
                  {h.covering ? " (covering)" : ""}
                </p>
                <p className="mt-3 text-[28px] font-semibold leading-none text-[var(--color-charcoal)]">{items.length}</p>
                <p className={`mt-1 text-xs ${late ? "font-medium text-[#9a2a1f]" : "text-[var(--color-charcoal-light)]"}`}>{late ? `${late} overdue` : "waiting, none overdue"}</p>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
