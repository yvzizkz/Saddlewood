import { NextRequest, NextResponse } from "next/server";

import { subsError, subsGate } from "@/lib/subs/access";
import { loadSubScorecards } from "@/lib/subs/scorecard";
import { saveSub } from "@/lib/subs/store";
import { readSubInput } from "@/lib/subs/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The sub directory (SOP-008): everyone with the subs switch reads it and adds to it.

export async function GET(request: NextRequest) {
  const gate = await subsGate(request);
  if (gate.response) return gate.response;
  try {
    const { subs, scorecards, summary } = await loadSubScorecards();
    return NextResponse.json({
      ok: true,
      subs,
      scorecards,
      complianceSummary: summary,
      can: gate.seat.can,
      me: { name: gate.seat.name, role: gate.seat.role },
    });
  } catch (err) {
    return subsError(err, "list the subs");
  }
}

export async function POST(request: NextRequest) {
  const gate = await subsGate(request, "manage");
  if (gate.response) return gate.response;
  const input = readSubInput(await request.json().catch(() => null));
  if (!input.ok) return NextResponse.json({ ok: false, error: input.error }, { status: 400 });
  try {
    return NextResponse.json({ ok: true, sub: await saveSub(null, input.value, gate.who.actor) });
  } catch (err) {
    return subsError(err, "add the sub");
  }
}
