import type { BotPeople } from "@/lib/bot/types";
import type { AnswersFirst } from "./settings";
import type { CrewJobPerson, CrewRequest } from "./types";

// The rules of a material request (migration 0023), pure and client-safe:
// who may decide it, whose list it lands on, and how it reads. The server
// (requests.ts), "Waiting on you" (src/lib/owner/waiting.ts), the 7 AM push
// and the screens all share these, so they agree.

export type Decider = { role: "owner" | "member"; email: string; perms: readonly string[] };
export type Decision = "approve" | "deny" | "talk";

export type DecideRule =
  /** `overLimit`: a member said yes to more than the PM limit, so it goes up to the owners instead of being approved. */
  | { ok: true; overLimit: boolean }
  | { ok: false; status: number; error: string };

export const OWN_REQUEST = "Someone else decides your own request: Marco or Lando will.";
export const NO_SWITCH = "Deciding material requests needs the requests switch. Marco or Lando can turn it on.";

/** "$412", "$1,250", "$19.50" */
export function dollars(cents: number): string {
  const whole = cents % 100 === 0;
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`;
}

/**
 * May this person give this answer to this request? Owners decide anything.
 * A member needs the switch, may never decide their own, may "talk" about
 * anything, and may approve or deny only at or under the PM limit; a yes
 * above it is handed up to the owners (overLimit) rather than refused, so the
 * number they put on it is kept.
 */
export function decideRule(
  who: Decider,
  r: Pick<CrewRequest, "askedBy" | "estCents" | "status">,
  decision: Decision,
  estCents: number | null | undefined,
  pmLimitCents: number,
): DecideRule {
  if (r.status !== "asked") return { ok: false, status: 409, error: `That request was already ${r.status}.` };
  const est = estCents ?? r.estCents;
  if (who.role === "owner") {
    if (decision === "approve" && est === null) return { ok: false, status: 400, error: "Put a number on it first (the estimate), or answer Talk to me." };
    return { ok: true, overLimit: false };
  }
  if (!who.perms.includes("requests.approve")) return { ok: false, status: 403, error: NO_SWITCH };
  if (r.askedBy === who.email) return { ok: false, status: 403, error: OWN_REQUEST };
  if (decision === "talk") return { ok: true, overLimit: false };
  if (decision === "deny") {
    if (est !== null && est > pmLimitCents) return { ok: false, status: 403, error: `Over your limit (${dollars(pmLimitCents)}): Marco or Lando decides this one.` };
    return { ok: true, overLimit: false };
  }
  if (est === null) return { ok: false, status: 400, error: "Put a number on it first (the estimate), or answer Talk to me." };
  return { ok: true, overLimit: est > pmLimitCents };
}

/** The project managers on a job, other than the asker (a PM never decides their own). */
export function pmsOnJob(r: Pick<CrewRequest, "jobId" | "askedBy">, jobPeople: readonly CrewJobPerson[]): string[] {
  if (!r.jobId) return [];
  return jobPeople.filter((a) => a.jobId === r.jobId && a.role === "pm" && a.email !== r.askedBy).map((a) => a.email);
}

/**
 * Whether an open request is the owners' to decide: nobody else can (no PM on
 * the job), or it is over the PM limit. Under the limit with a PM on the job,
 * it is the PM's, and the owners are not nagged about it.
 */
export function ownersDecide(r: Pick<CrewRequest, "status" | "jobId" | "askedBy" | "estCents">, jobPeople: readonly CrewJobPerson[], pmLimitCents: number): boolean {
  if (r.status !== "asked") return false;
  if (!pmsOnJob(r, jobPeople).length) return true;
  return r.estCents !== null && r.estCents > pmLimitCents;
}

/** Whether an open request waits on this project manager: not their own, and not over the limit. */
export function pmDecides(r: Pick<CrewRequest, "status" | "askedBy" | "estCents">, pmEmail: string, pmLimitCents: number): boolean {
  return r.status === "asked" && r.askedBy !== pmEmail && (r.estCents === null || r.estCents <= pmLimitCents);
}

/** The owner seats a request for the owners goes to first (requests.answersFirst): by first name, or everyone. */
export function ownersFirst(people: BotPeople, first: AnswersFirst): string[] {
  const owners = Object.entries(people).filter(([, p]) => p.role === "owner");
  const all = owners.map(([email]) => email).sort();
  if (first === "either") return all;
  const named = owners.filter(([, p]) => (p.name.trim().split(/\s+/)[0] ?? "").toLowerCase() === first).map(([email]) => email).sort();
  return named.length ? named : all;
}

/** "20 hojas de OSB 5/8 (20) · est $412" */
export function requestDetail(r: Pick<CrewRequest, "items" | "qty" | "estCents">): string {
  return [`${r.items}${r.qty ? ` (${r.qty})` : ""}`, r.estCents !== null ? `est ${dollars(r.estCents)}` : ""].filter(Boolean).join(" · ");
}

/** "Material request · Omar · 6402 E Bambi" */
export function requestTitle(r: Pick<CrewRequest, "jobName">, askerFirst: string): string {
  return ["Material request", askerFirst, r.jobName].filter(Boolean).join(" · ");
}

/** For the owners' and the PM's screens (English). The worker's own words are in src/components/crew/strings.ts. */
export const REQUEST_STATUS: Record<CrewRequest["status"], { label: string; tone: "ok" | "bad" | "warn" | "quiet" }> = {
  asked: { label: "Waiting", tone: "warn" },
  approved: { label: "Approved: order it", tone: "ok" },
  denied: { label: "Not approved", tone: "bad" },
  ordered: { label: "Ordered", tone: "quiet" },
  picked: { label: "Picked up", tone: "quiet" },
  delivered: { label: "Delivered", tone: "ok" },
  cancelled: { label: "Cancelled", tone: "quiet" },
};
