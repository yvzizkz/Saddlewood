import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { newFilePath, signUpload } from "@/lib/bot/queries";
import { BOT_BUCKET, MAX_UPLOAD_BYTES } from "@/lib/bot/types";
import { gateCrew } from "@/lib/crew/auth";

// A photo from the jobsite goes straight from the phone to storage, into the
// person's own folder of the private bucket. This hands out the one-time
// upload URL; the receipt or progress note that follows names the path.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  name: z.string().trim().min(1).max(160),
  type: z.enum(["image/jpeg", "image/png", "image/heic", "image/heif", "image/webp", "application/pdf"]),
  size: z.number().int().min(1).max(MAX_UPLOAD_BYTES),
});

export async function POST(request: NextRequest) {
  const gate = await gateCrew();
  if (gate.response) return gate.response;
  const person = gate.person;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Photos and PDFs up to 15 MB can be sent." }, { status: 400 });
  }
  try {
    const signed = await signUpload(newFilePath("u", person.email, parsed.data.name));
    return NextResponse.json({
      ok: true,
      bucket: BOT_BUCKET,
      path: signed.path,
      token: signed.token,
      file: { path: signed.path, name: parsed.data.name, type: parsed.data.type, size: parsed.data.size },
    });
  } catch (e) {
    console.error("[crew/uploads]", (e as Error).message);
    return NextResponse.json({ ok: false, error: "Something went wrong on our side. Try again in a minute." }, { status: 500 });
  }
}
