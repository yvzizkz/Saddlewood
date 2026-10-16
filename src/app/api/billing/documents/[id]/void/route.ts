import { NextRequest, NextResponse } from "next/server";

import { authorizeBillingWrite } from "@/lib/billing/access";
import { getDocument, voidDocument } from "@/lib/billing/documents";
import { answerError, bad, isId, notFound, present, readBody } from "@/lib/billing/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Void an issued document, with a reason. Its client link keeps opening,
// marked void, and its proof record stays as it is. An owner, signed in: like
// voiding a payment, never the Mac's token (src/lib/billing/access.ts).
//
// A draft is not voided: no client has seen it. The database will not hold a
// void document that was never issued (0012 documents_issued_check), so a
// draft that is not wanted is simply left unsent, or changed into the right one.

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await authorizeBillingWrite(request, { allowToken: false });
  if (gate.response) return gate.response;
  const { id } = await params;
  if (!isId(id)) return notFound();

  const input = await readBody(request);
  if (!input) return bad("invalid json");
  const reason = typeof input.reason === "string" ? input.reason.replace(/\s+/g, " ").trim() : "";
  if (!reason) return bad("voiding a document needs a reason");
  if (reason.length > 500) return bad("the reason is too long (500 characters at most)");

  try {
    const doc = await getDocument(id);
    if (!doc) return notFound();
    if (doc.status === "draft") return bad("a draft was never sent, so there is nothing to void; change it instead", 409);
    if (doc.status === "void") return bad("this document is already void", 409);
    const voided = await voidDocument(id, reason);
    return NextResponse.json({ ok: true, document: present(voided) });
  } catch (err) {
    return answerError(err, "void document", "could not void");
  }
}
