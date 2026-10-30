import { NextRequest, NextResponse } from "next/server";

import { authorizeBillingWrite } from "@/lib/billing/access";
import { PriceError, sendChangeOrder } from "@/lib/billing/coPriceStore";
import { readBody } from "@/lib/billing/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Price it › Send: one action from a priced draft to the client's inbox
// (owners only, signed in). Refused while a line has no price or a blank is
// left. Without "confirm": true the answer is the exact message and nothing
// is sent; with it, the draft is issued as it goes out and the register moves
// to sent. Recipients pass the billing send gate (src/lib/billing/deliver.ts).

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await authorizeBillingWrite(request, { allowToken: false });
  if (gate.response) return gate.response;
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  const body = await readBody(request);
  if (!body) return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  try {
    const result = await sendChangeOrder(id, body, gate.who.actor);
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    if (err instanceof PriceError) return NextResponse.json({ ok: false, error: err.message, blockers: err.blockers }, { status: err.status });
    console.error("change order send:", err);
    return NextResponse.json({ ok: false, error: "could not send" }, { status: 500 });
  }
}
