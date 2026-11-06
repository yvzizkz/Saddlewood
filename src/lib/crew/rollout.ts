import { addDays, localDay } from "./time";

// Who's actually on the app (the January move): for each person, when they last
// opened it, clocked in and logged the day. Pure; rolloutStore.ts feeds it.

export type RolloutPerson = { name: string; seat: string; hasPhone: boolean; lastSeenAt: string | null; emails: string[]; field: boolean };
export type RolloutMark = { email: string; day: string };

export type RolloutStanding = "Using it" | "Opened it" | "Not yet";

export type RolloutRow = {
  name: string;
  seat: string;
  hasPhone: boolean;
  field: boolean;
  lastSeenOn: string | null;
  lastClockOn: string | null;
  clocksThisWeek: number;
  lastLogOn: string | null;
  standing: RolloutStanding;
};

const newest = (days: string[]) => days.reduce<string | null>((a, d) => (!a || d > a ? d : a), null);

/**
 * "Using it": field people clocked in or logged in the last 7 days; office
 * people opened it in the last 7 days. Opening it once isn't using it.
 */
export function rolloutRows(people: RolloutPerson[], clocks: RolloutMark[], logs: RolloutMark[], today: string): RolloutRow[] {
  const since = addDays(today, -6);
  return people.map((p) => {
    const mine = (marks: RolloutMark[]) => marks.filter((m) => p.emails.includes(m.email)).map((m) => m.day);
    const clocked = mine(clocks);
    const logged = mine(logs);
    const lastSeenOn = p.lastSeenAt ? localDay(p.lastSeenAt) : null;
    const clocksThisWeek = clocked.filter((d) => d >= since).length;
    const recent = p.field ? clocksThisWeek > 0 || logged.some((d) => d >= since) : !!lastSeenOn && lastSeenOn >= since;
    return {
      name: p.name,
      seat: p.seat,
      hasPhone: p.hasPhone,
      field: p.field,
      lastSeenOn,
      lastClockOn: newest(clocked),
      clocksThisWeek,
      lastLogOn: newest(logged),
      standing: recent ? "Using it" : lastSeenOn || clocked.length || logged.length ? "Opened it" : "Not yet",
    };
  });
}
