import { NextRequest, NextResponse } from "next/server";

import { requireBridge, unauthorized } from "@/lib/bot/auth";
import { newFilePath, signUpload } from "@/lib/bot/queries";
import { BOT_BUCKET, botUploadRequestSchema } from "@/lib/bot/types";

// The Mac sends a file back (a lien waiver it built, a workbook). It asks for
// a one-time upload URL in that person's folder, PUTs the bytes straight to
// storage, then names the path in the reply it posts to /api/bot/sync.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!(await requireBridge(request))) return unauthorized();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  const parsed = botUploadRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues.map((i) => i.message).join("; ") },
      { status: 400 },
    );
  }
  try {
    const signed = await signUpload(newFilePath("b", parsed.data.thread, parsed.data.name));
    return NextResponse.json({
      ok: true,
      bucket: BOT_BUCKET,
      signedUrl: signed.signedUrl,
      file: { path: signed.path, name: parsed.data.name, type: parsed.data.type, size: parsed.data.size },
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
