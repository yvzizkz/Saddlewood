import { NextRequest, NextResponse } from "next/server";

import { isId } from "@/lib/billing/http";
import { salesError, salesGate } from "@/lib/sales/access";
import { proposalPdf } from "@/lib/sales/mail";
import { proposalRecord } from "@/lib/sales/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The proposal as a PDF, for our own people: with every signature on it so
// far and, once signed, the signature record page. Not a client download, so
// nothing is written to the proof record.

export async function GET(request: NextRequest, { params }: { params: Promise<{ docId: string }> }) {
  const gate = await salesGate(request, "person");
  if (gate.response) return gate.response;
  const { docId } = await params;
  if (!isId(docId)) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  try {
    const rec = await proposalRecord(docId);
    if (!rec) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
    const pdf = await proposalPdf(rec.doc, rec.proposal, rec.signatures, rec.events);
    return new NextResponse(new Uint8Array(pdf.content), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `inline; filename="${pdf.filename}"`,
        "cache-control": "private, no-store",
      },
    });
  } catch (err) {
    return salesError(err, "make the PDF");
  }
}
