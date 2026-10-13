import { NextRequest, NextResponse } from "next/server";

import { requireSwitch } from "@/lib/crew/auth";
import { buildProjects, type ProjectsView } from "@/lib/crew/projects";
import { listBillingJobs, listJobPeople, listJobs, listPeople, listReports, listSchedule, listTasks } from "@/lib/crew/queries";
import { isNarrowed, scopeFrom } from "@/lib/crew/scope";
import { addDays, localDay } from "@/lib/crew/time";

// The Projects screen's read (projects.view). An owner sees every job; a
// project manager with projects.mine sees the jobs they are on. Field facts
// only: the money card has its own route and switch.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const viewer = await requireSwitch(request, "projects.view");
    if (!viewer) return NextResponse.json({ ok: false, error: "Projects are not switched on for you." }, { status: 403 });
    const now = new Date();
    const day = localDay(now);
    const [jobs, people, jobPeople, schedule, tasks, reports, billingJobs] = await Promise.all([
      listJobs(),
      listPeople(),
      listJobPeople(),
      listSchedule({ fromDay: day, toDay: addDays(day, 13) }),
      listTasks({ closedSince: new Date(now.getTime() - 14 * 86_400_000).toISOString() }),
      listReports(addDays(day, -14)),
      listBillingJobs().catch(() => []),
    ]);
    const scope = scopeFrom(viewer, jobPeople);
    const billing = Object.fromEntries(billingJobs.filter((b) => b.crewJobId).map((b) => [b.crewJobId as string, b.id]));
    const view: ProjectsView = {
      ok: true,
      narrowed: isNarrowed(viewer),
      money: viewer.perms.includes("money.view"),
      ...buildProjects({
        day,
        now,
        scope,
        jobs,
        people,
        jobPeople,
        schedule,
        tasks,
        // A project manager reads the plans they sent; an owner reads them all.
        reports: scope === null ? reports : reports.filter((r) => r.sentBy === viewer.email),
        billing,
      }),
    };
    return NextResponse.json(view, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[crew/projects]", (e as Error).message);
    return NextResponse.json({ ok: false, error: "Projects could not load just now." }, { status: 500 });
  }
}
