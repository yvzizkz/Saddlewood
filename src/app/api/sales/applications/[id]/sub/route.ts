import { NextRequest, NextResponse } from "next/server";

import { salesGate } from "@/lib/sales/access";
import { SubsError, subsError } from "@/lib/subs/access";
import { findSub, subFromApplication } from "@/lib/subs/fromApplication";
import { listSubs, saveSub } from "@/lib/subs/store";
import type { Sub } from "@/lib/subs/types";
import { readSubInput } from "@/lib/subs/validate";
import { getSubmission, markSubmission, type Submission } from "@/lib/webforms/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A trade-partner application goes on the sub directory and closes. The office
// only, like the page. A company already there is linked, never added twice,
// and nothing on it changes, so it's safe to tap again after a failure.

async function subFor(s: Submission, actor: string): Promise<{ sub: Sub; created: boolean } | { error: string }> {
  const already = findSub(s, await listSubs());
  if (already) return { sub: already, created: false };
  const input = readSubInput(subFromApplication(s));
  if (!input.ok) return { error: input.error };
  try {
    return { sub: await saveSub(null, input.value, actor), created: true };
  } catch (err) {
    // Someone else just added it: the name is unique in the directory.
    const raced = err instanceof SubsError && err.status === 409 ? findSub(s, await listSubs()) : null;
    if (raced) return { sub: raced, created: false };
    throw err;
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await salesGate(request, "person");
  if (gate.response) return gate.response;
  if (gate.seat.role !== "owner" && gate.seat.role !== "staff") return NextResponse.json({ ok: false, error: "the office adds subs from here" }, { status: 403 });
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ ok: false, error: "no such application" }, { status: 404 });
  try {
    const s = await getSubmission(id);
    if (s?.form !== "trade_partner") return NextResponse.json({ ok: false, error: "no such application" }, { status: 404 });
    const out = await subFor(s, gate.who.actor);
    if ("error" in out) return NextResponse.json({ ok: false, error: out.error }, { status: 400 });
    await markSubmission(id, "dismissed", ["trade_partner"]);
    return NextResponse.json({ ok: true, sub: { id: out.sub.id, name: out.sub.name }, created: out.created });
  } catch (err) {
    return subsError(err, "add the sub");
  }
}
