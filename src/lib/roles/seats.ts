// Roles and who holds them (migration 0032), and the decision rights that go
// with them, read from Company policies so no limit lives in two places.
// The pure parts are client-safe; loadSeats reads the database.

import { OWNER_CALLS_DAY } from "@/lib/billing/ladder";
import type { BotPeople } from "@/lib/bot/types";

export const ROLES = ["decisions", "sales", "finance", "ops", "pm", "field_lead"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_INFO: Record<Role, { label: string; department: string; lane: string | null }> = {
  decisions: { label: "Owner decisions", department: "Owner", lane: "decisions" },
  sales: { label: "Estimating and sales admin", department: "Sales", lane: "sales" },
  finance: { label: "Finance and admin", department: "Finance", lane: "money" },
  ops: { label: "Ops and systems", department: "Ops", lane: "systems" },
  pm: { label: "Project manager", department: "Project management", lane: null },
  field_lead: { label: "Field lead", department: "Field", lane: null },
};

export type Seat = { role: Role; holder: string; backup: string; note: string; updatedBy: string; updatedAt: string | null };

/** The seats as decided 2026-10-12 (lanes) and in the operating model; used until 0032 reaches a database. */
export const DEFAULT_SEATS: Seat[] = [
  { role: "decisions", holder: "Marco", backup: "Lando", note: "", updatedBy: "setup", updatedAt: null },
  { role: "sales", holder: "Marco", backup: "Lando", note: "Covers the open Estimating & Sales Admin seat.", updatedBy: "setup", updatedAt: null },
  { role: "finance", holder: "Ilene", backup: "Lando", note: "", updatedBy: "setup", updatedAt: null },
  { role: "ops", holder: "Lando", backup: "Marco", note: "", updatedBy: "setup", updatedAt: null },
  { role: "pm", holder: "Eli", backup: "Marco", note: "", updatedBy: "setup", updatedAt: null },
  { role: "field_lead", holder: "", backup: "Eli", note: "Not designed yet: the PM covers.", updatedBy: "setup", updatedAt: null },
];

export type Person = { email: string; name: string; owner: boolean };

/** Owners from the bot seats, plus crew seats (PMs, leads) by email. */
export function peopleOf(botPeople: BotPeople, crew: { email: string; name: string | null }[]): Person[] {
  const out: Person[] = Object.entries(botPeople).map(([email, p]) => ({ email, name: p.name, owner: p.role === "owner" }));
  for (const c of crew) if (!out.some((p) => p.email === c.email)) out.push({ email: c.email, name: c.name || c.email, owner: false });
  return out;
}

function first(name: string): string {
  return name.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
}

/** The addresses a seat value names: an email, or every seat of the person with that first name (owners first). */
export function resolveName(value: string, people: Person[]): Person[] {
  const v = value.trim().toLowerCase();
  if (!v) return [];
  if (v.includes("@")) return people.filter((p) => p.email.toLowerCase() === v);
  const hits = people.filter((p) => first(p.name) === v);
  const owners = hits.filter((p) => p.owner);
  return owners.length ? owners : hits;
}

/** Who answers for a role right now: its holder, else its backup, else the owners. Never nobody. */
export function seatHolder(role: Role, seats: Seat[], people: Person[]): { name: string; emails: string[]; covering: boolean } {
  const seat = seats.find((s) => s.role === role) ?? DEFAULT_SEATS.find((s) => s.role === role)!;
  const h = resolveName(seat.holder, people);
  if (h.length) return { name: h[0].name.split(/\s+/)[0], emails: h.map((p) => p.email), covering: false };
  const b = resolveName(seat.backup, people);
  if (b.length) return { name: b[0].name.split(/\s+/)[0], emails: b.map((p) => p.email), covering: true };
  const owners = people.filter((p) => p.owner);
  return { name: "the owners", emails: owners.map((p) => p.email), covering: true };
}

/** The role an overdue item moves up to (SOP escalation: PM → owner decisions; everyone else → decisions; decisions → ops backup). */
export function escalationOf(role: Role): Role {
  if (role === "field_lead") return "pm";
  if (role === "decisions") return "ops";
  return "decisions";
}

// ---- decision rights, read from Company policies --------------------------------

export type Right = { action: string; role: Role; upToCents: number | null; condition: string; policyKey: string | null };

/** Who decides what, from the policy values (cents). Edit the limits in Company policies. */
export function decisionRights(p: Record<string, unknown>): Right[] {
  const n = (k: string, d: number) => (typeof p[k] === "number" ? (p[k] as number) : d);
  const pmBuy = n("requests.pmLimitCents", 50_000);
  const tell = n("requests.ownerLimitCents", 100_000);
  const pmAward = n("policy.subs.pmAwardLimitCents", 1_000_000);
  const coFrom = n("policy.extras.coFromCents", 100_000);
  return [
    { action: "Approve a material request", role: "pm", upToCents: pmBuy, condition: "on their jobs", policyKey: "requests.pmLimitCents" },
    { action: "Approve a material request", role: "decisions", upToCents: null, condition: `both owners told above ${(tell / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}`, policyKey: "requests.ownerLimitCents" },
    { action: "Award sub work", role: "pm", upToCents: pmAward, condition: "approved sub, inside budget", policyKey: "policy.subs.pmAwardLimitCents" },
    { action: "Award sub work", role: "decisions", upToCents: null, condition: "anything else", policyKey: null },
    { action: "Do extra work without a signed change order", role: "pm", upToCents: coFrom, condition: "logged on the minor-extras list, billed next invoice", policyKey: "policy.extras.coFromCents" },
    { action: "Price and approve a change order", role: "decisions", upToCents: null, condition: "the PM never quotes a price", policyKey: null },
    { action: "Send an invoice or anything a client sees", role: "decisions", upToCents: null, condition: "finance prepares it", policyKey: null },
    { action: "Record or void a payment", role: "decisions", upToCents: null, condition: "owners only (decision 3, 10/19)", policyKey: null },
    { action: "Run the collection ladder", role: "finance", upToCents: null, condition: `until day ${OWNER_CALLS_DAY} late; then the owner calls`, policyKey: "policy.ladder.reminders" },
    { action: "Pay a sub bill", role: "finance", upToCents: null, condition: "approved by the job's PM, conditional waiver in hand", policyKey: null },
    { action: "Move the schedule inside the week", role: "pm", upToCents: null, condition: "no milestone slips", policyKey: null },
    { action: "Pay rates, seats, groups and policies", role: "decisions", upToCents: null, condition: "owners only", policyKey: null },
  ];
}
