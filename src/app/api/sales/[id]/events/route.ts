import { NextRequest, NextResponse } from "next/server";

import { isId } from "@/lib/billing/http";
import { authorizeSales, salesError } from "@/lib/sales/access";
import { addEvent } from "@/lib/sales/store";
import { eventInputSchema } from "@/lib/sales/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Log a call, a text, a visit or a note on the timeline. It stays as written.

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await authorizeSales(request);
  if (gate.response) return gate.response;
  const { id } = await params;
  if (!isId(id)) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  const parsed = eventInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? "not valid" }, { status: 400 });
  try {
    const event = await addEvent(id, parsed.data.kind, gate.who.actor, parsed.data.text);
    return NextResponse.json({ ok: true, event }, { status: 201 });
  } catch (err) {
    return salesError(err, "log it");
  }
}
