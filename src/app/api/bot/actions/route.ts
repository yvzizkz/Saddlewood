import { NextRequest, NextResponse } from "next/server";

import { requirePerson, unauthorized } from "@/lib/bot/auth";
import { whoIs } from "@/lib/bot/home";
import { countOpenActions, createAction, readState } from "@/lib/bot/queries";
import { actionSchema, ONLINE_WITHIN_MS } from "@/lib/bot/types";

// A tap on a button: approve a draft, snooze a to-do, pause a duty. The tap is
// queued here under the person's email; the Mac picks it up within seconds,
// applies the same rules it applies to a text ("approve 4"), and writes back
// what happened. This route checks the shape and that the person has an
// owner's seat. Whether THIS person may approve THIS draft is the Mac's call.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_OPEN_ACTIONS = 20;

export async function POST(request: NextRequest) {
  const email = await requirePerson(request);
  if (!email) return unauthorized();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues.map((i) => i.message).join("; ") },
      { status: 400 },
    );
  }
  try {
    const { sections, bridge } = await readState();
    if (whoIs(email, sections.people).role !== "owner") {
      return NextResponse.json(
        { ok: false, error: "That one needs Lando or Marco. You can still ask the bot for anything in Ask." },
        { status: 403 },
      );
    }
    // A tap is an instruction for right now. If the Mac is not there to carry
    // it out, refuse it instead of holding it: an approval that fires hours
    // later, when the Mac wakes up, is a send nobody is expecting any more.
    if (!bridge.seenAt || Date.now() - Date.parse(bridge.seenAt) > ONLINE_WITHIN_MS) {
      return NextResponse.json(
        { ok: false, error: "The bot is offline right now, so nothing was queued. Try again when it is back." },
        { status: 503 },
      );
    }
    if ((await countOpenActions(email)) >= MAX_OPEN_ACTIONS) {
      return NextResponse.json(
        { ok: false, error: "The bot has not caught up with your earlier taps yet. Try again in a minute." },
        { status: 429 },
      );
    }
    const action = await createAction(email, parsed.data);
    return NextResponse.json({ ok: true, action }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
