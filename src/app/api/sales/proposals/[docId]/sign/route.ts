import { after, NextRequest, NextResponse } from "next/server";

import { isId } from "@/lib/billing/http";
import { salesError, salesGate } from "@/lib/sales/access";
import { notifyAfterSignature } from "@/lib/sales/mail";
import { proposalRecord, signAsCompany } from "@/lib/sales/store";
import { readSignatureInput } from "@/lib/sales/signing";
import { localDay } from "@/lib/crew/time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Saddlewood countersigns a proposal (one that asks for both signatures).
// Who may: the owners, or Sales seats too when Sales settings say so. When it
// completes the proposal, the signing workflow emails whoever the settings say.

export async function POST(request: NextRequest, { params }: { params: Promise<{ docId: string }> }) {
  const gate = await salesGate(request, "sign");
  if (gate.response) return gate.response;
  const { docId } = await params;
  if (!isId(docId)) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  const sig = readSignatureInput(await request.json().catch(() => null));
  if (!sig.ok) return NextResponse.json({ ok: false, error: sig.error }, { status: 400 });
  try {
    const r = await signAsCompany(docId, { ...sig.value, email: sig.value.email || (gate.seat.email.includes("@") ? gate.seat.email : "") }, { actor: gate.who.actor, title: gate.settings.signing.companyTitle }, {
      ip: (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim(),
      ua: request.headers.get("user-agent") ?? "",
      today: localDay(),
    });
    const settings = gate.settings;
    after(async () => {
      const rec = await proposalRecord(docId);
      if (rec) await notifyAfterSignature({ doc: rec.doc, proposal: rec.proposal, sigs: rec.signatures, events: rec.events, settings, who: "company", executed: r.executed });
    });
    return NextResponse.json({ ok: true, executed: r.executed });
  } catch (err) {
    return salesError(err, "sign the proposal");
  }
}
