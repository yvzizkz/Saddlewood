import { cache } from "react";
import type { NextRequest } from "next/server";

import { whoIs } from "@/lib/bot/home";
import { readState } from "@/lib/bot/queries";
import { isAllowedEmail, normalizeEmail } from "@/lib/ops/allowlist";
import { authorizeOps } from "@/lib/ops/auth";
import { createClient } from "@/lib/supabase/server";
import { getPerson, type CrewPersonRow } from "./queries";
import { hasCrewRole } from "./role";
import { CAPABILITY_KEYS, hasPerm, type AdminAct, type Capability } from "./types";

// Three kinds of caller on the crew side, and none may stand in for another.
//
// Crew: a session whose Auth user carries the crew mark AND has an active row
// in crew_people. Never an address on the portal allowlist (an owner is not
// crew), and never the agent token: what a person logs is recorded under
// their own name.
//
// An owner: a portal session with an owner's seat (bot/app_allow.json on the
// Mac, as reported in bot_state). Owners manage the crew; nobody else does.
//
// The Mac: OPS_AGENT_TOKEN, on /api/bot/crew only (see src/lib/bot/auth.ts).

/**
 * The crew member behind this request, or null when there is none. Throws when
 * the seat could not be looked up: "the database is having trouble" must not
 * read as "you are signed out", or a phone with a clock-in waiting would drop
 * it and send the person back to the sign-in page.
 */
export async function requireCrew(): Promise<CrewPersonRow | null> {
  let user: { email?: string | null; app_metadata?: Record<string, unknown> } | null = null;
  try {
    const supabase = await createClient();
    user = (await supabase.auth.getUser()).data.user;
  } catch {
    return null; // no cookies in this context
  }
  if (!user || !hasCrewRole(user)) return null;
  const email = normalizeEmail(user.email);
  if (!email || isAllowedEmail(email)) return null;
  const person = await getPerson(email);
  return person && person.active ? person : null;
}

/** For a route: the person, or the response to send instead (401 not crew, 503 could not tell). */
export async function gateCrew(): Promise<{ person: CrewPersonRow; response?: undefined } | { person?: undefined; response: Response }> {
  try {
    const person = await requireCrew();
    if (person) return { person };
    return { response: Response.json({ ok: false, error: "unauthorized" }, { status: 401 }) };
  } catch (e) {
    console.error("[crew/auth]", (e as Error).message);
    return { response: Response.json({ ok: false, error: "unavailable" }, { status: 503 }) };
  }
}

export type Owner = { email: string; name: string };

export async function requireOwner(request: NextRequest): Promise<Owner | null> {
  const who = await authorizeOps(request);
  if (!who || who.via !== "session") return null;
  const { sections } = await readState();
  const me = whoIs(who.actor, sections.people);
  return me.role === "owner" && me.name ? { email: who.actor, name: me.name } : null;
}

/**
 * Who may use the Crew screens: an owner (everything), or a crew seat whose
 * group has the Crew tab switched on. A member is still a crew-marked sign-in,
 * never on the portal allowlist, so the estimate tables stay shut for them.
 * What a member may do is their group's switches (ACT_NEEDS), nothing else.
 */
export type Manager = { role: "owner" | "member"; email: string; name: string; perms: Capability[] };

export async function requireManager(request: NextRequest): Promise<Manager | null> {
  const owner = await requireOwner(request);
  if (owner) return { role: "owner", ...owner, perms: [...CAPABILITY_KEYS] };
  const person = await requireCrew();
  return person && hasPerm(person, "crew.view") ? { role: "member", email: person.email, name: person.name, perms: person.perms } : null;
}

/**
 * The switch each Crew-screen action needs. "owner" is never a switch: seats
 * and groups stay with the owners. job.update is checked again in runAdminAct
 * (renaming or closing a job needs jobs.manage; the promise, address and site
 * note need jobs.promise or jobs.manage).
 */
export const ACT_NEEDS: Record<AdminAct["kind"], Capability | "owner"> = {
  "person.add": "owner",
  "person.update": "owner",
  "person.invite": "owner",
  "person.code": "owner",
  "group.save": "owner",
  "group.delete": "owner",
  "job.add": "jobs.manage",
  "job.update": "jobs.promise",
  "schedule.set": "schedule.edit",
  "schedule.remove": "schedule.edit",
  "schedule.copy": "schedule.edit",
  "task.add": "tasks.assign",
  "task.update": "tasks.assign",
  "task.verify": "tasks.verify",
  "shift.edit": "hours.edit",
  "shift.add": "hours.edit",
  "shift.void": "hours.edit",
  "shift.ok": "hours.edit",
  "fix.decide": "hours.edit",
  "question.ask": "questions.ask",
  "question.cancel": "questions.ask",
  "pickup.add": "pickups.stage",
  "pickup.update": "pickups.stage",
  "report.send": "plan.send",
};

export function mayRun(m: Manager, kind: AdminAct["kind"]): boolean {
  if (m.role === "owner") return true;
  const need = ACT_NEEDS[kind];
  if (need === "owner") return false;
  // Keeping a job current is either switch.
  if (kind === "job.update") return m.perms.includes("jobs.promise") || m.perms.includes("jobs.manage");
  return m.perms.includes(need);
}

export type Viewer =
  | { kind: "anonymous" }
  | { kind: "staff"; email: string }
  | { kind: "crew"; person: CrewPersonRow }
  /** Marked as crew, but the seat could not be looked up just now. Not a reason to sign anyone out. */
  | { kind: "unavailable" }
  /** Signed in, but with no way in: not on the allowlist and not (or no longer) crew. */
  | { kind: "stranger" };

/** Who is looking at /app. One lookup per request, shared by the layout and the page. */
export const getViewer = cache(async (): Promise<Viewer> => {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (!user || error) return { kind: "anonymous" };
  const email = normalizeEmail(user.email);
  if (isAllowedEmail(email)) return { kind: "staff", email };
  if (hasCrewRole(user)) {
    try {
      const person = await getPerson(email);
      if (person && person.active) return { kind: "crew", person };
    } catch {
      return { kind: "unavailable" };
    }
  }
  return { kind: "stranger" };
});
