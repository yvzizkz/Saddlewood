import { NextResponse } from "next/server";

import { localDay } from "@/lib/crew/time";
import { seesJob, workSeat } from "@/lib/jobs/access";
import { listJobRefs } from "@/lib/jobs/hub";
import { loadPeople, loadSeats } from "@/lib/roles/store";
import { loadFeed } from "@/lib/tasks/feed";
import { mineOf, summaryOf } from "@/lib/tasks/mine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Home's "Your tasks": the caller's Mine on Tasks (an owner's, or a project
// manager's on their jobs), counted, with the oldest few Home does not already
// list. Whoever has no Tasks page gets a 403 and Home shows nothing.

export async function GET() {
  const seat = await workSeat();
  if (!seat) return NextResponse.json({ ok: false, error: "owners and project managers only" }, { status: 403 });
  const today = localDay();
  const [refs, seats, people] = await Promise.all([listJobRefs(), loadSeats(), loadPeople()]);
  const jobs = new Set(refs.filter((r) => seesJob(seat, r)).map((r) => r.key));
  const mine = mineOf(await loadFeed(refs, seats, today), { email: seat.email, owner: seat.owner, jobs }, seats, people);
  // An owner's Home already lists Waiting on you; a crew seat's lists their own crew tasks.
  const shown = seat.owner ? (i: { source: string }) => i.source === "waiting" : (i: { source: string; assignee: string }) => i.source === "crew" && i.assignee === seat.email;
  return NextResponse.json({ ok: true, ...summaryOf(mine, today, shown) }, { headers: { "Cache-Control": "no-store" } });
}
