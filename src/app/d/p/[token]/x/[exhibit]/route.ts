import { NextRequest, NextResponse } from "next/server";

import { getDocumentByPreviewToken } from "@/lib/billing/documents";
import { getExhibit, readExhibitFile } from "@/lib/billing/exhibits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// One of the things shown with a draft, opened from its preview page. The
// same file or link the client will get from /d/<token>/x/<id>, but nothing is
// written to the proof record, and it opens only while the document is a draft.

const gone = () => new NextResponse("Not found", { status: 404, headers: { "X-Robots-Tag": "noindex" } });

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string; exhibit: string }> }) {
  const { token, exhibit: exhibitId } = await params;
  try {
    const doc = await getDocumentByPreviewToken(token);
    if (!doc || doc.status !== "draft") return gone();
    const exhibit = await getExhibit(exhibitId);
    if (!exhibit || exhibit.documentId !== doc.id || exhibit.removedAt) return gone();

    if (exhibit.kind === "link" && exhibit.url) {
      return NextResponse.redirect(exhibit.url, { status: 302, headers: { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" } });
    }
    if (exhibit.kind === "file" && exhibit.storagePath) {
      const body = await readExhibitFile(exhibit.storagePath);
      const ext = exhibit.storagePath.split(".").pop() ?? "pdf";
      const name = `${exhibit.label.replace(/[^A-Za-z0-9 ._-]+/g, " ").replace(/\s+/g, " ").trim() || "document"}.${ext}`;
      return new NextResponse(new Uint8Array(body), {
        status: 200,
        headers: {
          "Content-Type": exhibit.contentType ?? "application/octet-stream",
          "Content-Disposition": `${request.nextUrl.searchParams.get("dl") === "1" ? "attachment" : "inline"}; filename="${name}"`,
          "Content-Length": String(body.length),
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
          "X-Robots-Tag": "noindex",
        },
      });
    }
    return gone();
  } catch (err) {
    console.error("preview exhibit:", err);
    return new NextResponse("Could not open this. Please try again.", { status: 500 });
  }
}
