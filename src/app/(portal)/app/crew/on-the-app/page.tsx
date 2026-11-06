import Link from "next/link";
import { redirect } from "next/navigation";

import DataTable, { type Column, type TableRow } from "@/components/data/DataTable";
import { getViewer, viewerIsOwner } from "@/lib/crew/auth";
import { loadRollout } from "@/lib/crew/rolloutStore";

export const dynamic = "force-dynamic";

// Who's on the app, for the January move: Dec 1 new jobs, Dec 15 live jobs, Jan 4
// Joist read-only. Owners only. Office people are counted by opening it, field
// people by clocking in or logging the day (lib/crew/rollout.ts).

export default async function OnTheAppPage() {
  const viewer = await getViewer();
  if (viewer.kind !== "staff" || !(await viewerIsOwner(viewer))) redirect("/app");
  const rows = await loadRollout();
  const using = rows.filter((r) => r.standing === "Using it").length;
  const never = rows.filter((r) => r.standing === "Not yet").length;
  const noPhone = rows.filter((r) => !r.hasPhone).length;

  const table: TableRow[] = rows.map((r) => ({
    id: r.name,
    name: r.name,
    seat: r.seat,
    standing: r.standing,
    seen: r.lastSeenOn,
    clock: r.lastClockOn,
    week: r.field ? r.clocksThisWeek : null,
    log: r.lastLogOn,
    phone: r.hasPhone ? "Yes" : "No",
  }));
  const columns: Column[] = [
    { key: "name", header: "Person", kind: "text", phone: "title" },
    { key: "seat", header: "Seat", kind: "text", filter: true },
    { key: "standing", header: "Standing", kind: "text", filter: true, phone: "value" },
    { key: "seen", header: "Last opened", kind: "date" },
    { key: "clock", header: "Last clock-in", kind: "date" },
    { key: "week", header: "Clock-ins, 7 days", kind: "count", phone: "hide" },
    { key: "log", header: "Last daily log", kind: "date" },
    { key: "phone", header: "Phone on file", kind: "text", filter: true, phone: "hide" },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <p className="text-sm">
        <Link className="underline" href="/app/crew">
          Crew
        </Link>
      </p>
      <h1 className="text-xl font-semibold text-[var(--color-charcoal)]">Who&apos;s on the app</h1>
      <dl className="grid grid-cols-3 gap-3">
        {(
          [
            ["Using it this week", `${using} of ${rows.length}`],
            ["Never opened it", never],
            ["No phone on file", noPhone],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-[var(--color-stone)] bg-white p-3">
            <dt className="text-[11px] text-[var(--color-charcoal-light)]">{label}</dt>
            <dd className="text-lg font-semibold text-[var(--color-charcoal)]">{value}</dd>
          </div>
        ))}
      </dl>
      <DataTable rows={table} columns={columns} searchKeys={["name", "seat"]} name="on-the-app" initialSort={{ key: "standing", dir: "asc" }} empty="No one has a seat yet." />
    </div>
  );
}
