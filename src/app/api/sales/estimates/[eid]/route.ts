import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { isId } from "@/lib/billing/http";
import { authorizeSales, salesError } from "@/lib/sales/access";
import { archiveEstimate, getEstimate, getOpportunityDetail, saveEstimate } from "@/lib/sales/store";
import { readBody } from "@/lib/sales/validate";
import { localDay } from "@/lib/crew/time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// One estimate, for the builder: its body, its opportunity, and every
// proposal already sent on that opportunity (the checks compare against the
// newest one before anything else goes out).

export async function GET(request: NextRequest, { params }: { params: Promise<{ eid: string }> }) {
  const gate = await authorizeSales(request);
  if (gate.response) return gate.response;
  const { eid } = await params;
  if (!isId(eid)) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  try {
    const estimate = await getEstimate(eid);
    if (!estimate) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
    const detail = await getOpportunityDetail(estimate.opportunityId);
    const body = readBody(estimate.body);
    return NextResponse.json({
      ok: true,
      today: localDay(),
      estimate: { ...estimate, body: body.ok ? body.value : estimate.body },
      opportunity: detail?.opportunity ?? null,
      proposals: detail?.proposals ?? [],
      versions: detail?.estimates ?? [],
      can: gate.seat.can,
      // The company defaults the builder's "Use company defaults" resets to, and the email sheet starts from.
      defaults: { present: gate.settings.proposal.present },
      emailDefaults: {
        subject: gate.settings.email.subject,
        body: gate.settings.email.body,
        link: gate.settings.email.defaultLink,
        attachPdf: gate.settings.email.defaultAttachPdf,
        fromName: gate.settings.email.fromName,
        fromAddress: gate.settings.email.fromAddress,
      },
    });
  } catch (err) {
    return salesError(err, "load the estimate");
  }
}

const save = z.object({
  body: z.unknown(),
  expected: z.string().nullable().optional(),
  name: z.string().max(80).optional(),
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ eid: string }> }) {
  const gate = await authorizeSales(request, { allowToken: false });
  if (gate.response) return gate.response;
  const { eid } = await params;
  if (!isId(eid)) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  const parsed = save.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "send the estimate" }, { status: 400 });
  const body = readBody(parsed.data.body);
  if (!body.ok) return NextResponse.json({ ok: false, error: body.error }, { status: 400 });
  try {
    const estimate = await saveEstimate(eid, body.value, parsed.data.expected ?? null, gate.who.actor, parsed.data.name);
    return NextResponse.json({ ok: true, updatedAt: estimate.updatedAt, sellCents: estimate.sellCents });
  } catch (err) {
    return salesError(err, "save the estimate");
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ eid: string }> }) {
  const gate = await authorizeSales(request, { allowToken: false });
  if (gate.response) return gate.response;
  const { eid } = await params;
  if (!isId(eid)) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  try {
    await archiveEstimate(eid, gate.who.actor);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return salesError(err, "archive the estimate");
  }
}
