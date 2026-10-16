import { NextRequest, NextResponse } from "next/server";

import { deliver } from "@/lib/billing/deliver";
import { getDocument } from "@/lib/billing/documents";
import { authorizeBillingWrite } from "@/lib/billing/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Mail a document to its client, from accounting@. Owners, or the Mac's
// billing_send.py (src/lib/billing/access.ts). A draft is issued as it goes
// out, and stays a draft if the message does not leave.
// The rules (preview unless confirmed, who may receive it, the copy our own
// people get) live in src/lib/billing/deliver.ts.

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await authorizeBillingWrite(request, { allowToken: true });
  if (gate.response) return gate.response;
  const who = gate.who;

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });

  let input: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    input = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  try {
    const doc = await getDocument(id);
    if (!doc) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
    const result = await deliver(who.actor, doc, input);
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    console.error("billing send:", err);
    return NextResponse.json({ ok: false, error: "could not send" }, { status: 500 });
  }
}
