import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { isId } from "@/lib/billing/http";
import { subsError, subsGate } from "@/lib/subs/access";
import { inviteSubs, setLevelAdd, withdrawInvite } from "@/lib/subs/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Who is asked to bid: add subs (each gets a link; nothing is mailed until
// Send), withdraw one, or set what the leveling sheet adds to a bid.

const schema = z.union([
  z.object({ add: z.array(z.object({ subId: z.string().uuid(), contactId: z.string().uuid().nullable().optional() })).min(1).max(30) }),
  z.object({ withdraw: z.string().uuid() }),
  z.object({ level: z.object({ inviteId: z.string().uuid(), cents: z.number().int().min(-100_000_000_00).max(100_000_000_00), note: z.string().max(500).default("") }) }),
]);

export async function POST(request: NextRequest, { params }: { params: Promise<{ pid: string }> }) {
  const gate = await subsGate(request, "manage");
  if (gate.response) return gate.response;
  const { pid } = await params;
  if (!isId(pid)) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  const body = schema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ ok: false, error: "check who to invite" }, { status: 400 });
  try {
    if ("add" in body.data) return NextResponse.json({ ok: true, invites: await inviteSubs(pid, body.data.add, gate.who.actor) });
    if ("withdraw" in body.data) {
      await withdrawInvite(pid, body.data.withdraw, gate.who.actor);
      return NextResponse.json({ ok: true });
    }
    await setLevelAdd(pid, body.data.level.inviteId, body.data.level.cents, body.data.level.note, gate.who.actor);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return subsError(err, "update the invites");
  }
}
