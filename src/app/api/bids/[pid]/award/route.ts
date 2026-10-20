import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { isId } from "@/lib/billing/http";
import { loadPolicies } from "@/lib/policies/store";
import { subsError, subsGate } from "@/lib/subs/access";
import { canAward } from "@/lib/subs/rules";
import { awardBid, packageDetail } from "@/lib/subs/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The award (SOP-008 stage 5): checked again here against Company policies,
// whatever the screen showed. What the award passed over is kept with it.

const schema = z.object({ inviteId: z.string().uuid(), why: z.string().max(1000).default("") });

export async function POST(request: NextRequest, { params }: { params: Promise<{ pid: string }> }) {
  const gate = await subsGate(request, "award");
  if (gate.response) return gate.response;
  const { pid } = await params;
  if (!isId(pid)) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  const body = schema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ ok: false, error: "pick the bid" }, { status: 400 });
  try {
    const d = await packageDetail(pid);
    if (!d) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
    const inv = d.invites.find((i) => i.id === body.data.inviteId);
    const lv = d.leveling.bids.find((b) => b.inviteId === body.data.inviteId);
    if (!inv || !lv || !inv.latest) return NextResponse.json({ ok: false, error: "only a submitted bid can be awarded" }, { status: 409 });
    const { values } = await loadPolicies();
    const role = gate.seat.role === "agent" ? "member" : gate.seat.role;
    const bids = d.invites.filter((i) => i.latest).length;
    const check = canAward(role, gate.seat.can.award, { subStatus: inv.sub.status, leveledCents: lv.leveledCents, budgetCents: d.leveling.budgetCents, bids, packageCents: d.leveling.budgetCents || lv.leveledCents }, values);
    if (!check.ok) return NextResponse.json({ ok: false, error: check.reason }, { status: 403 });
    await awardBid(pid, inv.id, gate.who.actor, {
      sub: inv.sub.name,
      revision: inv.latest.revision,
      fingerprint: inv.latest.fingerprint,
      headlineCents: lv.headlineCents,
      leveledCents: lv.leveledCents,
      budgetCents: d.leveling.budgetCents,
      rank: lv.rank,
      bids,
      passedOver: check.warnings,
      why: body.data.why,
    });
    return NextResponse.json({ ok: true, warnings: check.warnings });
  } catch (err) {
    return subsError(err, "award the bid");
  }
}
