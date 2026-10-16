import { NextRequest, NextResponse } from "next/server";

import { authorizeBillingWrite } from "@/lib/billing/access";
import { ensurePreviewToken, getDocument, updateDraft } from "@/lib/billing/documents";
import { readDraft } from "@/lib/billing/drafts";
import { answerError, bad, isId, notFound, present, readBody } from "@/lib/billing/http";
import { getSendGroup } from "@/lib/billing/sendGroups";
import { authorizeOps } from "@/lib/ops/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// One document. GET: staff look (with its preview link while it is a draft).
// PATCH: change a draft (lines, notes, title, due date, its group), as many
// times as needed; refused once it is issued, since a client may have read it
// (the database refuses that too, 0012 documents_freeze). Changing is for the
// owners, or the Mac's billing tool.

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, ctx: Ctx) {
  const who = await authorizeOps(request);
  if (!who) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  if (!isId(id)) return notFound();
  try {
    const doc = await getDocument(id);
    if (!doc) return notFound();
    return NextResponse.json({ ok: true, document: present(await ensurePreviewToken(doc)) });
  } catch (err) {
    return answerError(err, "get document", "could not load");
  }
}

export async function PATCH(request: NextRequest, ctx: Ctx) {
  const gate = await authorizeBillingWrite(request, { allowToken: true });
  if (gate.response) return gate.response;
  const { id } = await ctx.params;
  if (!isId(id)) return notFound();

  const input = await readBody(request);
  if (!input) return bad("invalid json");
  const read = readDraft(input, "change");
  if (!read.ok) return bad(read.error);

  try {
    const doc = await getDocument(id);
    if (!doc) return notFound();
    if (doc.status !== "draft") {
      return bad(`this document was ${doc.status === "void" ? "voided" : "issued"} and cannot be changed; issue a new revision instead`, 409);
    }
    if (read.value.sendGroupId) {
      const group = await getSendGroup(read.value.sendGroupId);
      if (!group) return bad("there is no such send group");
      const clientId = read.value.clientId !== undefined ? read.value.clientId : doc.clientId;
      if (group.clientId && group.clientId !== clientId) return bad("this send group is for a different client", 409);
    }
    const changed = await updateDraft(id, read.value);
    return NextResponse.json({ ok: true, document: present(await ensurePreviewToken(changed)) });
  } catch (err) {
    return answerError(err, "change draft", "could not save");
  }
}
