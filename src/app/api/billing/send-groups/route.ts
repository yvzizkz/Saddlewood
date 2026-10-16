import { NextRequest, NextResponse } from "next/server";

import { authorizeBillingWrite } from "@/lib/billing/access";
import { getDocument, updateDraft } from "@/lib/billing/documents";
import { answerError, bad, present, readBody } from "@/lib/billing/http";
import { createSendGroup } from "@/lib/billing/sendGroups";
import type { BillingDocument } from "@/lib/billing/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Make a send group: documents that go out together in one email ("JURY-1012":
// 8009-13 and 8009-14). Give it the drafts now, or put a draft in it later
// with PATCH /api/billing/documents/<id> {"sendGroupId": ...}. Sent with
// POST /api/billing/send-groups/<id>/send. Owners, or the Mac's billing tool.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  const gate = await authorizeBillingWrite(request, { allowToken: true });
  if (gate.response) return gate.response;

  const input = await readBody(request);
  if (!input) return bad("invalid json");
  const name = typeof input.name === "string" ? input.name.replace(/\s+/g, " ").trim() : "";
  if (!name || name.length > 60) return bad("a name of 60 characters or fewer is required");
  const note = typeof input.note === "string" ? input.note.trim().slice(0, 500) : "";
  if (input.clientId !== undefined && input.clientId !== null && (typeof input.clientId !== "string" || !UUID.test(input.clientId))) {
    return bad("clientId must be an id");
  }
  const ids = input.documents ?? [];
  if (!Array.isArray(ids) || ids.length > 8 || ids.some((d) => typeof d !== "string" || !UUID.test(d))) {
    return bad("documents must be a list of up to 8 document ids");
  }
  const unique = [...new Set(ids as string[])];

  try {
    // Every document is checked before the group is made, so a refusal leaves nothing behind.
    const docs: BillingDocument[] = [];
    for (const id of unique) {
      const doc = await getDocument(id);
      if (!doc) return bad(`there is no document ${id}`);
      if (doc.status !== "draft") return bad(`${doc.number} is not a draft; only drafts are put in a group`, 409);
      docs.push(doc);
    }
    const clientIds = new Set(docs.map((d) => d.clientId));
    const clientId = (input.clientId as string | null | undefined) ?? (docs.length ? docs[0].clientId : null);
    if (clientIds.size > 1 || (docs.length && !clientIds.has(clientId))) {
      return bad("the documents in a group must all be for the group's client", 409);
    }

    const group = await createSendGroup({ name, clientId, note, createdBy: gate.who.actor });
    const members = [];
    for (const d of docs) members.push(present(await updateDraft(d.id, { sendGroupId: group.id })));
    return NextResponse.json({ ok: true, group, documents: members }, { status: 201 });
  } catch (err) {
    return answerError(err, "create send group", "could not save");
  }
}
