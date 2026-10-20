import { NextRequest, NextResponse } from "next/server";

import type { JobMoney } from "@/lib/billing/jobMoney";
import { loadJobMoney } from "@/lib/billing/jobMoneyLoad";
import { requireSwitch } from "@/lib/crew/auth";
import type { JobHistory } from "@/lib/crew/jobHistory";
import { loadHistory } from "@/lib/crew/jobHistoryQueries";
import { crewJobOfBillingJob, loadMaterial } from "@/lib/crew/purchaseQueries";
import type { MaterialBlock } from "@/lib/crew/purchases";
import { getJob } from "@/lib/crew/queries";
import { inScope, visibleBillingJobs, visibleCrewJobs } from "@/lib/crew/scope";
import { localDay } from "@/lib/crew/time";

// One job's money card (money.view): contract, billed, paid, owed, past due,
// and the Material block (0022: last twelve months of Home Depot on the field
// job). A crew-marked sign-in never reaches the billing tables (0011); this
// reads them with the service role after checking the switch and, for a
// project manager, that the job is one of theirs. A job they are not on
// answers the same as one that does not exist.
//
//   ?job=<billing job uuid>     money + material (through jobs.crew_job_id)
//   ?crewJob=<field job id>     material only, for a field job with no billing job yet
//
// Both also carry `history`: this year on the field job from Joist and
// Buildertrend (0050), or null.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CREW_ID = /^[A-Za-z0-9-]{1,60}$/;

export async function GET(request: NextRequest) {
  try {
    const viewer = await requireSwitch(request, "money.view");
    if (!viewer) return NextResponse.json({ ok: false, error: "Money is not switched on for you." }, { status: 403 });
    const job = request.nextUrl.searchParams.get("job") ?? "";
    const crewJob = request.nextUrl.searchParams.get("crewJob") ?? "";
    const notFound = NextResponse.json({ ok: false, error: "No such job." }, { status: 404 });
    let money: JobMoney | null = null;
    let crewJobId: string | null = null;
    if (job) {
      if (!UUID.test(job)) return NextResponse.json({ ok: false, error: "Which job?" }, { status: 400 });
      if (!inScope(await visibleBillingJobs(viewer), job)) return notFound;
      const { jobs } = await loadJobMoney([job]);
      if (!jobs[0]) return notFound;
      // Only this job's summary: never `unplaced`, which holds other jobs' bills.
      money = jobs[0];
      // The field job behind it comes from the link itself, never from the request.
      crewJobId = await crewJobOfBillingJob(job).catch(() => null);
    } else {
      if (!CREW_ID.test(crewJob)) return NextResponse.json({ ok: false, error: "Which job?" }, { status: 400 });
      if (!inScope(await visibleCrewJobs(viewer), crewJob) || !(await getJob(crewJob))) return notFound;
      crewJobId = crewJob;
    }
    // The card must open before migration 0022 is applied: no material, not an error.
    // The same for the year from Joist and Buildertrend before 0050: none, not an error.
    const [material, history]: [MaterialBlock | null, (JobHistory & { readAt: string }) | null] = crewJobId
      ? await Promise.all([loadMaterial(crewJobId, localDay()).catch(() => null), loadHistory(crewJobId).catch(() => null)])
      : [null, null];
    // crewJobId rides along so the Material block can search this job (0026).
    return NextResponse.json({ ok: true, money, material, history, crewJobId }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("job money:", err);
    return NextResponse.json({ ok: false, error: "Money is unavailable right now." }, { status: 503 });
  }
}
