import { NextRequest, NextResponse } from "next/server";

import { isId } from "@/lib/billing/http";
import { subsError, subsGate } from "@/lib/subs/access";
import { listInvites, listResponses, getPackage, signSubsDownload } from "@/lib/subs/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Open a file from the package or from one of its bids: a short-lived link to
// the private bucket, only for a file this package really holds.

export async function GET(request: NextRequest, { params }: { params: Promise<{ pid: string }> }) {
  const gate = await subsGate(request);
  if (gate.response) return gate.response;
  const { pid } = await params;
  const fileId = request.nextUrl.searchParams.get("fileId") ?? "";
  if (!isId(pid) || !isId(fileId)) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  try {
    const pkg = await getPackage(pid);
    if (!pkg) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
    let file = pkg.files.find((f) => f.id === fileId);
    if (!file) {
      const invites = await listInvites({ packageId: pid });
      const responses = await listResponses(invites.map((i) => i.id));
      file = responses.flatMap((r) => r.files).find((f) => f.id === fileId);
    }
    if (!file) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
    return NextResponse.redirect(await signSubsDownload(file.path, 120, file.name), 303);
  } catch (err) {
    return subsError(err, "open the file");
  }
}
