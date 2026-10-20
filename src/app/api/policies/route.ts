import { NextRequest, NextResponse } from "next/server";

import { whoIs } from "@/lib/bot/home";
import { readState } from "@/lib/bot/queries";
import { authorizeOps } from "@/lib/ops/auth";
import { loadPolicies, PolicyError, savePolicy } from "@/lib/policies/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Company policies: office staff read them, an owner changes them, signed in
// (never the agent token: these are the owners' rules).

async function seat(request: NextRequest): Promise<{ email: string; name: string; owner: boolean } | NextResponse> {
  const who = await authorizeOps(request);
  if (!who || who.via !== "session") return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  try {
    const { sections } = await readState();
    const me = whoIs(who.actor, sections.people);
    return { email: who.actor, name: me.name || who.actor, owner: me.role === "owner" };
  } catch {
    return NextResponse.json({ ok: false, error: "unavailable" }, { status: 503 });
  }
}

export async function GET(request: NextRequest) {
  const s = await seat(request);
  if (s instanceof NextResponse) return s;
  const { values, changed } = await loadPolicies();
  return NextResponse.json({ ok: true, values, changed, canEdit: s.owner });
}

export async function PUT(request: NextRequest) {
  const s = await seat(request);
  if (s instanceof NextResponse) return s;
  if (!s.owner) return NextResponse.json({ ok: false, error: "Only an owner changes company policies." }, { status: 403 });
  const body = (await request.json().catch(() => null)) as { key?: unknown; value?: unknown } | null;
  if (!body || typeof body.key !== "string") return NextResponse.json({ ok: false, error: "Say which policy." }, { status: 400 });
  try {
    await savePolicy(body.key, body.value, s.name);
    const { values, changed } = await loadPolicies();
    return NextResponse.json({ ok: true, values, changed });
  } catch (err) {
    if (err instanceof PolicyError) return NextResponse.json({ ok: false, error: err.message }, { status: err.status });
    console.error("policies save:", err);
    return NextResponse.json({ ok: false, error: "Could not save it." }, { status: 500 });
  }
}
