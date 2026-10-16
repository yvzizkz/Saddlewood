import { NextRequest, NextResponse } from "next/server";

import { authorizeBillingWrite } from "@/lib/billing/access";
import { deliverGroup } from "@/lib/billing/deliver";
import { documentsInGroup } from "@/lib/billing/documents";
import { answerError, bad, notFound, readBody } from "@/lib/billing/http";
import { getSendGroup } from "@/lib/billing/sendGroups";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Mail every document in a send group in one message, from accounting@: one
// button per document, and one "sent" line on each document's proof record.
// Drafts are issued as they go out. Owners, or the Mac's billing tool; the
// same rules as a single send (preview unless confirmed, who may receive it,
// our own people's copy): src/lib/billing/deliver.ts.

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await authorizeBillingWrite(request, { allowToken: true });
  if (gate.response) return gate.response;
  const { id } = await params;

  const input = await readBody(request);
  if (!input) return bad("invalid json");

  try {
    const group = await getSendGroup(id);
    if (!group) return notFound();
    const docs = await documentsInGroup(group.id);
    const result = await deliverGroup(gate.who.actor, group, docs, input);
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    return answerError(err, "billing group send", "could not send");
  }
}
