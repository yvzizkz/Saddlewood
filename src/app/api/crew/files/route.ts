import { NextRequest, NextResponse } from "next/server";

import { signDownload, threadKey } from "@/lib/bot/queries";
import { pathThreadKey } from "@/lib/bot/types";
import { gateCrew } from "@/lib/crew/auth";

// Open a photo a crew member sent: redirects to a two-minute signed URL. Their
// own files only. (Owners open anyone's through /api/bot/files.)

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const gate = await gateCrew();
  if (gate.response) return gate.response;
  const person = gate.person;
  const path = new URL(request.url).searchParams.get("path") ?? "";
  if (pathThreadKey(path) !== threadKey(person.email) || !path.startsWith("u/")) {
    return NextResponse.json({ ok: false, error: "no such file" }, { status: 404 });
  }
  try {
    return NextResponse.redirect(await signDownload(path), { status: 302 });
  } catch {
    return NextResponse.json({ ok: false, error: "no such file" }, { status: 404 });
  }
}
