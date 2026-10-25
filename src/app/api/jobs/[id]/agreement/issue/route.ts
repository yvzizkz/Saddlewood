import { NextRequest, NextResponse } from "next/server";

import { agreementCaller, billingJob, shownAgreement } from "@/lib/agreements/http";
import { issueAgreement } from "@/lib/agreements/store";
import { answerError } from "@/lib/billing/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Issue the job's draft agreement (T130): it is frozen and gets the client's
// link, /d/<token>, where the client reads and signs it. Nothing is sent;
// staff pass the link on. Owners signed in, or the Mac's token.

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const who = await agreementCaller(request);
  if (who instanceof NextResponse) return who;
  const job = await billingJob((await params).id);
  if (job instanceof NextResponse) return job;
  try {
    const doc = await issueAgreement(job, who.actor);
    return NextResponse.json({ ok: true, agreement: await shownAgreement(doc) });
  } catch (err) {
    return answerError(err, "issue agreement", "could not issue the agreement");
  }
}
