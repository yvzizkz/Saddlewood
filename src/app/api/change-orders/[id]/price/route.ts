import { NextRequest, NextResponse } from "next/server";

import { authorizeBillingWrite } from "@/lib/billing/access";
import { readPriceEdit } from "@/lib/billing/coPrice";
import { PriceError, savePrices } from "@/lib/billing/coPriceStore";
import { present, readBody } from "@/lib/billing/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Price it › Save: the owner's prices and words on a change order's draft
// (owners only, signed in: SOP-002, the PM never prices). Nothing is sent.

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await authorizeBillingWrite(request, { allowToken: false });
  if (gate.response) return gate.response;
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  const body = await readBody(request);
  if (!body) return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  const read = readPriceEdit(body);
  if (!read.ok) return NextResponse.json({ ok: false, error: read.error }, { status: 400 });
  try {
    const doc = await savePrices(id, read.value, gate.who.actor);
    return NextResponse.json({ ok: true, document: present(doc) });
  } catch (err) {
    if (err instanceof PriceError) return NextResponse.json({ ok: false, error: err.message }, { status: err.status });
    console.error("change order price:", err);
    return NextResponse.json({ ok: false, error: "could not save" }, { status: 500 });
  }
}
