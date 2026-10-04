import { NextRequest, NextResponse } from "next/server";

import { requirePerson, unauthorized } from "@/lib/bot/auth";
import { whoIs } from "@/lib/bot/home";
import { readState, signDownload, threadKey } from "@/lib/bot/queries";
import { pathThreadKey } from "@/lib/bot/types";

// Open a file from a conversation: redirects to a two-minute signed URL. A
// person can open files in their own thread; an owner can open any.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const email = await requirePerson(request);
  if (!email) return unauthorized();
  const path = new URL(request.url).searchParams.get("path") ?? "";
  const key = pathThreadKey(path);
  if (!key) return NextResponse.json({ ok: false, error: "no such file" }, { status: 404 });
  try {
    if (key !== threadKey(email)) {
      const { sections } = await readState();
      if (whoIs(email, sections.people).role !== "owner") {
        return NextResponse.json({ ok: false, error: "no such file" }, { status: 404 });
      }
    }
    return NextResponse.redirect(await signDownload(path), { status: 302 });
  } catch {
    return NextResponse.json({ ok: false, error: "no such file" }, { status: 404 });
  }
}
