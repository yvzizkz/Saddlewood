import { parseMoney } from "@/lib/trackers/core";
import type { TrackerState } from "@/lib/trackers/types";

// A schedule of values for a job that started before the app: an owner pastes it
// from a spreadsheet or fills it from the job's progress tracker, each line with
// what's been billed on it so far. Billed is kept in cents, not a percent, so
// the schedule adds up to the penny with the tracker it came from. Pure.

export type ScheduleEntryLine = { description: string; amountCents: number; billedCents: number };

const cents = (dollars: number) => Math.round(dollars * 100);

/** The tracker's lines as of now: billed is everything invoiced so far, this invoice and any draw included. A line with no money yet is left out. */
export function trackerSchedule(state: Pick<TrackerState, "lines">): ScheduleEntryLine[] {
  return state.lines
    .map((l) => ({ description: l.name, amountCents: cents(l.contract + l.changeOrder), billedCents: cents(l.completedPrior + l.thisInvoice + l.draw) }))
    .filter((l) => l.amountCents !== 0 || l.billedCents !== 0);
}

/** Rows of "description, amount, billed to date", tab-separated (a spreadsheet paste) or split with |. Billed may be blank. A header row is skipped. */
export function parseSchedule(text: string): { lines: ScheduleEntryLine[]; errors: string[] } {
  const lines: ScheduleEntryLine[] = [];
  const errors: string[] = [];
  text
    .split(/\r?\n/)
    .filter((row) => row.trim())
    .forEach((row, i) => {
      const [description = "", amount = "", billed = ""] = row.split(/\t|\|/).map((c) => c.trim());
      const a = parseMoney(amount);
      const b = parseMoney(billed);
      if (i === 0 && Number.isNaN(a)) return;
      if (!description || !amount || Number.isNaN(a) || Number.isNaN(b)) {
        errors.push(`Row ${i + 1}: needs a description, an amount and what's billed, split by tabs or |.`);
        return;
      }
      if (a !== 0 || b !== 0) lines.push({ description, amountCents: cents(a), billedCents: cents(b) });
    });
  return { lines, errors };
}

/** What's wrong with these lines, or null. */
export function scheduleProblem(lines: ScheduleEntryLine[]): string | null {
  if (!lines.length) return "Add at least one line.";
  for (const l of lines) {
    if (!l.description.trim()) return "Every line needs a description.";
    if (l.amountCents <= 0) return `${l.description}: the amount has to be more than $0. Net a credit into its line.`;
    if (l.billedCents < 0 || l.billedCents > l.amountCents) return `${l.description}: billed has to be between $0 and the line's amount.`;
  }
  return null;
}
