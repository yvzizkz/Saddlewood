import type { NextRequest } from "next/server";

import { whoIs } from "@/lib/bot/home";
import { readState } from "@/lib/bot/queries";
import { getViewer, requireCrew } from "@/lib/crew/auth";
import { hasPerm } from "@/lib/crew/types";
import { authorizeOps } from "@/lib/ops/auth";
import type { SalesSettings } from "./settings";

// Who is working Sales, and what they may do. One answer for the pages, the
// routes and the screens, so a button is never shown that the server refuses.
//
//   owner              everything, and the only one who edits Settings or opens a job
//   office staff       (allowlisted, not an owner) the pipeline and estimates; send,
//                      issue and countersign when Settings say "owners and sales"
//   a crew seat        with "sales.view": the same as office staff; with
//                      "sales.send" too: may send and countersign when Settings allow
//   the Mac's token    read and track only (bid invites, the call list)
//
// Settings decide the "when Settings allow": email.whoMaySend for issuing and
// emailing, signing.companySigners for countersigning.

export type SalesSeat = {
  email: string;
  name: string;
  role: "owner" | "staff" | "member" | "agent";
  can: { send: boolean; sign: boolean; openJob: boolean; editSettings: boolean; markWonLost: boolean };
};

function decide(role: SalesSeat["role"], sendSwitch: boolean, s: Pick<SalesSettings, "email" | "signing">): SalesSeat["can"] {
  if (role === "owner") return { send: true, sign: true, openJob: true, editSettings: true, markWonLost: true };
  if (role === "agent") return { send: false, sign: false, openJob: false, editSettings: false, markWonLost: false };
  const sales = role === "staff" || sendSwitch;
  return {
    send: sales && s.email.whoMaySend === "owners_and_sales",
    sign: sales && s.signing.companySigners === "owners_and_sales",
    openJob: false,
    editSettings: false,
    markWonLost: true,
  };
}

export function seatCan(role: SalesSeat["role"], sendSwitch: boolean, s: Pick<SalesSettings, "email" | "signing">): SalesSeat["can"] {
  return decide(role, sendSwitch, s);
}

async function staffSeat(email: string, settings: Pick<SalesSettings, "email" | "signing">): Promise<SalesSeat> {
  let role: SalesSeat["role"] = "staff";
  let name = email.split("@")[0];
  const { sections } = await readState();
  const me = whoIs(email, sections.people);
  if (me.role === "owner") role = "owner";
  if (me.name) name = me.name;
  return { email, name, role, can: decide(role, false, settings) };
}

/** For a page: the signed-in person's Sales seat, or null when Sales is not theirs. */
export async function salesSeatForPage(settings: Pick<SalesSettings, "email" | "signing">): Promise<SalesSeat | null> {
  const v = await getViewer();
  if (v.kind === "staff") return staffSeat(v.email, settings);
  if (v.kind === "crew" && hasPerm(v.person, "sales.view")) {
    const send = hasPerm(v.person, "sales.send");
    return { email: v.person.email, name: v.person.name, role: "member", can: decide("member", send, settings) };
  }
  return null;
}

/** For a route: the caller's Sales seat (the agent token included), or null. */
export async function salesSeatForRequest(request: NextRequest, settings: Pick<SalesSettings, "email" | "signing">): Promise<SalesSeat | null> {
  const who = await authorizeOps(request);
  if (who?.via === "token") return { email: who.actor, name: who.actor, role: "agent", can: decide("agent", false, settings) };
  if (who) return staffSeat(who.actor, settings);
  const person = await requireCrew().catch(() => null);
  if (person && hasPerm(person, "sales.view")) {
    return { email: person.email, name: person.name, role: "member", can: decide("member", hasPerm(person, "sales.send"), settings) };
  }
  return null;
}
