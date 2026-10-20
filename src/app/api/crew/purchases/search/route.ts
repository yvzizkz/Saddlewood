import { NextRequest, NextResponse } from "next/server";

import { requireSwitch } from "@/lib/crew/auth";
import { SEARCH_MAX_QUERY, SEARCH_MAX_TRIPS, missingSearch, searchPurchases } from "@/lib/crew/purchaseSearch";
import { TRADES } from "@/lib/crew/purchases";
import { getJob } from "@/lib/crew/queries";
import { inScope, visibleCrewJobs } from "@/lib/crew/scope";
import { isDay } from "@/lib/crew/time";

// Find a purchase (money.view, migration 0026): plain words in, trips out,
// the matched lines pointed at. Owners search every job; a project manager
// only the jobs he is on. The scope comes from the seat (visibleCrewJobs),
// never from the query string: `job` can only narrow within it, and a job
// outside it answers the same as one that does not exist.
//
//   ?q=<words>            required; dates and job names in it become filters
//   &job=<field job id>   one job (the Material block)
//   &trade=framing|drywall|electrical|plumbing|paint|tools|rentals|general
//   &from=YYYY-MM-DD&to=YYYY-MM-DD
//   -> { ok, trips: [{ tripKey, purchasedOn, store, vendor, jobId, jobName, trades, totalCents, lineCount,
//                      lines: [{ description, sku, qty, lineTotalCents, trade, matched }] }],
//        total, took: "full-text" | "fuzzy", filters: { from, to, jobId, jobName } }

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CREW_ID = /^[A-Za-z0-9-]{1,60}$/;

const bad = (error: string) => NextResponse.json({ ok: false, error }, { status: 400 });

export async function GET(request: NextRequest) {
  try {
    const viewer = await requireSwitch(request, "money.view");
    if (!viewer) return NextResponse.json({ ok: false, error: "Money is not switched on for you." }, { status: 403 });
    const p = new URL(request.url).searchParams;
    const q = (p.get("q") ?? "").trim().slice(0, SEARCH_MAX_QUERY);
    if (!q) return bad("What are you looking for?");
    const job = (p.get("job") ?? "").trim();
    const trade = (p.get("trade") ?? "").trim();
    const from = (p.get("from") ?? "").trim();
    const to = (p.get("to") ?? "").trim();
    if (job && !CREW_ID.test(job)) return bad("Which job?");
    if (trade && !(TRADES as readonly string[]).includes(trade)) return bad("Which trade?");
    if ((from && !isDay(from)) || (to && !isDay(to))) return bad("Dates are YYYY-MM-DD.");
    const scope = await visibleCrewJobs(viewer);
    if (job && (!inScope(scope, job) || !(await getJob(job)))) return NextResponse.json({ ok: false, error: "No such job." }, { status: 404 });
    const result = await searchPurchases({ q, jobIds: scope, jobId: job || null, trade, from: from || null, to: to || null, limit: SEARCH_MAX_TRIPS });
    return NextResponse.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (missingSearch(err)) {
      return NextResponse.json({ ok: false, error: "Purchase search is not switched on yet (migration 0026 is not applied)." }, { status: 503 });
    }
    console.error("purchase search:", err);
    return NextResponse.json({ ok: false, error: "Search is unavailable right now." }, { status: 500 });
  }
}
