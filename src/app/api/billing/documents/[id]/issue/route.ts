import { NextRequest, NextResponse } from "next/server";

import { authorizeBillingWrite } from "@/lib/billing/access";
import { issueDocument } from "@/lib/billing/documents";
import { answerError, isId, notFound, present } from "@/lib/billing/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Issue a draft without sending it: it gets its client link (/d/<token>) and
// is frozen from here on. Usually not needed, since sending issues it
// (POST .../send); this is for a document that goes out some other way, such
// as a client's own portal. Owners, or the Mac's billing tool.

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await authorizeBillingWrite(request, { allowToken: true });
  if (gate.response) return gate.response;
  const { id } = await params;
  if (!isId(id)) return notFound();
  try {
    const doc = await issueDocument(id, gate.who.actor);
    return NextResponse.json({ ok: true, document: present(doc) });
  } catch (err) {
    return answerError(err, "issue document", "could not issue");
  }
}
