import { NextResponse, type NextRequest } from "next/server";

import { whoIs } from "@/lib/bot/home";
import { readState } from "@/lib/bot/queries";
import { authorizeOps, type OpsActor } from "@/lib/ops/auth";

// Who may change billing: the owners, signed in (owner decision 2026-10-12,
// "billing is owners only for now"). Staff who are not owners may look, not act.
//
// The Mac's agent token is let in only where a route says so: sending and
// exhibits, which billing_send.py and billing_exhibit.py use, and whose
// recipients the Mac checks against the owner's allowlist first. Money
// received and voids are never the token's: those take an owner's session.
//
// Owners are the seats the Mac reports in bot_state (bot/app_allow.json).

export type BillingWriter = { who: OpsActor; response?: undefined } | { who?: undefined; response: NextResponse };

export async function authorizeBillingWrite(
  request: NextRequest,
  opts: { allowToken: boolean },
): Promise<BillingWriter> {
  const who = await authorizeOps(request);
  if (!who) return { response: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }) };
  if (who.via === "token") {
    return opts.allowToken
      ? { who }
      : { response: NextResponse.json({ ok: false, error: "an owner must do this, signed in" }, { status: 403 }) };
  }
  let owner = false;
  try {
    const { sections } = await readState();
    owner = whoIs(who.actor, sections.people).role === "owner";
  } catch (err) {
    console.error("billing access:", err);
    return { response: NextResponse.json({ ok: false, error: "unavailable" }, { status: 503 }) };
  }
  return owner
    ? { who }
    : { response: NextResponse.json({ ok: false, error: "billing is for the owners" }, { status: 403 }) };
}
