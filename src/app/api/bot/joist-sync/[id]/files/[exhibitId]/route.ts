import { NextRequest, NextResponse } from "next/server";

import { requireBridge, unauthorized } from "@/lib/bot/auth";
import { readExhibitFile } from "@/lib/billing/exhibits";
import { jobExhibit } from "@/lib/billing/joistSyncStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A file to attach in Joist, for a job the Mac holds (bridge token). Not the
// client's link: a download there would count as the client opening it.

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string; exhibitId: string }> }) {
  const actor = await requireBridge(request);
  if (!actor) return unauthorized();
  const { id, exhibitId } = await params;
  const ex = Number.isInteger(Number(id)) ? await jobExhibit(Number(id), exhibitId) : null;
  if (!ex) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  const bytes = await readExhibitFile(ex.storagePath);
  return new NextResponse(new Uint8Array(bytes), {
    headers: { "Content-Type": ex.contentType || "application/octet-stream", "Content-Disposition": `attachment; filename="${ex.label.replace(/[^\w.\- ]+/g, "_")}"` },
  });
}
