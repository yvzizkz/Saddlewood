import { NextRequest, NextResponse } from "next/server";

import { authorizeBillingWrite } from "@/lib/billing/access";
import { followUpChangeOrder, PriceError } from "@/lib/billing/coPriceStore";
import { readBody } from "@/lib/billing/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Follow up on a change order sent and not signed (owners only, signed in):
// the same link again with the owner's words, drafted on its page when it ages
// (policy "co-pace") and never sent by itself. Without "confirm": true the
// answer is the exact message; the register stays sent.

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await authorizeBillingWrite(request, { allowToken: false });
  if (gate.response) return gate.response;
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  const body = await readBody(request);
  if (!body) return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  try {
    const result = await followUpChangeOrder(id, body, gate.who.actor);
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    if (err instanceof PriceError) return NextResponse.json({ ok: false, error: err.message, blockers: err.blockers }, { status: err.status });
    console.error("change order follow-up:", err);
    return NextResponse.json({ ok: false, error: "could not send" }, { status: 500 });
  }
}
