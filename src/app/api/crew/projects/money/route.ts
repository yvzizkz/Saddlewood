import { NextRequest, NextResponse } from "next/server";

import { loadJobMoney } from "@/lib/billing/jobMoneyLoad";
import { requireSwitch } from "@/lib/crew/auth";
import { inScope, visibleBillingJobs } from "@/lib/crew/scope";

// One job's money card (money.view): contract, billed, paid, owed, past due.
// A crew-marked sign-in never reaches the billing tables (0011); this reads
// them with the service role after checking the switch and, for a project
// manager, that the job is one of theirs. A job they are not on answers the
// same as one that does not exist.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  try {
    const viewer = await requireSwitch(request, "money.view");
    if (!viewer) return NextResponse.json({ ok: false, error: "Money is not switched on for you." }, { status: 403 });
    const job = request.nextUrl.searchParams.get("job") ?? "";
    if (!UUID.test(job)) return NextResponse.json({ ok: false, error: "Which job?" }, { status: 400 });
    const notFound = NextResponse.json({ ok: false, error: "No such job." }, { status: 404 });
    if (!inScope(await visibleBillingJobs(viewer), job)) return notFound;
    const { jobs } = await loadJobMoney([job]);
    if (!jobs[0]) return notFound;
    // Only this job's summary: never `unplaced`, which holds other jobs' bills.
    return NextResponse.json({ ok: true, money: jobs[0] }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("job money:", err);
    return NextResponse.json({ ok: false, error: "Money is unavailable right now." }, { status: 503 });
  }
}
