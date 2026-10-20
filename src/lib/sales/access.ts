import { NextResponse, type NextRequest } from "next/server";

import type { OpsActor } from "@/lib/ops/auth";
import { salesSeatForRequest, type SalesSeat } from "./seat";
import type { SalesSettings } from "./settings";
import { loadSettings } from "./settingsStore";
import { SalesError } from "./store";

// Who may do what in Sales (seat.ts decides; this turns it into an answer
// for a route).
//
//   view        anyone with a Sales seat, and the Mac's token (track bids, read)
//   person      a signed-in person, never the token (editing estimates)
//   send        issue a proposal (it becomes a client link) and email it
//   sign        countersign for Saddlewood
//   openJob     award the job a won proposal becomes, and keep its paperwork (owners)
//   editSettings  change Sales settings (owners)
//
// Issuing is guarded because a link sent is a price given: "Nothing goes to a
// client's owner or principal without Marco" (app spec §0) unless the owners
// widen it in Settings.

export type SalesNeed = "view" | "person" | "send" | "sign" | "openJob" | "editSettings" | "markWonLost";

export type SalesGate =
  | { who: OpsActor; seat: SalesSeat; settings: SalesSettings; response?: undefined }
  | { who?: undefined; seat?: undefined; settings?: undefined; response: NextResponse };

const REFUSAL: Record<Exclude<SalesNeed, "view">, string> = {
  person: "a person must do this, signed in",
  send: "the owners send proposals (Sales settings can widen it)",
  sign: "the owners countersign (Sales settings can widen it)",
  openJob: "an owner opens the job",
  editSettings: "only an owner changes Sales settings",
  markWonLost: "a person marks it won or lost",
};

export async function salesGate(request: NextRequest, need: SalesNeed = "view"): Promise<SalesGate> {
  const settings = await loadSettings();
  let seat: SalesSeat | null;
  try {
    seat = await salesSeatForRequest(request, settings);
  } catch (err) {
    console.error("sales access:", err);
    return { response: NextResponse.json({ ok: false, error: "unavailable" }, { status: 503 }) };
  }
  if (!seat) return { response: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }) };
  const ok = need === "view" ? true : need === "person" ? seat.role !== "agent" : seat.can[need];
  if (!ok) return { response: NextResponse.json({ ok: false, error: REFUSAL[need as Exclude<SalesNeed, "view">] }, { status: 403 }) };
  const who: OpsActor = { actor: seat.role === "member" ? `crew: ${seat.email}` : seat.email, via: seat.role === "agent" ? "token" : "session" };
  return { who, seat, settings };
}

/** The pipeline routes' gate: any seat; `allowToken: false` keeps the agent out. */
export async function authorizeSales(request: NextRequest, opts: { allowToken: boolean } = { allowToken: true }): Promise<SalesGate> {
  return salesGate(request, opts.allowToken ? "view" : "person");
}

export function salesError(err: unknown, what: string): NextResponse {
  if (err instanceof SalesError) return NextResponse.json({ ok: false, error: err.message }, { status: err.status });
  console.error(`${what}:`, err);
  return NextResponse.json({ ok: false, error: `could not ${what}` }, { status: 500 });
}

/** Today in Phoenix, YYYY-MM-DD. */
export function phoenixToday(now: Date = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: "America/Phoenix" });
}
