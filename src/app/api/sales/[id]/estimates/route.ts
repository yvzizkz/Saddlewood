import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { isId } from "@/lib/billing/http";
import { authorizeSales, salesError } from "@/lib/sales/access";
import { createEstimate, getEstimate, getOpportunity, importPipelineEstimate, SalesError } from "@/lib/sales/store";
import { localId, newEstimateBody, TEMPLATES, type TemplateKey } from "@/lib/sales/templates";
import type { EstimateBody } from "@/lib/sales/types";
import { estimateDefaults } from "@/lib/sales/settings";
import { readBody } from "@/lib/sales/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Start an estimate on an opportunity: from a template, as a copy of an
// earlier version (to price a variation without touching what was sent), or
// from a takeoff the Mac pipeline already priced.

const input = z.union([
  z.object({ template: z.enum(TEMPLATES.map((t) => t.key) as [TemplateKey, ...TemplateKey[]]) }),
  z.object({ copyOf: z.string().uuid() }),
  z.object({ pipelineEstimateId: z.string().uuid() }),
]);

/** A copy with fresh line and section ids, so the two never share a key. */
function freshIds(body: EstimateBody): EstimateBody {
  const copy = structuredClone(body);
  for (const s of copy.sections) {
    s.id = localId("s");
    for (const i of s.items) i.id = localId();
  }
  return copy;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await authorizeSales(request, { allowToken: false });
  if (gate.response) return gate.response;
  const { id } = await params;
  if (!isId(id)) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "say which template, copy or pipeline estimate" }, { status: 400 });
  try {
    const o = await getOpportunity(id);
    if (!o) throw new SalesError("not found", 404);
    let body: EstimateBody;
    let name: string | undefined;
    let sourceEstimateId: string | null = null;
    if ("template" in parsed.data) {
      // Starts from the company settings: markups, terms, how it is presented, signing.
      body = newEstimateBody(parsed.data.template, o.title, estimateDefaults(gate.settings));
    } else if ("copyOf" in parsed.data) {
      const from = await getEstimate(parsed.data.copyOf);
      if (!from || from.opportunityId !== o.id) throw new SalesError("no such version here", 404);
      const read = readBody(from.body);
      if (!read.ok) throw new SalesError(read.error, 400);
      body = freshIds(read.value);
      name = `${from.name} (copy)`;
    } else {
      const imported = await importPipelineEstimate(parsed.data.pipelineEstimateId);
      if (!imported) throw new SalesError("no such pipeline estimate", 404);
      body = imported.body;
      body.title = o.title;
      name = "From the pipeline";
      sourceEstimateId = parsed.data.pipelineEstimateId;
    }
    const estimate = await createEstimate(o.id, body, gate.who.actor, { name, sourceEstimateId });
    return NextResponse.json({ ok: true, estimate }, { status: 201 });
  } catch (err) {
    return salesError(err, "start the estimate");
  }
}
