import { NextRequest, NextResponse } from "next/server";

import { requireBridge, unauthorized } from "@/lib/bot/auth";
import { MAX_CLAIM } from "@/lib/billing/joistSync";
import { claimJoistJobs, listJoistJobs } from "@/lib/billing/joistSyncStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The Joist queue, for the Mac only (bridge token): POST claims waiting jobs
// and answers each with the change order as it is now, to write into Joist;
// GET lists the queue. The Mac reports each job at /api/bot/joist-sync/<id>.
// See docs/JOIST-SYNC.md. The site never talks to Joist itself.

export async function POST(request: NextRequest) {
  const actor = await requireBridge(request);
  if (!actor) return unauthorized();
  const body = ((await request.json().catch(() => null)) ?? {}) as { limit?: unknown };
  const limit = Number.isInteger(body.limit) && (body.limit as number) > 0 ? Math.min(body.limit as number, MAX_CLAIM) : MAX_CLAIM;
  const jobs = await claimJoistJobs(actor, limit);
  return NextResponse.json({ ok: true, jobs });
}

export async function GET(request: NextRequest) {
  const actor = await requireBridge(request);
  if (!actor) return unauthorized();
  return NextResponse.json({ ok: true, jobs: await listJoistJobs() });
}
