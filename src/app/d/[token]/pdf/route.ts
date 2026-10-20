import { NextResponse, type NextRequest } from "next/server";

import { getDocumentByToken } from "@/lib/billing/documents";
import { recordOpening } from "@/lib/billing/opening";
import { proposalPdf } from "@/lib/sales/mail";
import { proposalRecord } from "@/lib/sales/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The client's PDF of a proposal: /d/<token>/pdf, the exact token only. The
// signatures on it so far are on it; once signed, the signature record page.
// Fetching it is a "downloaded" line in the proof record (not with ?copy=1).

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const doc = await getDocumentByToken(token).catch(() => null);
  if (!doc || doc.kind !== "estimate" || doc.status === "draft") return NextResponse.json({ ok: false, error: "This link does not open a proposal." }, { status: 404 });
  const rec = await proposalRecord(doc.id);
  if (!rec) return NextResponse.json({ ok: false, error: "This link does not open a proposal." }, { status: 404 });
  if (request.nextUrl.searchParams.get("copy") !== "1") await recordOpening(doc, "downloaded", { exhibit: "PDF" });
  try {
    const pdf = await proposalPdf(rec.doc, rec.proposal, rec.signatures, rec.events);
    return new NextResponse(new Uint8Array(pdf.content), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `${request.nextUrl.searchParams.get("dl") === "1" ? "attachment" : "inline"}; filename="${pdf.filename}"`,
        "cache-control": "private, no-store",
      },
    });
  } catch (err) {
    console.error("proposal pdf:", err);
    return NextResponse.json({ ok: false, error: "The PDF could not be made. Please call us." }, { status: 500 });
  }
}
