import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requirePerson, unauthorized } from "@/lib/bot/auth";
import { isPushService, pushConfig, sendPush } from "@/lib/bot/push";
import { deletePushSubscription, savePushSubscription } from "@/lib/bot/queries";
import { pushSubscriptionSchema } from "@/lib/bot/types";

// Turn notifications on or off for this browser. The subscription belongs to
// the signed-in person; turning it on sends one notification so they see it
// work.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const email = await requirePerson(request);
  if (!email) return unauthorized();
  if (!pushConfig()) {
    return NextResponse.json({ ok: false, error: "notifications are not set up on the server" }, { status: 503 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  const parsed = pushSubscriptionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "not a push subscription" }, { status: 400 });
  if (!isPushService(parsed.data.endpoint)) {
    return NextResponse.json({ ok: false, error: "not a push subscription" }, { status: 400 });
  }
  try {
    await savePushSubscription(email, parsed.data, request.headers.get("user-agent") ?? "");
    const test = await sendPush([email], {
      title: "Notifications are on",
      body: "You will hear from the bot here when something needs you.",
      url: "/app",
      tag: "push-on",
    });
    return NextResponse.json({ ok: true, sent: test.sent });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const email = await requirePerson(request);
  if (!email) return unauthorized();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  const parsed = z.object({ endpoint: z.string().url().max(1000) }).safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "endpoint required" }, { status: 400 });
  try {
    await deletePushSubscription(parsed.data.endpoint, email);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
