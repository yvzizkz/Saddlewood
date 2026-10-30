import { NextRequest, NextResponse } from "next/server";

import { authorizeBillingWrite } from "@/lib/billing/access";
import { readIntake } from "@/lib/billing/coIntake";
import { IntakeError, runIntake } from "@/lib/billing/coIntakeStore";
import { getDocument } from "@/lib/billing/documents";
import { present, readBody } from "@/lib/billing/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A client asked for a change by email: the Mac (KB bot triage, with the agent
// token) or an owner posts the request, and each change in it becomes a
// register row awaiting price plus a $0 draft with its number, ready for an
// owner to price and send (docs/CO-INTAKE.md). Nothing here reaches a client.
// Sending the same request again is safe: each change is found by the thread
// and its key, and a draft an owner has touched is left as it is.
//
// The request's files go on each draft afterwards, through
// POST /api/billing/documents/<id>/exhibits, so this body stays small.

export async function POST(request: NextRequest) {
  const gate = await authorizeBillingWrite(request, { allowToken: true });
  if (gate.response) return gate.response;

  const body = await readBody(request);
  if (!body) return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  const read = readIntake(body);
  if (!read.ok) return NextResponse.json({ ok: false, error: read.error }, { status: 400 });

  try {
    const outcomes = await runIntake(read.value, gate.who.actor);
    const changeOrders = await Promise.all(
      outcomes.map(async (o) => {
        const doc = o.documentId ? await getDocument(o.documentId) : null;
        return { ...o, previewLink: doc ? present(doc).previewLink : null };
      }),
    );
    const created = outcomes.some((o) => o.action === "created");
    return NextResponse.json({ ok: true, changeOrders }, { status: created ? 201 : 200 });
  } catch (err) {
    if (err instanceof IntakeError) return NextResponse.json({ ok: false, error: err.message }, { status: err.status });
    console.error("change-order intake:", err);
    return NextResponse.json({ ok: false, error: "could not save" }, { status: 500 });
  }
}
