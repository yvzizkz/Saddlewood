import { NextResponse } from "next/server";

import { pushConfig } from "@/lib/bot/push";
import { gateCrew } from "@/lib/crew/auth";
import { crewHome } from "@/lib/crew/home";
import { touchSeen } from "@/lib/crew/queries";

// Everything a crew member's screens show, in one read: their shift, their
// week, where they are scheduled, their tasks, what the bot has asked them,
// and what they have sent in. Nothing that belongs to anyone else.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await gateCrew();
  if (gate.response) return gate.response;
  const person = gate.person;
  try {
    const config = pushConfig();
    const home = await crewHome(person, { available: !!config, publicKey: config?.publicKey ?? null });
    await touchSeen(person).catch(() => {});
    return NextResponse.json(home, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[crew/me]", (e as Error).message);
    return NextResponse.json({ ok: false, error: "Something went wrong on our side. Try again in a minute." }, { status: 500 });
  }
}
