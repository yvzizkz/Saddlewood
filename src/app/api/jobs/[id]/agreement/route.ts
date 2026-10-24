import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { draftAgreement, loadJobAgreement } from "@/lib/agreements/store";
import { CONTRACT_TYPES, type ContractType } from "@/lib/agreements/text";
import { answerError } from "@/lib/billing/http";
import type { BillingDocument } from "@/lib/billing/types";
import { workSeat } from "@/lib/jobs/access";
import { getJobRef } from "@/lib/jobs/hub";
import { authorizeOps } from "@/lib/ops/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The job's agreement (T112, docs/CONTRACTS-MOVE.md). Owners signed in, or
// the Mac's token (contract.py's "draft contract" calls this for the job).
// Its price is the job's contract figure and its scope the accepted
// proposal's; the words are contract.py's, filled from Company policies.
//
//   GET                                          the agreement on the job (or null), and why one can't be drafted, if it can't
//   POST { type?, clientName?, clientEntity? }   draft it, or rewrite the open draft; 409 once issued
//
// A draft has no link a client can open, and nothing here sends anything.

async function caller(request: NextRequest): Promise<{ actor: string } | NextResponse> {
  const who = await authorizeOps(request);
  if (!who) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (who.via === "token") return { actor: who.actor };
  const seat = await workSeat();
  if (!seat?.owner) return NextResponse.json({ ok: false, error: "agreements are for the owners" }, { status: 403 });
  return { actor: who.actor };
}

async function billingJob(key: string): Promise<string | NextResponse> {
  const ref = await getJobRef(key);
  if (!ref) return NextResponse.json({ ok: false, error: "no such job" }, { status: 404 });
  if (!ref.billingId) return NextResponse.json({ ok: false, error: "This job has no billing side yet." }, { status: 404 });
  return ref.billingId;
}

/** What staff see of it: the words, the price, where they came from. No links. */
function shown(doc: BillingDocument | null) {
  if (!doc) return null;
  const a = doc.snapshot.agreement;
  return {
    id: doc.id,
    number: doc.number,
    revision: doc.revision,
    status: doc.status,
    title: doc.title,
    totalCents: doc.totalCents,
    type: a?.type ?? null,
    text: a?.text ?? "",
    proposal: a?.proposal ?? null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt ?? doc.createdAt,
  };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const who = await caller(request);
  if (who instanceof NextResponse) return who;
  const job = await billingJob((await params).id);
  if (job instanceof NextResponse) return job;
  try {
    const { document, blocked } = await loadJobAgreement(job);
    return NextResponse.json({ ok: true, agreement: shown(document), blocked, types: CONTRACT_TYPES });
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
  const who = await caller(request);
  if (who instanceof NextResponse) return who;
  const job = await billingJob((await params).id);
  if (job instanceof NextResponse) return job;
  const body = draftSchema.safeParse(await request.json().catch(() => ({})));
  if (!body.success) return NextResponse.json({ ok: false, error: body.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ") }, { status: 400 });
  try {
    const doc = await draftAgreement(job, body.data, who.actor);
    return NextResponse.json({ ok: true, agreement: shown(doc) });
  } catch (err) {
    return answerError(err, "draft agreement", "could not draft the agreement");
  }
}
