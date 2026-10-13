import { NextRequest, NextResponse } from "next/server";

import { signDownload, threadKey } from "@/lib/bot/queries";
import { pathThreadKey } from "@/lib/bot/types";
import { gateCrew } from "@/lib/crew/auth";
import { listPeople } from "@/lib/crew/queries";

// Open a photo a crew member sent: redirects to a two-minute signed URL. Their
// own files only, except the lead (field supervisor), who checks the crew's
// work and so opens any crew member's photos. Never a file outside the crew's
// folders. (Owners open anyone's through /api/bot/files.)

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const gate = await gateCrew();
  if (gate.response) return gate.response;
  const person = gate.person;
  const path = new URL(request.url).searchParams.get("path") ?? "";
  const key = pathThreadKey(path);
  const nope = () => NextResponse.json({ ok: false, error: "no such file" }, { status: 404 });
  if (!key || !path.startsWith("u/")) return nope();
  if (key !== threadKey(person.email)) {
    if (person.role !== "lead") return nope();
    const crew = await listPeople().catch(() => []);
    if (!crew.some((p) => threadKey(p.email) === key)) return nope();
  }
  try {
    return NextResponse.redirect(await signDownload(path), { status: 302 });
  } catch {
    return NextResponse.json({ ok: false, error: "no such file" }, { status: 404 });
  }
}
