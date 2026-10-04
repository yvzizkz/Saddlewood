import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { isPushService, pushConfig, sendPush } from "@/lib/bot/push";
import { deletePushSubscription, savePushSubscription } from "@/lib/bot/queries";
import { pushSubscriptionSchema } from "@/lib/bot/types";
import { gateCrew } from "@/lib/crew/auth";

// Notifications for a crew member's phone: tomorrow's job, a new task, a
// question from the office. Same switch as the owners' side, under their own
// address.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const gate = await gateCrew();
  if (gate.response) return gate.response;
  const person = gate.person;
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
  if (!parsed.success || !isPushService(parsed.data.endpoint)) {
    return NextResponse.json({ ok: false, error: "not a push subscription" }, { status: 400 });
  }
  try {
    await savePushSubscription(person.email, parsed.data, request.headers.get("user-agent") ?? "");
    const es = person.lang === "es";
    const test = await sendPush([person.email], {
      title: es ? "Avisos activados" : "Notifications are on",
      body: es ? "Aquí te avisamos de tu horario y de preguntas de la oficina." : "Your schedule and questions from the office will show up here.",
      url: "/app",
      tag: "push-on",
    });
    return NextResponse.json({ ok: true, sent: test.sent });
  } catch (e) {
    console.error("[crew/push]", (e as Error).message);
    return NextResponse.json({ ok: false, error: "Something went wrong on our side. Try again in a minute." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const gate = await gateCrew();
  if (gate.response) return gate.response;
  const person = gate.person;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  const parsed = z.object({ endpoint: z.string().url().max(1000) }).safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "endpoint required" }, { status: 400 });
  try {
    await deletePushSubscription(parsed.data.endpoint, person.email);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[crew/push]", (e as Error).message);
    return NextResponse.json({ ok: false, error: "Something went wrong on our side. Try again in a minute." }, { status: 500 });
  }
}
