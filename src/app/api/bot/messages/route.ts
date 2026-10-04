import { NextRequest, NextResponse } from "next/server";

import { requirePerson, unauthorized } from "@/lib/bot/auth";
import { whoIs } from "@/lib/bot/home";
import { countOpenRequests, createUserMessage, listThread, readState, threadKey } from "@/lib/bot/queries";
import { MAX_OPEN_REQUESTS, newMessageSchema, pathThreadKey } from "@/lib/bot/types";

// A person's conversation with the bot. One thread per person, keyed by their
// email. A new message waits here until the Mac collects it; the reply shows
// up as the next row.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const email = await requirePerson(request);
  if (!email) return unauthorized();
  try {
    const messages = await listThread(email);
    return NextResponse.json({ ok: true, messages }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const email = await requirePerson(request);
  if (!email) return unauthorized();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  const parsed = newMessageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues.map((i) => i.message).join("; ") },
      { status: 400 },
    );
  }
  // A person may only attach files they uploaded themselves.
  const mine = threadKey(email);
  if (parsed.data.attachments.some((f) => !f.path.startsWith("u/") || pathThreadKey(f.path) !== mine)) {
    return NextResponse.json({ ok: false, error: "that file is not yours to attach" }, { status: 400 });
  }
  try {
    const { sections } = await readState();
    if (!whoIs(email, sections.people).role) {
      return NextResponse.json(
        { ok: false, error: "The bot does not have a seat for you yet. Ask Lando to add you." },
        { status: 403 },
      );
    }
    if ((await countOpenRequests(email)) >= MAX_OPEN_REQUESTS) {
      return NextResponse.json(
        { ok: false, error: "The bot is still working on your earlier requests. Give it a few minutes." },
        { status: 429 },
      );
    }
    const message = await createUserMessage(email, parsed.data.body, parsed.data.attachments);
    return NextResponse.json({ ok: true, message }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
