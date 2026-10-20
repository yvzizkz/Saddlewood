import { NextResponse, type NextRequest } from "next/server";

import { whoIs } from "@/lib/bot/home";
import { readState } from "@/lib/bot/queries";
import { getViewer, requireCrew } from "@/lib/crew/auth";
import { hasPerm } from "@/lib/crew/types";
import { authorizeOps, type OpsActor } from "@/lib/ops/auth";

// Who works the sub directory and the bid-out, and what they may do. One
// answer for the pages, the routes and the screens.
//
//   owner          everything
//   office staff   (allowlisted, not an owner) everything an owner does here
//   a crew seat    with "subs.manage": the directory, packages, invites, the
//                  leveling sheet; with "subs.award" too: award inside the PM
//                  limit (Company policies; rules.ts canAward)
//   the Mac's token  read only

export type SubsSeat = {
  email: string;
  name: string;
  role: "owner" | "staff" | "member" | "agent";
  can: { manage: boolean; award: boolean };
};

export type SubsNeed = "view" | "manage" | "award";

async function staffSeat(email: string): Promise<SubsSeat> {
  const { sections } = await readState();
  const me = whoIs(email, sections.people);
  return { email, name: me.name || email.split("@")[0], role: me.role === "owner" ? "owner" : "staff", can: { manage: true, award: true } };
}

export async function subsSeatForPage(): Promise<SubsSeat | null> {
  const v = await getViewer();
  if (v.kind === "staff") return staffSeat(v.email);
  if (v.kind === "crew" && hasPerm(v.person, "subs.manage")) {
    return { email: v.person.email, name: v.person.name, role: "member", can: { manage: true, award: hasPerm(v.person, "subs.award") } };
  }
  return null;
}

export async function subsSeatForRequest(request: NextRequest): Promise<SubsSeat | null> {
  const who = await authorizeOps(request);
  if (who?.via === "token") return { email: who.actor, name: who.actor, role: "agent", can: { manage: false, award: false } };
  if (who) return staffSeat(who.actor);
  const person = await requireCrew().catch(() => null);
  if (person && hasPerm(person, "subs.manage")) {
    return { email: person.email, name: person.name, role: "member", can: { manage: true, award: hasPerm(person, "subs.award") } };
  }
  return null;
}

export type SubsGate = { who: OpsActor; seat: SubsSeat; response?: undefined } | { who?: undefined; seat?: undefined; response: NextResponse };

export async function subsGate(request: NextRequest, need: SubsNeed = "view"): Promise<SubsGate> {
  let seat: SubsSeat | null;
  try {
    seat = await subsSeatForRequest(request);
  } catch (err) {
    console.error("subs access:", err);
    return { response: NextResponse.json({ ok: false, error: "unavailable" }, { status: 503 }) };
  }
  if (!seat) return { response: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }) };
  if (need !== "view" && !seat.can[need]) {
    return { response: NextResponse.json({ ok: false, error: need === "award" ? "an owner awards this" : "a person with the subs switch does this" }, { status: 403 }) };
  }
  const who: OpsActor = { actor: seat.role === "member" ? `crew: ${seat.email}` : seat.email, via: seat.role === "agent" ? "token" : "session" };
  return { who, seat };
}

export class SubsError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404 | 409 | 410 = 400,
  ) {
    super(message);
  }
}

export function subsError(err: unknown, what: string): NextResponse {
  if (err instanceof SubsError) return NextResponse.json({ ok: false, error: err.message }, { status: err.status });
  console.error(`${what}:`, err);
  return NextResponse.json({ ok: false, error: `could not ${what}` }, { status: 500 });
}
