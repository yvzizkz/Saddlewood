import { NextRequest, NextResponse } from "next/server";

import { requireManager } from "@/lib/crew/auth";
import { listPeople, listShifts } from "@/lib/crew/queries";
import { addDays, clock12, hoursDecimal, isDay, localDay, weekStart, workedMinutes } from "@/lib/crew/time";

// The week's hours as a spreadsheet, for payroll: one row per shift. Owners,
// and a group with "hours.edit" switched on. Open shifts are listed with no clock-out and no hours, so nobody is
// paid off a number that is still counting.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A cell that starts with = + - or @ is a formula to a spreadsheet. Defuse it. */
function cell(v: string | number): string {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const HOW: Record<string, string> = {
  app: "app",
  late: "app, sent later",
  reported: "time given afterwards",
  office: "entered by the office",
};

/** Rate and cost for one shift; blank when there is no rate or the shift is still open. */
function payCells(rate: number | null, minutes: number | null): string[] {
  if (rate === null) return ["", ""];
  return [rate.toFixed(2), minutes === null ? "" : ((rate * minutes) / 60).toFixed(2)];
}

export async function GET(request: NextRequest) {
  try {
    const manager = await requireManager(request);
    if (!manager || !manager.perms.includes("hours.edit")) return NextResponse.json({ ok: false, error: "Owners only." }, { status: 403 });
    const params = new URL(request.url).searchParams;
    const fromParam = params.get("from");
    const from = fromParam && isDay(fromParam) ? fromParam : weekStart(localDay());
    const toParam = params.get("to");
    let to = toParam && isDay(toParam) && toParam >= from ? toParam : addDays(from, 6);
    if (to > addDays(from, 62)) to = addDays(from, 62);

    const [people, shifts] = await Promise.all([listPeople(), listShifts({ fromDay: from, toDay: to })]);
    const names = new Map(people.map((p) => [p.email, p.name]));
    // Pay is for the owners' copy only; a member with hours.edit gets the hours without it.
    const showPay = manager.role === "owner";
    const rates = new Map(people.map((p) => [p.email, p.payRate]));
    const rows = shifts
      .map((s) => ({ ...s, name: names.get(s.email) ?? s.email }))
      .sort((a, b) => a.name.localeCompare(b.name) || a.startedAt.localeCompare(b.startedAt));

    const lines = [
      ["Name", "Date", "Job", "Clock in", "Clock out", "Break (min)", "Hours", ...(showPay ? ["Rate ($/h)", "Cost ($)"] : []), "In recorded by", "Out recorded by", "Needs a look", "Note"]
        .map(cell)
        .join(","),
      ...rows.map((s) =>
        [
          s.name,
          s.day,
          s.jobName,
          clock12(s.startedAt),
          s.endedAt ? clock12(s.endedAt) : "",
          s.endedAt ? s.breakMin : "",
          s.endedAt ? hoursDecimal(workedMinutes(s)) : "",
          ...(showPay ? payCells(rates.get(s.email) ?? null, s.endedAt ? workedMinutes(s) : null) : []),
          HOW[s.source] ?? s.source,
          s.endSource ? (HOW[s.endSource] ?? s.endSource) : "",
          s.endedAt ? s.review : "still on the clock",
          s.note,
        ]
          .map(cell)
          .join(","),
      ),
    ];
    return new NextResponse(`${lines.join("\r\n")}\r\n`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="saddlewood-hours-${from}-to-${to}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
