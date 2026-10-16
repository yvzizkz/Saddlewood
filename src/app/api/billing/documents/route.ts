import { NextRequest, NextResponse } from "next/server";

import { authorizeBillingWrite } from "@/lib/billing/access";
import { createDraft, getDocument } from "@/lib/billing/documents";
import { readDraft } from "@/lib/billing/drafts";
import { answerError, bad, present, readBody } from "@/lib/billing/http";
import { getSendGroup } from "@/lib/billing/sendGroups";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Make a draft: an estimate, change order, invoice, statement or notice that
// no client can see yet. It comes back with its preview link (/d/p/<token>),
// and is changed with PATCH /api/billing/documents/<id> as often as needed.
// It is locked only when it is issued, which is the moment it is sent.
//
// Owners, or the Mac's billing tool (src/lib/billing/access.ts). The shape of
// a draft is read strictly (src/lib/billing/drafts.ts).

export async function POST(request: NextRequest) {
  const gate = await authorizeBillingWrite(request, { allowToken: true });
  if (gate.response) return gate.response;
  const who = gate.who;

  const input = await readBody(request);
  if (!input) return bad("invalid json");
  const read = readDraft(input, "create");
  if (!read.ok) return bad(read.error);
  const v = read.value;

  try {
    // A correction to something already issued is a new revision of it, with its number.
    let supersedes: { id: string; revision: number } | null = null;
    if (v.supersedes) {
      const old = await getDocument(v.supersedes);
      if (!old) return bad("there is no such document to revise");
      if (old.status === "draft") return bad("a draft is changed in place, not revised", 409);
      if (old.kind !== v.kind) return bad("a revision is the same kind of document as the one it corrects");
      supersedes = { id: old.id, revision: old.revision };
    }
    if (v.sendGroupId) {
      const group = await getSendGroup(v.sendGroupId);
      if (!group) return bad("there is no such send group");
      if (group.clientId && group.clientId !== (v.clientId ?? null)) return bad("this send group is for a different client", 409);
    }
    const doc = await createDraft({
      kind: v.kind,
      jobId: v.jobId ?? null,
      clientId: v.clientId ?? null,
      number: v.number,
      title: v.title,
      snapshot: v.snapshot ?? {},
      dueDate: v.dueDate ?? null,
      supersedes,
      sendGroupId: v.sendGroupId ?? null,
      createdBy: who.actor,
    });
    return NextResponse.json({ ok: true, document: present(doc) }, { status: 201 });
  } catch (err) {
    return answerError(err, "create draft", "could not save");
  }
}
