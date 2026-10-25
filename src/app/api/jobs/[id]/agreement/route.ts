import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { draftAgreement, loadJobAgreement } from "@/lib/agreements/store";
import { CONTRACT_TYPES, type ContractType } from "@/lib/agreements/text";
import { agreementCaller, billingJob, shownAgreement } from "@/lib/agreements/http";
import { answerError } from "@/lib/billing/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The job's agreement (T112, docs/CONTRACTS-MOVE.md). Owners signed in, or
// the Mac's token (contract.py's "draft contract" calls this for the job).
// Its price is the job's contract figure and its scope the accepted
// proposal's; the words are contract.py's, filled from Company policies.
//
//   GET                                          the agreement on the job (or null), and why one can't be drafted, if it can't
//   POST { type?, clientName?, clientEntity? }   draft it, or rewrite the open draft; 409 once issued
//   POST .../issue                               freeze the draft and give it the client's link (issue/route.ts)
//
// A draft has no link a client can open, and nothing here sends anything.

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const who = await agreementCaller(request);
  if (who instanceof NextResponse) return who;
  const job = await billingJob((await params).id);
  if (job instanceof NextResponse) return job;
  try {
    const { document, blocked } = await loadJobAgreement(job);
    return NextResponse.json({ ok: true, agreement: await shownAgreement(document), blocked, types: CONTRACT_TYPES });
  } catch (err) {
    return answerError(err, "load agreement", "could not load the agreement");
  }
}

const draftSchema = z
  .object({
    type: z.enum(Object.keys(CONTRACT_TYPES) as [ContractType, ...ContractType[]]).optional(),
    clientName: z.string().trim().max(200).optional(),
    clientEntity: z.string().trim().max(200).optional(),
  })
  .strict();

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const who = await agreementCaller(request);
  if (who instanceof NextResponse) return who;
  const job = await billingJob((await params).id);
  if (job instanceof NextResponse) return job;
  const body = draftSchema.safeParse(await request.json().catch(() => ({})));
  if (!body.success) return NextResponse.json({ ok: false, error: body.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ") }, { status: 400 });
  try {
    const doc = await draftAgreement(job, body.data, who.actor);
    return NextResponse.json({ ok: true, agreement: await shownAgreement(doc) });
  } catch (err) {
    return answerError(err, "draft agreement", "could not draft the agreement");
  }
}
