import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { jobForWrite, workSeat } from "@/lib/jobs/access";
import { PORTAL_SECTIONS } from "@/lib/portal/rules";
import { createPortal, revokePortal, setPortalSections } from "@/lib/portal/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The client's link to this job. Owners only: it shows a client what we issued
// without a sign-in, so sharing it is a decision.
//
//   POST                     make the job's link, sharing nothing yet
//   PATCH { sections: [] }   the sections it shows
//   DELETE                   turn it off, for good

const bodySchema = z.object({ sections: z.array(z.enum(PORTAL_SECTIONS)).max(PORTAL_SECTIONS.length) }).strict();

async function ownersJob(id: string) {
  const seat = await workSeat();
  if (!seat?.owner) return { fail: NextResponse.json({ ok: false, error: "owners only" }, { status: 403 }) };
  const ref = await jobForWrite(seat, id);
  if (!ref) return { fail: NextResponse.json({ ok: false, error: "No such job." }, { status: 404 }) };
  if (!ref.billingId) return { fail: NextResponse.json({ ok: false, error: "This job has no billing record yet." }, { status: 409 }) };
  return { jobId: ref.billingId, email: seat.email };
}

const failed = (err: unknown) => {
  console.error("client portal:", err);
  return NextResponse.json({ ok: false, error: "Could not save." }, { status: 500 });
};

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const job = await ownersJob((await params).id);
  if (job.fail) return job.fail;
  try {
    const { token, sections } = await createPortal(job.jobId, job.email);
    return NextResponse.json({ ok: true, token, sections });
  } catch (err) {
    return failed(err);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const job = await ownersJob((await params).id);
  if (job.fail) return job.fail;
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ ok: false, error: "Those sections aren't on a link." }, { status: 400 });
  try {
    const portal = await setPortalSections(job.jobId, body.data.sections);
    if (!portal) return NextResponse.json({ ok: false, error: "This job's link is off." }, { status: 409 });
    return NextResponse.json({ ok: true, sections: portal.sections });
  } catch (err) {
    return failed(err);
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const job = await ownersJob((await params).id);
  if (job.fail) return job.fail;
  try {
    await revokePortal(job.jobId, job.email);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return failed(err);
  }
}
