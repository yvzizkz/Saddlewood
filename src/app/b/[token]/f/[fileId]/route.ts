import { NextRequest, NextResponse } from "next/server";

import { inviteByToken, recordBidEvent, signSubsDownload } from "@/lib/subs/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A plan sheet or spec from the package, for the sub on their link. Each
// download is written to the proof record (unless it is our own copy).

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string; fileId: string }> }) {
  const { token, fileId } = await params;
  const view = await inviteByToken(token);
  const file = view?.pkg.files.find((f) => f.id === fileId);
  if (!view || !file) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  try {
    if (request.nextUrl.searchParams.get("copy") !== "1") {
      await recordBidEvent(view.pkg.id, view.invite.id, "downloaded", "sub link", { file: file.name, ip: (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim().slice(0, 64) });
    }
    return NextResponse.redirect(await signSubsDownload(file.path, 300, file.name), 303);
  } catch (err) {
    console.error("[b] file:", (err as Error).message);
    return NextResponse.json({ ok: false, error: "could not open the file" }, { status: 500 });
  }
}
