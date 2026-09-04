import { NextRequest, NextResponse } from "next/server";

import { authorizeOps } from "@/lib/ops/auth";
import { addComment, listComments } from "@/lib/ops/queries";
import { commentSchema } from "@/lib/ops/types";

// Responses on a card. A person's response is signed with their email, an
// agent's with its name. They never disappear; the card can be archived and
// the responses stay under it.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Ctx) {
  const who = await authorizeOps(request);
  if (!who) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  try {
    return NextResponse.json({ ok: true, comments: await listComments(id) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: Ctx) {
  const who = await authorizeOps(request);
  if (!who) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  const parsed = commentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "a response needs some text, up to 2,000 characters" }, { status: 400 });
  }
  try {
    const comment = await addComment(id, parsed.data.body, who.actor);
    if (!comment) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
    return NextResponse.json({ ok: true, comment }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
