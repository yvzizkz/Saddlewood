import { NextRequest, NextResponse } from "next/server";

import { salesGate, salesError } from "@/lib/sales/access";
import { saveSettings } from "@/lib/sales/settingsStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Sales settings: everyone in Sales may read them (the builder starts from
// them); only an owner changes them.

export async function GET(request: NextRequest) {
  const gate = await salesGate(request, "person");
  if (gate.response) return gate.response;
  return NextResponse.json({ ok: true, settings: gate.settings, canEdit: gate.seat.can.editSettings });
}

export async function PUT(request: NextRequest) {
  const gate = await salesGate(request, "editSettings");
  if (gate.response) return gate.response;
  const body = (await request.json().catch(() => null)) as { settings?: unknown } | null;
  if (!body || typeof body.settings !== "object" || body.settings === null) {
    return NextResponse.json({ ok: false, error: "send the settings" }, { status: 400 });
  }
  try {
    const settings = await saveSettings(body.settings, gate.who.actor);
    return NextResponse.json({ ok: true, settings });
  } catch (err) {
    return salesError(err, "save the settings");
  }
}
