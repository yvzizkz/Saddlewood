// One person's part of the task feed (feed.ts), the way Tasks shows it under
// Mine, and the short of it: what is overdue, due today and moved up to them,
// oldest first. The 7 AM push (owner/morning.ts) and Home's "Your tasks"
// (/api/tasks/mine) both read it, so the three never disagree. Pure.

import type { JobRef } from "@/lib/jobs/hub";
import type { JobScope } from "@/lib/crew/scope";
import type { Person, Seat } from "@/lib/roles/seats";
import { feedForSeat, isMine, type FeedItem } from "./feed";

/** Whose list: an owner sees the whole feed; anyone else the jobs in `jobs` (URL keys). */
export type FeedSeat = { email: string; owner: boolean; jobs: Set<string> };

/** The URL keys of the jobs a field scope covers (crew/scope.ts): every job for null. */
export function jobsOf(refs: Pick<JobRef, "key" | "crewId">[], scope: JobScope): Set<string> {
  return new Set(refs.filter((r) => scope === null || (!!r.crewId && scope.includes(r.crewId))).map((r) => r.key));
}

/** Tasks' Mine for this seat. */
export function mineOf(feed: FeedItem[], seat: FeedSeat, seats: Seat[], people: Person[]): FeedItem[] {
  const mine = (i: FeedItem) => isMine(i, seat.email, seats, people);
  return feedForSeat(feed, seat.owner ? null : seat.jobs, mine).filter(mine);
}

/** Overdue first by days late, then what falls due soonest, then what has waited longest. */
export function byAge(a: FeedItem, b: FeedItem): number {
  return b.overdueDays - a.overdueDays || (a.dueOn ?? "9").localeCompare(b.dueOn ?? "9") || (a.since ?? "9").localeCompare(b.since ?? "9");
}

export type Lead = { count: number; overdue: number; dueToday: number; movedUp: number; oldest: FeedItem | null };

export function leadOf(items: FeedItem[], day: string): Lead {
  return {
    count: items.length,
    overdue: items.filter((i) => !!i.dueOn && i.dueOn < day).length,
    dueToday: items.filter((i) => i.dueOn === day).length,
    movedUp: items.filter((i) => i.escalated).length,
    oldest: [...items].sort(byAge)[0] ?? null,
  };
}

/** "2 overdue, 1 due today, 1 moved up to you" */
export function leadCounts(lead: Lead): string[] {
  return [lead.overdue ? `${lead.overdue} overdue` : "", lead.dueToday ? `${lead.dueToday} due today` : "", lead.movedUp ? `${lead.movedUp} moved up to you` : ""].filter(Boolean);
}

export type MineRow = Pick<FeedItem, "id" | "title" | "job" | "dueOn" | "overdueDays" | "escalated" | "href">;

export type MineSummary = Omit<Lead, "oldest"> & { top: MineRow[] };

/**
 * What Home's "Your tasks" shows: the counts over all of Mine, and the oldest
 * few of what Home does not already list (`shown`: an owner's Waiting on you,
 * a crew seat's own crew tasks).
 */
export function summaryOf(items: FeedItem[], day: string, shown: (i: FeedItem) => boolean, n = 3): MineSummary {
  const { count, overdue, dueToday, movedUp } = leadOf(items, day);
  const top = items
    .filter((i) => !shown(i))
    .sort(byAge)
    .slice(0, n)
    .map(({ id, title, job, dueOn, overdueDays, escalated, href }) => ({ id, title, job, dueOn, overdueDays, escalated, href }));
  return { count, overdue, dueToday, movedUp, top };
}
