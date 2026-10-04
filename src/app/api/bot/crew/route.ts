import { NextRequest, NextResponse } from "next/server";

import { requireBridge, unauthorized } from "@/lib/bot/auth";
import { crewFeed } from "@/lib/crew/home";
import { applyCrewSync } from "@/lib/crew/sync";
import { crewSyncSchema } from "@/lib/crew/types";

// The Mac's door to the crew side. Saddlewood-KB bot/crew.py calls this with
// OPS_AGENT_TOKEN, about once a minute. A portal session is refused here.
//
//   GET   the last few days of what the crew recorded (shifts, receipts,
//         progress notes, end-of-day check-ins, answers), with short-lived
//         links to the photos the Mac has not filed yet
//   POST  what the Mac made of it: where each entry was filed, questions to
//         ask, flags on shifts, and schedule lines or tasks an owner told the
//         bot to set. Safe to send twice.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!(await requireBridge(request))) return unauthorized();
  try {
    return NextResponse.json(await crewFeed(), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!(await requireBridge(request))) return unauthorized();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  const parsed = crewSyncSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") },
      { status: 400 },
    );
  }
  const raw = body as Record<string, unknown>;
  const sent = (key: string) => (Array.isArray(raw?.[key]) ? (raw[key] as unknown[]).length : 0);
  const dropped =
    sent("entries") - parsed.data.entries.length +
    (sent("questions") - parsed.data.questions.length) +
    (sent("shifts") - parsed.data.shifts.length) +
    (sent("schedule") - parsed.data.schedule.length) +
    (sent("tasks") - parsed.data.tasks.length) +
    (sent("notify") - parsed.data.notify.length);
  try {
    const applied = await applyCrewSync(parsed.data);
    return NextResponse.json({ ok: true, applied: { ...applied, dropped } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
