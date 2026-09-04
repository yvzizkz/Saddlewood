import { NextRequest, NextResponse } from "next/server";

import { authorizeOps } from "@/lib/ops/auth";
import { createCard, listCards } from "@/lib/ops/queries";
import { createCardSchema } from "@/lib/ops/types";

// The Ops board's API. People reach it with their portal session; the bot and
// Claude sessions reach it with OPS_AGENT_TOKEN. Both are the same shape, so
// a card added by a session looks exactly like one added by Marco.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const who = await authorizeOps(request);
  if (!who) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const includeArchived = new URL(request.url).searchParams.get("archived") === "1";
  try {
    const cards = await listCards({ includeArchived });
    return NextResponse.json({ ok: true, cards });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const who = await authorizeOps(request);
  if (!who) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  const parsed = createCardSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues.map((i) => i.message).join("; ") },
      { status: 400 },
    );
  }
  try {
    const card = await createCard(parsed.data, who.actor);
    return NextResponse.json({ ok: true, card }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
