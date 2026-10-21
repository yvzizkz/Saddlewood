// The Saddlewood standard for past dues (SOP-007 §5; spec §4.3), as data.
// Days are relative to the due date. Negative is before. The company default
// lives here; a client's billing profile or a job may move the timing later.

import { addDays as addDayCount, localDay } from "@/lib/crew/time";
import type { BillingProfile } from "./types";

export type LadderStep = {
  day: number;
  label: string;
  who: "automatic" | "ilene" | "marco";
};

export const LADDER: LadderStep[] = [
  { day: -3, label: "Heads-up", who: "automatic" },
  { day: 1, label: "Past-due notice", who: "automatic" },
  { day: 7, label: "Second notice, PM copied; Ilene calls", who: "automatic" },
  { day: 14, label: "Marco calls; 5-day notice", who: "marco" },
  { day: 21, label: "Suspension or prompt-payment letter", who: "marco" },
  { day: 30, label: "Attorney; lien calendar", who: "marco" },
];

/** The day late the owner takes the calls over: the ladder's first step that is Marco's. */
export const OWNER_CALLS_DAY = LADDER.find((s) => s.who === "marco")?.day ?? 14;

/** Days a document should have been viewed within, before a resend. */
export const VIEW_WITHIN_BUSINESS_DAYS = 2;

const DAY = 24 * 60 * 60 * 1000;

/**
 * The Phoenix calendar day a date or timestamp names. A bare YYYY-MM-DD is
 * already a day; a timestamp is read in Phoenix time, so a bill sent at 6 PM
 * belongs to that day and not to tomorrow's UTC date.
 */
export function dayOf(dateOrAt: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateOrAt) ? dateOrAt : localDay(dateOrAt);
}

function dayAt(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T12:00:00Z`);
}

/** A day plus some days; `iso` may be a timestamp, its date part is used. */
function addDays(iso: string, days: number): string {
  return addDayCount(iso.slice(0, 10), days);
}

/** Whole days from `from` to `to` (calendar days, Phoenix has no daylight time). */
export function daysBetween(from: string, to: string): number {
  return Math.round((dayAt(to).getTime() - dayAt(from).getTime()) / DAY);
}

export function addBusinessDays(iso: string, days: number): string {
  let d = dayAt(iso);
  let left = days;
  while (left > 0) {
    d = new Date(d.getTime() + DAY);
    const w = d.getUTCDay();
    if (w !== 0 && w !== 6) left -= 1;
  }
  return d.toISOString().slice(0, 10);
}

/** Pay-when-paid (BillingProfile.payWhenPaidDays). The job's own setting, when it has one, wins over the client's. */
export function isPayWhenPaid(client?: BillingProfile | null, job?: BillingProfile | null): boolean {
  const own = job && "payWhenPaidDays" in job ? job.payWhenPaidDays : client?.payWhenPaidDays;
  return typeof own === "number" && own >= 0;
}

/**
 * The day the ladder counts from: the due date; for a bill with none (a
 * statement of old invoices), the day it was first sent. A pay-when-paid bill
 * with no due date has no clock: we are not owed it until their client pays
 * them, so nothing chases it until an owner sets a due date.
 */
export function ladderClock(dueDate: string | null, firstSentAt: string | null, payWhenPaid: boolean): string | null {
  if (dueDate) return dueDate.slice(0, 10);
  if (payWhenPaid || !firstSentAt) return null;
  return dayOf(firstSentAt);
}

export type NextStep = { on: string; label: string; who: LadderStep["who"]; daysLate: number } | null;

/**
 * Where an open document stands on the ladder today. `clock` is the day the
 * ladder counts from: the due date, or for an old invoice that entered the
 * app late, the day of its first notice (spec §4.3).
 */
export function nextStep(clock: string, today: string): NextStep {
  const late = daysBetween(clock, today);
  for (const s of LADDER) {
    if (s.day > late) return { on: addDays(clock, s.day), label: s.label, who: s.who, daysLate: late };
  }
  const last = LADDER[LADDER.length - 1];
  return { on: addDays(clock, last.day), label: last.label, who: last.who, daysLate: late };
}
