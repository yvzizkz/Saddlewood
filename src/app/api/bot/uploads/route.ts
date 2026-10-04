import { NextRequest, NextResponse } from "next/server";

import { requirePerson, unauthorized } from "@/lib/bot/auth";
import { whoIs } from "@/lib/bot/home";
import { newFilePath, readState, signUpload } from "@/lib/bot/queries";
import { BOT_BUCKET, uploadRequestSchema } from "@/lib/bot/types";

// Photos from a phone are bigger than a function request may be, so the file
// never passes through here. This hands the browser a one-time upload URL for
// a path in the person's own folder of the private bucket; the message that
// follows names that path.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const email = await requirePerson(request);
  if (!email) return unauthorized();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  const parsed = uploadRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Photos, PDFs, spreadsheets and Word files up to 15 MB can be attached." },
      { status: 400 },
    );
  }
  try {
    const { sections } = await readState();
    if (!whoIs(email, sections.people).role) return unauthorized();
    const signed = await signUpload(newFilePath("u", email, parsed.data.name));
    return NextResponse.json({
      ok: true,
      bucket: BOT_BUCKET,
      path: signed.path,
      token: signed.token,
      file: { path: signed.path, name: parsed.data.name, type: parsed.data.type, size: parsed.data.size },
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
