import { NextRequest, NextResponse } from "next/server";

import { requireBridge, unauthorized } from "@/lib/bot/auth";
import { readJoistReport } from "@/lib/billing/joistSync";
import { JoistSyncError, reportJoistJob } from "@/lib/billing/joistSyncStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The Mac's report on one claimed Joist job (bridge token):
//   { "ok": true, "joistId": 52782795, "joistUrl": "https://…joistapp.com/…" }
//   { "ok": false, "error": "what went wrong" }
// Only after it read the estimate back through the Joist read API. See docs/JOIST-SYNC.md.

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireBridge(request);
  if (!actor) return unauthorized();
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  const read = readJoistReport(await request.json().catch(() => null));
  if (!read.ok) return NextResponse.json({ ok: false, error: read.error }, { status: 400 });
  try {
    return NextResponse.json({ ok: true, ...(await reportJoistJob(id, read.value, actor)) });
  } catch (err) {
    if (err instanceof JoistSyncError) return NextResponse.json({ ok: false, error: err.message }, { status: err.status });
    throw err;
  }
}
