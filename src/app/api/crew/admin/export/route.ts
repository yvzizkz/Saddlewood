import { NextRequest, NextResponse } from "next/server";

import { requireOwner } from "@/lib/crew/auth";
import { listPeople, listShifts } from "@/lib/crew/queries";
import { addDays, clock12, hoursDecimal, isDay, localDay, weekStart, workedMinutes } from "@/lib/crew/time";

// The week's hours as a spreadsheet, for payroll: one row per shift. Owners
// only. Open shifts are listed with no clock-out and no hours, so nobody is
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

export async function GET(request: NextRequest) {
  try {
    const owner = await requireOwner(request);
    if (!owner) return NextResponse.json({ ok: false, error: "Owners only." }, { status: 403 });
    const params = new URL(request.url).searchParams;
    const fromParam = params.get("from");
    const from = fromParam && isDay(fromParam) ? fromParam : weekStart(localDay());
    const toParam = params.get("to");
    let to = toParam && isDay(toParam) && toParam >= from ? toParam : addDays(from, 6);
    if (to > addDays(from, 62)) to = addDays(from, 62);

    const [people, shifts] = await Promise.all([listPeople(), listShifts({ fromDay: from, toDay: to })]);
    const names = new Map(people.map((p) => [p.email, p.name]));
    const rows = shifts
      .map((s) => ({ ...s, name: names.get(s.email) ?? s.email }))
      .sort((a, b) => a.name.localeCompare(b.name) || a.startedAt.localeCompare(b.startedAt));

    const lines = [
      ["Name", "Date", "Job", "Clock in", "Clock out", "Break (min)", "Hours", "In recorded by", "Out recorded by", "Needs a look", "Note"]
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
