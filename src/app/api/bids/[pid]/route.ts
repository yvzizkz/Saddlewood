import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { isId } from "@/lib/billing/http";
import { loadPolicies } from "@/lib/policies/store";
import { subsError, subsGate } from "@/lib/subs/access";
import { canAward, readiness } from "@/lib/subs/rules";
import { buildAwardEmailDrafts, buildWorkOrder } from "@/lib/subs/scorecard";
import { listSubs, packageDetail, setPackageStatus, updatePackage } from "@/lib/subs/store";
import { readPackageInput } from "@/lib/subs/validate";
import { localDay } from "@/lib/crew/time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// One package: everything the screen shows (invites, each sub's latest bid,
// the leveling sheet, who may award which bid), a change (with an addendum
// once it is out), and its status.

export async function GET(request: NextRequest, { params }: { params: Promise<{ pid: string }> }) {
  const gate = await subsGate(request);
  if (gate.response) return gate.response;
  const { pid } = await params;
  if (!isId(pid)) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  try {
    const [d, allSubs, { values }] = await Promise.all([packageDetail(pid), listSubs(), loadPolicies()]);
    if (!d) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
    const today = localDay();
    const bids = d.invites.filter((i) => i.latest).length;
    const role = gate.seat.role === "agent" ? "member" : gate.seat.role;
    const invites = d.invites.map((i) => {
      const lv = d.leveling.bids.find((b) => b.inviteId === i.id);
      return {
        ...i,
        readiness: readiness(i.sub, today),
        award:
          lv && i.status === "submitted"
            ? canAward(role, gate.seat.can.award, { subStatus: i.sub.status, leveledCents: lv.leveledCents, budgetCents: d.leveling.budgetCents, bids, packageCents: d.leveling.budgetCents || lv.leveledCents }, values)
            : null,
      };
    });
    const subById = new Map(allSubs.map((s) => [s.id, s]));
    const workOrder = buildWorkOrder(d, subById, values, today);
    const emailDrafts = buildAwardEmailDrafts(d, workOrder, gate.seat.name);
    return NextResponse.json({
      ok: true,
      ...d,
      invites,
      workOrder,
      emailDrafts,
      can: gate.seat.can,
      minBids: values["policy.subs.minBids"],
      minBidsFromCents: values["policy.subs.minBidsFromCents"],
    });
  } catch (err) {
    return subsError(err, "load the package");
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ pid: string }> }) {
  const gate = await subsGate(request, "manage");
  if (gate.response) return gate.response;
  const { pid } = await params;
  if (!isId(pid)) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  const raw = (await request.json().catch(() => null)) as { package?: unknown; addendum?: unknown } | null;
  const input = readPackageInput(raw?.package);
  if (!input.ok) return NextResponse.json({ ok: false, error: input.error }, { status: 400 });
  try {
    const pkg = await updatePackage(pid, input.value, gate.who.actor, typeof raw?.addendum === "string" ? raw.addendum.slice(0, 4000) : "");
    return NextResponse.json({ ok: true, package: pkg });
  } catch (err) {
    return subsError(err, "save the package");
  }
}

const statusSchema = z.object({ status: z.enum(["out", "closed", "cancelled", "draft"]) });

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ pid: string }> }) {
  const gate = await subsGate(request, "manage");
  if (gate.response) return gate.response;
  const { pid } = await params;
  if (!isId(pid)) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  const body = statusSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ ok: false, error: "check the status" }, { status: 400 });
  try {
    return NextResponse.json({ ok: true, package: await setPackageStatus(pid, body.data.status, gate.who.actor) });
  } catch (err) {
    return subsError(err, "change the package");
  }
}
