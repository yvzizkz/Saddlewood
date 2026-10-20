import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { subsError } from "@/lib/subs/access";
import { declineBid, inviteByToken } from "@/lib/subs/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A sub passes on this one, with a reason if they give one.

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const view = await inviteByToken(token);
  if (!view) return NextResponse.json({ ok: false, error: "this link does not open a bid package" }, { status: 404 });
  const body = z.object({ note: z.string().max(1000).default("") }).safeParse(await request.json().catch(() => ({})));
  try {
    await declineBid(view, body.success ? body.data.note : "");
    return NextResponse.json({ ok: true });
  } catch (err) {
    return subsError(err, "record the answer");
  }
}
