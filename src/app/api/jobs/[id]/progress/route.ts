import { NextRequest, NextResponse } from "next/server";

import { requireOwner } from "@/lib/crew/auth";
import { getJobRef } from "@/lib/jobs/hub";
import { createDrawDraft, loadProgress, previewDraw, ProgressError, setOpening } from "@/lib/billing/progressStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Progress billing on a job's schedule of values. Owners: read the schedule
// with billed to date, preview a draw, make it a draft invoice (sent from
// Billing like any other), or set what was billed before the app (once).
//
//   GET                                   the schedule, billed to date, retainage
//   POST { action: "preview", pcts }      the draw the percents make, nothing saved
//   POST { action: "draw", pcts }         the draft invoice, and what it bills per line
//   POST { action: "opening", pcts }      percents billed before the app, before the first draw

async function billingJob(id: string): Promise<string | NextResponse> {
  const ref = await getJobRef(id);
  if (!ref?.billingId) return NextResponse.json({ ok: false, error: "This job has no billing side yet." }, { status: 404 });
  return ref.billingId;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireOwner(request))) return NextResponse.json({ ok: false, error: "owners only" }, { status: 403 });
  const job = await billingJob((await params).id);
  if (job instanceof NextResponse) return job;
  try {
    return NextResponse.json({ ok: true, ...(await loadProgress(job)) });
  } catch (e) {
    if (e instanceof ProgressError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    throw e;
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const owner = await requireOwner(request);
  if (!owner) return NextResponse.json({ ok: false, error: "owners only" }, { status: 403 });
  const job = await billingJob((await params).id);
  if (job instanceof NextResponse) return job;
  const body = (await request.json().catch(() => null)) as { action?: string; pcts?: Record<string, number> } | null;
  const pcts = body?.pcts && typeof body.pcts === "object" ? body.pcts : {};
  try {
    if (body?.action === "preview") return NextResponse.json({ ok: true, draw: previewDraw(await loadProgress(job), pcts) });
    if (body?.action === "draw") {
      const made = await createDrawDraft(job, pcts, owner.email);
      return NextResponse.json({ ok: true, documentId: made.documentId, number: made.number, dueCents: made.draw.dueCents });
    }
    if (body?.action === "opening") {
      await setOpening(job, pcts, owner.email);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ ok: false, error: "Which action: preview, draw or opening?" }, { status: 400 });
  } catch (e) {
    if (e instanceof ProgressError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    throw e;
  }
}
