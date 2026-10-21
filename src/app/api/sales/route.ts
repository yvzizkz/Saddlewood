import { NextRequest, NextResponse } from "next/server";

import { authorizeSales, salesError } from "@/lib/sales/access";
import { loadInbox } from "@/lib/sales/inbox";
import { metrics } from "@/lib/sales/pipeline";
import { createOpportunity, listOpportunities, type NewOpportunity } from "@/lib/sales/store";
import { newOpportunitySchema } from "@/lib/sales/validate";
import { localDay } from "@/lib/crew/time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The pipeline: every opportunity with its newest estimate and proposal, the
// numbers on top, and what is waiting to come in (callers, bid invites).

export async function GET(request: NextRequest) {
  const gate = await authorizeSales(request);
  if (gate.response) return gate.response;
  try {
    const rows = await listOpportunities();
    const today = localDay();
    const tracked = new Set(rows.map((r) => r.externalRef).filter((r): r is string => !!r));
    const inbox = await loadInbox(tracked);
    return NextResponse.json({
      ok: true,
      today,
      rows,
      metrics: metrics(rows, today),
      inbox: inbox.items,
      inboxSyncedAt: inbox.syncedAt,
      me: gate.who.actor,
      canSyncLeads: gate.seat.role === "owner" || gate.seat.role === "staff",
    });
  } catch (err) {
    return salesError(err, "load the pipeline");
  }
}

export async function POST(request: NextRequest) {
  const gate = await authorizeSales(request);
  if (gate.response) return gate.response;
  const parsed = newOpportunitySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    return NextResponse.json({ ok: false, error: `${i?.path.join(".") || "input"} ${i?.message ?? "is not valid"}` }, { status: 400 });
  }
  const { firstNote, ...input } = parsed.data;
  try {
    const o = await createOpportunity(
      { ...(input as NewOpportunity), owner: input.owner ?? (gate.who.via === "session" ? gate.who.actor : "") },
      gate.who.actor,
      firstNote ? { kind: "note", text: firstNote } : undefined,
    );
    return NextResponse.json({ ok: true, opportunity: o }, { status: 201 });
  } catch (err) {
    return salesError(err, "add the opportunity");
  }
}
