import { NextRequest, NextResponse } from "next/server";

import { authorizeBillingWrite } from "@/lib/billing/access";
import { allowMirror } from "@/lib/billing/deliver";
import { clientContactEmails, documentsInGroup } from "@/lib/billing/documents";
import { listExhibits } from "@/lib/billing/exhibits";
import { answerError, bad, notFound, present, readBody } from "@/lib/billing/http";
import { mirrorIsFresh, recipientStatus } from "@/lib/billing/send";
import { getSendGroup, readMessageInput, updateSendGroupMessage } from "@/lib/billing/sendGroups";
import { authorizeOps } from "@/lib/ops/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A send group as the Bill screen reviews it: its documents in the order their
// buttons go, what is on each document's page (the Joist PDF, the waiver, the
// Joist link), the working message, and where each recipient stands against
// the two lists that must agree before anything leaves (the client's contacts,
// the owner's allowlist). Staff look; owners, or the Mac, change the message.

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const who = await authorizeOps(request);
  if (!who) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  try {
    const group = await getSendGroup(id);
    if (!group) return notFound();
    const docs = await documentsInGroup(group.id);
    const [contacts, allow, exhibits] = await Promise.all([
      group.clientId ? clientContactEmails(group.clientId) : Promise.resolve([] as string[]),
      allowMirror(),
      Promise.all(docs.map((d) => listExhibits(d.id))),
    ]);
    const where = (address: string) => ({ address, ...recipientStatus(address, contacts, allow) });
    return NextResponse.json({
      ok: true,
      group,
      documents: docs.map((d, i) => ({
        ...present(d),
        exhibits: exhibits[i].map((x) => ({ id: x.id, label: x.label, kind: x.kind, url: x.url, bytes: x.bytes, contentType: x.contentType })),
      })),
      recipients: { to: (group.message.to ?? []).map(where), cc: (group.message.cc ?? []).map(where) },
      contacts,
      allow: { fresh: mirrorIsFresh(allow), updatedAt: allow?.updatedAt ?? null },
    });
  } catch (err) {
    return answerError(err, "get send group", "could not load");
  }
}

// The working message: the Mac fills it after Prepare; an owner edits it from
// the screen. Refused once the group was sent.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await authorizeBillingWrite(request, { allowToken: true });
  if (gate.response) return gate.response;
  const { id } = await params;
  const input = await readBody(request);
  if (!input) return bad("invalid json");
  const read = readMessageInput(input.message);
  if (!read.ok) return bad(read.error);
  if (Object.keys(read.value).length === 0) return bad("nothing to change");
  try {
    const group = await updateSendGroupMessage(id, read.value, gate.who.actor);
    return NextResponse.json({ ok: true, group });
  } catch (err) {
    return answerError(err, "update send group message", "could not save");
  }
}
