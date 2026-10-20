import { NextRequest, NextResponse } from "next/server";

import { jobForWrite, workSeat } from "@/lib/jobs/access";
import { loadPeople } from "@/lib/roles/store";
import { createDrawDraft, loadProgress, previewDraw, ProgressError, saveReport, setOpening } from "@/lib/billing/progressStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Progress billing on a job's schedule of values. Owners: read the schedule
// with billed to date, preview a draw, make it a draft invoice (sent from
// Billing like any other), or set what was billed before the app (once).
// The job's project manager (jobs/access.ts) reads it and sends their percent
// complete for the cycle, which the owners' next draw opens with.
//
//   GET                                     the schedule, billed to date, retainage, the PM's report
//   POST { action: "preview", pcts }        the draw the percents make, nothing saved
//   POST { action: "report", pcts, note }   the PM's percent complete (owners or the job's PM); bills nothing
//   POST { action: "draw", pcts }           the draft invoice, and what it bills per line (owners)
//   POST { action: "opening", pcts }        percents billed before the app, before the first draw (owners)

async function billingJob(id: string): Promise<{ seat: NonNullable<Awaited<ReturnType<typeof workSeat>>>; job: string } | NextResponse> {
  const seat = await workSeat();
  if (!seat) return NextResponse.json({ ok: false, error: "owners and project managers only" }, { status: 403 });
  const ref = await jobForWrite(seat, id);
  if (!ref?.billingId) return NextResponse.json({ ok: false, error: "This job has no billing side yet." }, { status: 404 });
  return { seat, job: ref.billingId };
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const found = await billingJob((await params).id);
  if (found instanceof NextResponse) return found;
  const { job } = found;
  try {
    return NextResponse.json({ ok: true, ...(await loadProgress(job)) });
  } catch (e) {
    if (e instanceof ProgressError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    throw e;
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const found = await billingJob((await params).id);
  if (found instanceof NextResponse) return found;
  const { seat, job } = found;
  const body = (await request.json().catch(() => null)) as { action?: string; pcts?: Record<string, number>; note?: string } | null;
  const pcts = body?.pcts && typeof body.pcts === "object" ? body.pcts : {};
  try {
    if (body?.action === "preview") return NextResponse.json({ ok: true, draw: previewDraw(await loadProgress(job), pcts) });
    if (body?.action === "report") {
      const name = (await loadPeople()).find((p) => p.email === seat.email)?.name ?? seat.email;
      const report = await saveReport(job, pcts, typeof body.note === "string" ? body.note : "", { email: seat.email, name });
      return NextResponse.json({ ok: true, report });
    }
    if (!seat.owner) return NextResponse.json({ ok: false, error: "Owners make the draw from your report." }, { status: 403 });
    const owner = { email: seat.email };
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
