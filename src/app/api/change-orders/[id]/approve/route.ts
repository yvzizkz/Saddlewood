import { NextRequest, NextResponse } from "next/server";

import { authorizeBillingWrite } from "@/lib/billing/access";
import { markChangeOrderApproved } from "@/lib/billing/coApprove";
import { DocumentError } from "@/lib/billing/documents";
import { readBody } from "@/lib/billing/http";
import { checkAttachments } from "@/lib/billing/send";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// An owner records a change order approved outside its link (owners only,
// signed in): who, the day, a few words on where the yes came from, and the
// signed copy or approval email as a PDF, PNG or JPG (lib/billing/coApprove.ts).

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await authorizeBillingWrite(request, { allowToken: false });
  if (gate.response) return gate.response;
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  const body = await readBody(request);
  if (!body) return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  let file = null;
  if (body.file !== undefined && body.file !== null) {
    const checked = checkAttachments([body.file]);
    if (!checked.ok) return NextResponse.json({ ok: false, error: checked.error }, { status: 400 });
    file = checked.files[0];
    if (file.contentType.includes("spreadsheet")) return NextResponse.json({ ok: false, error: "the proof is a PDF, PNG or JPG" }, { status: 400 });
  }
  try {
    const r = await markChangeOrderApproved(
      id,
      { name: typeof body.name === "string" ? body.name : "", signedOn: typeof body.signedOn === "string" ? body.signedOn : "", note: typeof body.note === "string" ? body.note : "", file },
      gate.who.actor,
    );
    return NextResponse.json({ ok: true, ...r });
  } catch (err) {
    if (err instanceof DocumentError) return NextResponse.json({ ok: false, error: err.message }, { status: err.status });
    console.error("change order approve:", err);
    return NextResponse.json({ ok: false, error: "could not record it" }, { status: 500 });
  }
}
