import type { BotPeople } from "@/lib/bot/types";

// Whose phone and whose "Waiting on you" an item lands on first. Every owner
// can still open everything; a lane only decides who is asked. Owner decision
// 2026-10-12 (Marco's seat, draft 1): Marco sells, prices and decides what is
// over a threshold; Ilene runs payments and payroll; Lando runs the app and
// the bot and backs Marco up.
//
// A lane names a person, not an address: one person can hold two seats
// (lando@ and info@ are both Lando). When the person has no owner seat in the
// app, the lane falls to its backup, and with neither, to every owner, so an
// alert is never dropped because a seat is missing.

export const LANES = ["sales", "decisions", "money", "systems"] as const;
export type Lane = (typeof LANES)[number];

export const LANE_INFO: Record<Lane, { label: string; primary: string; backup: string }> = {
  sales: { label: "Sales and bids", primary: "Marco", backup: "Lando" },
  decisions: { label: "Decisions and escalations", primary: "Marco", backup: "Lando" },
  money: { label: "Payments and payroll", primary: "Ilene", backup: "Lando" },
  systems: { label: "The app and the bot", primary: "Lando", backup: "Marco" },
};

/**
 * Who holds each lane when the role seats (0032, /app/policies/rights) say
 * otherwise: a first name or an email per lane. Without it, LANE_INFO.
 */
export type LaneSeats = Partial<Record<Lane, { primary: string; backup: string }>>;

function firstWord(name: string): string {
  return name.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
}

function ownerSeats(people: BotPeople, name: string): string[] {
  const want = name.trim().toLowerCase();
  if (!want) return [];
  return Object.entries(people)
    .filter(([email, p]) => p.role === "owner" && (want.includes("@") ? email.toLowerCase() === want : firstWord(p.name) === want))
    .map(([email]) => email)
    .sort();
}

/** Who holds a lane right now: the person's name and their owner seats. */
export function laneHolder(lane: Lane, people: BotPeople, seats?: LaneSeats): { name: string; emails: string[]; backup: boolean } {
  const { primary, backup } = seats?.[lane] ?? LANE_INFO[lane];
  const nameOf = (v: string, emails: string[]) => (v.includes("@") ? (people[emails[0]]?.name.split(/\s+/)[0] ?? v) : v);
  const first = ownerSeats(people, primary);
  if (first.length) return { name: nameOf(primary, first), emails: first, backup: false };
  const second = ownerSeats(people, backup);
  if (second.length) return { name: nameOf(backup, second), emails: second, backup: true };
  const all = Object.entries(people)
    .filter(([, p]) => p.role === "owner")
    .map(([email]) => email)
    .sort();
  return { name: "the owners", emails: all, backup: true };
}

/** The addresses to alert for a lane. */
export function laneOwners(lane: Lane, people: BotPeople, seats?: LaneSeats): string[] {
  return laneHolder(lane, people, seats).emails;
}

/** The lanes this address holds right now. */
export function lanesOf(email: string, people: BotPeople, seats?: LaneSeats): Lane[] {
  return LANES.filter((lane) => laneHolder(lane, people, seats).emails.includes(email));
}

/** For the screen: who holds each lane, by first name. */
export function laneNames(people: BotPeople, seats?: LaneSeats): Record<Lane, { name: string; backup: boolean }> {
  return Object.fromEntries(
    LANES.map((lane) => {
      const h = laneHolder(lane, people, seats);
      return [lane, { name: h.name, backup: h.backup }];
    }),
  ) as Record<Lane, { name: string; backup: boolean }>;
}
