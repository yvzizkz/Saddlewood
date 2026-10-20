import { NextRequest, NextResponse } from "next/server";

import { isId } from "@/lib/billing/http";
import { authorizeSales, salesError } from "@/lib/sales/access";
import { getOpportunityDetail, updateOpportunity, type OpportunityPatch } from "@/lib/sales/store";
import { opportunityPatchSchema } from "@/lib/sales/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await authorizeSales(request);
  if (gate.response) return gate.response;
  const { id } = await params;
  if (!isId(id)) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  try {
    const detail = await getOpportunityDetail(id);
    if (!detail) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
    const s = gate.settings;
    return NextResponse.json({
      ok: true,
      ...detail,
      // What this person may do here, and the defaults the send and sign sheets start from.
      can: gate.seat.can,
      me: { name: gate.seat.name, email: gate.seat.role === "agent" ? "" : gate.seat.email },
      settings: {
        email: {
          subject: s.email.subject,
          body: s.email.body,
          link: s.email.defaultLink,
          attachPdf: s.email.defaultAttachPdf,
          fromName: s.email.fromName,
          fromAddress: s.email.fromAddress,
        },
        signing: { consentText: s.signing.consentText, companyTitle: s.signing.companyTitle, fonts: s.signing.fonts },
      },
    });
  } catch (err) {
    return salesError(err, "load the opportunity");
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await authorizeSales(request);
  if (gate.response) return gate.response;
  const { id } = await params;
  if (!isId(id)) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  const parsed = opportunityPatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    return NextResponse.json({ ok: false, error: `${i?.path.join(".") || "input"} ${i?.message ?? "is not valid"}` }, { status: 400 });
  }
  const { why, ...patch } = parsed.data;
  // Won and lost are a person's call, never the agent's.
  if (!gate.seat.can.markWonLost && (patch.stage === "won" || patch.stage === "lost")) {
    return NextResponse.json({ ok: false, error: "a person marks it won or lost" }, { status: 403 });
  }
  try {
    const o = await updateOpportunity(id, patch as OpportunityPatch, gate.who.actor, why ?? "");
    return NextResponse.json({ ok: true, opportunity: o });
  } catch (err) {
    return salesError(err, "save the opportunity");
  }
}
