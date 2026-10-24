import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { requireBridge, unauthorized } from "@/lib/bot/auth";
import { ownerNames } from "@/lib/bot/home";
import { sendPush } from "@/lib/bot/push";
import { readState } from "@/lib/bot/queries";
import { listJobPeople, listJobs, listPeople, listReports, listSchedule, listTasks } from "@/lib/crew/queries";
import { listRequests } from "@/lib/crew/requestQueries";
import { readSettings } from "@/lib/crew/settings";
import { localDay } from "@/lib/crew/time";
import { listJobRefs } from "@/lib/jobs/hub";
import { loadWaiting } from "@/lib/owner/load";
import { buildMorning } from "@/lib/owner/morning";
import { peopleOf } from "@/lib/roles/seats";
import { laneSeatsOf, loadSeats } from "@/lib/roles/store";
import { loadFeed } from "@/lib/tasks/feed";

// The 7 AM "Your day" push. Vercel's cron calls this at 14:00 UTC, which is
// 7 AM in Phoenix all year (no daylight saving), Monday to Saturday
// (vercel.json), with CRON_SECRET as a bearer token. The Mac's token may call
// it too, and `?dry=1` returns who would get what without sending: that is how
// it is checked on the live site. Every push carries the day as its tag, so a
// second run replaces the first on the phone instead of buzzing twice. What is
// each person's to do comes from the one task feed, read once for everyone.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isCron(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  const got = request.headers.get("authorization") ?? "";
  if (!secret) return false;
  const want = Buffer.from(`Bearer ${secret}`);
  const have = Buffer.from(got);
  return have.length === want.length && timingSafeEqual(have, want);
}

export async function GET(request: NextRequest) {
  if (!isCron(request) && !(await requireBridge(request))) return unauthorized();
  const dry = request.nextUrl.searchParams.get("dry") === "1";
  const now = new Date();
  const day = localDay(now);
  try {
    const [{ sections }, people, schedule, tasks, reports, jobPeople, jobs, requests, settings, seats, refs] = await Promise.all([
      readState(),
      listPeople(),
      listSchedule({ fromDay: day, toDay: day }),
      listTasks({ closedSince: now.toISOString() }),
      listReports(day),
      listJobPeople().catch(() => []),
      listJobs().catch(() => []),
      // Material requests (0023) still open; empty before the migration.
      listRequests({ since: now.toISOString() }).catch(() => []),
      readSettings(),
      loadSeats(),
      listJobRefs(),
    ]);
    const waiting = await loadWaiting(ownerNames(sections.people), now);
    const feed = await loadFeed(refs, seats, day, { waiting });
    const notes = buildMorning({
      day,
      owners: sections.people,
      laneSeats: laneSeatsOf(seats),
      people,
      schedule,
      tasks,
      reports,
      waiting,
      bids: sections.bids.length,
      jobPeople,
      // What the Mac saw come in late from the field (bot_state crewLate): yesterday's rides along.
      late: sections.crewLate.items,
      jobs,
      requests,
      pmLimitCents: settings["requests.pmLimitCents"],
      feed,
      seats,
      // The people the seats name, as Tasks reads them (roles/store.ts loadPeople).
      seatPeople: peopleOf(sections.people, people.filter((p) => p.active)),
      refs,
    });
    if (dry) return NextResponse.json({ ok: true, day, dry: true, notes }, { headers: { "Cache-Control": "no-store" } });
    let sent = 0;
    for (const n of notes) {
      try {
        sent += (await sendPush([n.email], { title: n.title.slice(0, 80), body: n.body, url: n.url, tag: n.tag })).sent;
      } catch (e) {
        console.error("[cron/morning]", n.email.split("@")[0], (e as Error).message);
      }
    }
    return NextResponse.json({ ok: true, day, people: notes.length, sent });
  } catch (e) {
    console.error("[cron/morning]", (e as Error).message);
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
