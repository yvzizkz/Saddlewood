import { NextRequest, NextResponse } from "next/server";

import { authorizeBillingWrite } from "@/lib/billing/access";
import { deliverGroup } from "@/lib/billing/deliver";
import { documentsInGroup } from "@/lib/billing/documents";
import { answerError, bad, notFound, readBody } from "@/lib/billing/http";
import { getSendGroup, markSendGroupSent } from "@/lib/billing/sendGroups";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Mail every document in a send group in one message, from accounting@: one
// button per document, and one "sent" line on each document's proof record.
// Drafts are issued as they go out. Owners, or the Mac's billing tool; the
// same rules as a single send (preview unless confirmed, who may receive it,
// our own people's copy): src/lib/billing/deliver.ts. With
// "attachExhibits": true the files on the documents' pages ride along.
// Once the message has left, the group's working message is stamped sent.

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await authorizeBillingWrite(request, { allowToken: true });
  if (gate.response) return gate.response;
  const { id } = await params;

  const input = await readBody(request);
  if (!input) return bad("invalid json");

  try {
    const group = await getSendGroup(id);
    if (!group) return notFound();
    if (group.message.sentAt) return bad(`${group.name} was already sent on ${group.message.sentAt}`, 409);
    const docs = await documentsInGroup(group.id);
    const result = await deliverGroup(gate.who.actor, group, docs, input);
    if (result.status === 200 && result.body.sent === true && typeof result.body.emailId === "string") {
      // The mail is gone; a stamp that fails must not read as a failed send.
      try {
        await markSendGroupSent(group.id, result.body.emailId);
      } catch (err) {
        console.error("billing group send: sent, but the group was not stamped:", err);
      }
    }
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    return answerError(err, "billing group send", "could not send");
  }
}
