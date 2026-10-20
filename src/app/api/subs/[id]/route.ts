import { NextRequest, NextResponse } from "next/server";

import { isId } from "@/lib/billing/http";
import { subsError, subsGate } from "@/lib/subs/access";
import { getSub, listInvites, listPackages, saveSub } from "@/lib/subs/store";
import { readSubInput } from "@/lib/subs/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await subsGate(request);
  if (gate.response) return gate.response;
  const { id } = await params;
  if (!isId(id)) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  try {
    const sub = await getSub(id);
    if (!sub) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
    const [invites, packages] = await Promise.all([listInvites({ subId: id }), listPackages()]);
    const byId = new Map(packages.map((p) => [p.id, p]));
    // Their record with us: every package they were asked to bid, and how it went.
    const history = invites.map((i) => ({ inviteId: i.id, status: i.status, packageId: i.packageId, title: byId.get(i.packageId)?.title ?? "", trade: byId.get(i.packageId)?.trade ?? "", at: i.createdAt }));
    return NextResponse.json({ ok: true, sub, history, can: gate.seat.can });
  } catch (err) {
    return subsError(err, "load the sub");
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await subsGate(request, "manage");
  if (gate.response) return gate.response;
  const { id } = await params;
  if (!isId(id)) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  const input = readSubInput(await request.json().catch(() => null));
  if (!input.ok) return NextResponse.json({ ok: false, error: input.error }, { status: 400 });
  try {
    return NextResponse.json({ ok: true, sub: await saveSub(id, input.value, gate.who.actor) });
  } catch (err) {
    return subsError(err, "save the sub");
  }
}
