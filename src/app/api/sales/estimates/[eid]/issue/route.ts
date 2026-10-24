import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { isId, siteUrl } from "@/lib/billing/http";
import { salesError, salesGate } from "@/lib/sales/access";
import { blocking, runChecks } from "@/lib/sales/checks";
import { getEstimate, getOpportunityDetail, issueProposal, SalesError } from "@/lib/sales/store";
import { readBody } from "@/lib/sales/validate";
import { localDay } from "@/lib/crew/time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Freeze the estimate as the proposal the client gets, and hand back its link.
// Nothing is emailed here: the link is shared from the phone, or emailed from
// the app afterwards (POST /api/sales/proposals/<id>/email, a separate step
// with its own preview). Opening it is what the viewing record counts.
//
// Without { confirm: true } this only answers what would go out and what the
// checks say. A "stop" check refuses the issue; the owner fixes it first.

const input = z.object({ confirm: z.boolean().optional() });

export async function POST(request: NextRequest, { params }: { params: Promise<{ eid: string }> }) {
  const gate = await salesGate(request, "send");
  if (gate.response) return gate.response;
  const { eid } = await params;
  if (!isId(eid)) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  const parsed = input.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "bad request" }, { status: 400 });
  const today = localDay();
  try {
    const est = await getEstimate(eid);
    if (!est) throw new SalesError("not found", 404);
    const detail = await getOpportunityDetail(est.opportunityId);
    if (!detail) throw new SalesError("not found", 404);
    const body = readBody(est.body);
    if (!body.ok) throw new SalesError(body.error, 400);
    const checks = runChecks(body.value, {
      today,
      kind: detail.opportunity.kind,
      bidDue: detail.opportunity.bidDue,
      prior: detail.proposals.filter((p) => p.status === "issued").map((p) => ({ number: p.number, revision: p.revision, totalCents: p.totalCents, issuedAt: p.issuedAt })),
    });
    const stops = blocking(checks);
    if (!parsed.data.confirm) return NextResponse.json({ ok: true, preview: true, checks });
    if (stops.length > 0) {
      return NextResponse.json({ ok: false, error: `fix first: ${stops.map((c) => c.title).join("; ")}`, checks }, { status: 409 });
    }
    const { document } = await issueProposal(eid, gate.who.actor, today, gate.settings.signing);
    return NextResponse.json({
      ok: true,
      documentId: document.id,
      number: document.number,
      revision: document.revision,
      totalCents: document.totalCents,
      link: `${siteUrl()}/d/${document.token}`,
      // Our own people open this one: it is never counted as the client's viewing.
      ownLink: `${siteUrl()}/d/${document.token}?copy=1`,
    });
  } catch (err) {
    return salesError(err, "issue the proposal");
  }
}
