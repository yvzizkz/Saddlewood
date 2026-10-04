import type { NextRequest } from "next/server";

import { authorizeOps } from "@/lib/ops/auth";

// The app has two kinds of caller and neither may stand in for the other.
//
// A person: portal session cookie for an allowlisted email. Everything a
// person does in the app is recorded under that email, so the agent token is
// NOT accepted here: a token holder could otherwise approve a send in
// someone's name.
//
// The Mac bridge: OPS_AGENT_TOKEN, and only on /api/bot/sync. A portal
// session is NOT accepted there: a signed-in browser must not be able to
// write the bot's replies or its snapshot.

export async function requirePerson(request: NextRequest): Promise<string | null> {
  const who = await authorizeOps(request);
  return who && who.via === "session" ? who.actor : null;
}

export async function requireBridge(request: NextRequest): Promise<string | null> {
  const who = await authorizeOps(request);
  return who && who.via === "token" ? who.actor : null;
}

export function unauthorized() {
  return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
}
