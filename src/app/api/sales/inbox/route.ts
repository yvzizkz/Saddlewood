import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createAction, getAction } from "@/lib/bot/queries";
import { updateLeadStatus } from "@/lib/leads/store";
import { salesError, salesGate } from "@/lib/sales/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The Sales inbox's two actions on the call list, moved here from the old
// /internal/leads page:
//
//   PATCH  { phone, status }   mark a caller called, texted, dismissed or
//                              back to pending (any person with a Sales seat)
//   POST   { sync: true }      ask the office Mac to pull from GoHighLevel
//                              (owners and staff: the Mac's bridge carries a
//                              tap out only for a seat it knows)
//   GET    ?action=<id>        how that sync is going
//
// The list itself still comes from the Mac (PUT /api/leads, agent token).

const statusSchema = z.object({
  phone: z.string().trim().min(1).max(40),
  status: z.enum(["pending", "called", "texted", "dismissed"]),
});

export async function GET(request: NextRequest) {
  const gate = await salesGate(request, "person");
  if (gate.response) return gate.response;
  const id = Number(request.nextUrl.searchParams.get("action"));
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ ok: false, error: "no such sync" }, { status: 404 });
  try {
    const action = await getAction(id);
    if (!action || action.kind !== "leads.sync") return NextResponse.json({ ok: false, error: "no such sync" }, { status: 404 });
    return NextResponse.json({ ok: true, action: { id: action.id, status: action.status, result: action.result } });
  } catch (err) {
    return salesError(err, "check the sync");
  }
}

export async function POST(request: NextRequest) {
  const gate = await salesGate(request, "person");
  if (gate.response) return gate.response;
  if (gate.seat.role !== "owner" && gate.seat.role !== "staff") {
    return NextResponse.json({ ok: false, error: "the office syncs the call list" }, { status: 403 });
  }
  const body = await request.json().catch(() => null);
  if (!body || body.sync !== true) return NextResponse.json({ ok: false, error: "send { sync: true }" }, { status: 400 });
  try {
    const a = await createAction(gate.seat.email, { kind: "leads.sync", payload: {} });
    return NextResponse.json({ ok: true, action: { id: a.id, status: a.status } });
  } catch (err) {
    return salesError(err, "start a sync");
  }
}

export async function PATCH(request: NextRequest) {
  const gate = await salesGate(request, "person");
  if (gate.response) return gate.response;
  const parsed = statusSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "send { phone, status }" }, { status: 400 });
  try {
    await updateLeadStatus(parsed.data.phone, parsed.data.status);
    return NextResponse.json({ ok: true, phone: parsed.data.phone, status: parsed.data.status });
  } catch (err) {
    return salesError(err, "update the caller");
  }
}
