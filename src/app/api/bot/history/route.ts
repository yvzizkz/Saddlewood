import { NextRequest, NextResponse } from "next/server";

import { requireBridge, unauthorized } from "@/lib/bot/auth";
import { MAX_HISTORY_JOBS, historyPostSchema, missingHistory, placeHistory, type HistoryPost } from "@/lib/crew/jobHistory";
import { upsertHistory } from "@/lib/crew/jobHistoryQueries";
import { listJobs } from "@/lib/crew/queries";

// The Mac's door for this year on each job from Joist and Buildertrend
// (migration 0050, Saddlewood-KB bot/job_history.py). OPS_AGENT_TOKEN only,
// like /api/bot/purchases; a portal session is refused. Safe to send twice:
// each job's summary replaces the last one.
//
//   POST  { jobs: [{ crewJobId, asOf, summary }] }   up to MAX_HISTORY_JOBS
//   ->    { ok, saved, dropped, unknown: [crewJobId] }
//         a job that does not parse is dropped and counted; a crewJobId that
//         is not a field job (Jury before an owner adds it) comes back in
//         `unknown` so the Mac can say so, and is sent again next run.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!(await requireBridge(request))) return unauthorized();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  const sent = (body as { jobs?: unknown } | null)?.jobs;
  if (!Array.isArray(sent)) return NextResponse.json({ ok: false, error: "jobs must be an array" }, { status: 400 });
  if (sent.length > MAX_HISTORY_JOBS) {
    return NextResponse.json({ ok: false, error: `at most ${MAX_HISTORY_JOBS} jobs a call` }, { status: 400 });
  }
  const posts: HistoryPost[] = [];
  for (const raw of sent) {
    const parsed = historyPostSchema.safeParse(raw);
    if (parsed.success) posts.push(parsed.data);
  }
  try {
    const jobs = await listJobs();
    const { rows, unknown } = placeHistory(posts, new Set(jobs.map((j) => j.id)));
    const saved = await upsertHistory(rows);
    return NextResponse.json({ ok: true, saved, dropped: sent.length - posts.length, unknown });
  } catch (e) {
    if (missingHistory(e)) {
      return NextResponse.json({ ok: false, error: "job_history is missing (migration 0050 is not applied)" }, { status: 503 });
    }
    return NextResponse.json({ ok: false, error: (e as Error).message ?? "" }, { status: 500 });
  }
}
