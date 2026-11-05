import type { MoneyItem } from "./jobMoney";

// What a job carried in from before the app (0064): one figure for everything
// billed and paid in full, through a date. It counts in Billed and Paid and never
// in what's owed: a bill still owed comes in as a real bill, so Receivables and
// the job agree. Pure; jobOpeningStore.ts reads and writes it.

export type JobOpening = {
  settledCents: number;
  /** The last day the figure covers. A bill issued on or before it would count twice. */
  asOf: string;
  /** Where the figure came from, such as "Powell tracker #3526-12". */
  source: string;
  enteredBy: string;
  enteredAt: string;
};

export type OpeningInput = { settledCents: number; asOf: string; source: string; contractCents: number | null };

/** The opening as one fully paid item on the job's money, or null when there's nothing to carry. */
export function openingItem(o: JobOpening | null | undefined): MoneyItem | null {
  if (!o?.settledCents) return null;
  return { number: "Before the app", title: o.source, documentId: "", lineIndex: null, billedCents: o.settledCents, paidCents: o.settledCents, dueOn: null, payWhenPaid: false };
}

/** Why this opening can't be saved, or null. `overlapping` is the job's bills issued on or before the date. */
export function openingProblem(input: OpeningInput, today: string, overlapping: string[]): string | null {
  if (input.asOf > today) return "The date can't be in the future.";
  if (input.contractCents !== null && input.settledCents > input.contractCents) return "That's more than the contract.";
  if (overlapping.length) return `${overlapping.join(", ")} would count twice: already in the app on or before that date. Use an earlier date, or leave them out of the figure and date it before them.`;
  return null;
}
