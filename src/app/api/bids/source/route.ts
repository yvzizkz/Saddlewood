import { NextRequest, NextResponse } from "next/server";

import { isId } from "@/lib/billing/http";
import { subsError, subsGate } from "@/lib/subs/access";
import { scopeSource } from "@/lib/subs/source";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The estimate a new package's scope starts from: its sections, each line with our own cost.

export async function GET(request: NextRequest) {
  const gate = await subsGate(request, "manage");
  if (gate.response) return gate.response;
  const q = request.nextUrl.searchParams;
  const jobId = q.get("jobId");
  const opportunityId = q.get("opportunityId");
  if ((!jobId && !opportunityId) || (jobId && !isId(jobId)) || (opportunityId && !isId(opportunityId))) {
    return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  }
  try {
    const source = await scopeSource({ jobId, opportunityId });
    if (!source) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
    return NextResponse.json({ ok: true, source });
  } catch (err) {
    return subsError(err, "read the estimate");
  }
}
