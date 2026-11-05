import { addDays } from "@/lib/crew/time";

// The Wednesday payroll run (Finance & Admin). Employees go to the accountant by
// hours; everyone else by a dollar amount, most of them not from a clock (KB
// #435038, #455577): a weekly figure, a company with a W-9, a piece of work. So a
// line is whatever Finance says it is. The clock only fills in what it knows, and
// the next run starts from the last one. Pure.

export type RunLine = { name: string; kind: "employee" | "sub"; hours: number | null; amountCents: number | null; note: string };

/** What the clock knows about a person for the pay week. */
export type Clocked = { name: string; hours: number; costCents: number | null };

/** The Friday a run on this day pays: this one, or today if it's Friday. */
export function payDateFor(today: string): string {
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  return addDays(today, (5 - weekday + 7) % 7);
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * A new run: last run's people with the amounts they had, each employee's hours
 * from the clock when it has any, and a sub on an hourly rate at hours times rate.
 * Anyone the clock has who wasn't on the last run is added.
 */
export function startLines(previous: RunLine[], clocked: Clocked[]): RunLine[] {
  const byName = new Map(clocked.map((c) => [c.name, c]));
  const lines = previous.map((l): RunLine => {
    const c = byName.get(l.name);
    if (l.kind === "employee") return { ...l, hours: c ? round2(c.hours) : null, note: "" };
    return { ...l, amountCents: c?.costCents ?? l.amountCents, note: "" };
  });
  const known = new Set(previous.map((l) => l.name));
  for (const c of clocked) {
    if (!known.has(c.name)) lines.push({ name: c.name, kind: "sub", hours: null, amountCents: c.costCents, note: "" });
  }
  return lines;
}

/** Why this run can't be saved, or null. */
export function runProblem(lines: RunLine[]): string | null {
  if (!lines.length) return "Add at least one person.";
  const seen = new Set<string>();
  for (const l of lines) {
    const name = l.name.trim();
    if (!name) return "Every line needs a name.";
    if (seen.has(name.toLowerCase())) return `${name} is on the run twice.`;
    seen.add(name.toLowerCase());
    if (l.kind === "employee" && !((l.hours ?? 0) > 0)) return `${name}: fill in the hours, or take them off this run.`;
    if (l.kind === "sub" && !((l.amountCents ?? 0) > 0)) return `${name}: fill in the amount, or take them off this run.`;
  }
  return null;
}

const dollars = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;

/** "Payroll 10/23/26", the subject the accountant already knows. */
export function runSubject(payDate: string): string {
  const [y, m, d] = payDate.split("-");
  return `Payroll ${Number(m)}/${Number(d)}/${y.slice(2)}`;
}

/** The email to the accountant, in the shape Finance has always sent it. */
export function runEmail(lines: RunLine[], signer: string): string {
  const note = (l: RunLine) => (l.note.trim() ? ` (${l.note.trim()})` : "");
  const employees = lines.filter((l) => l.kind === "employee").map((l) => `${l.name}: ${l.hours} hours${note(l)}`);
  const subs = lines.filter((l) => l.kind === "sub").map((l) => `${l.name}: ${dollars(l.amountCents ?? 0)}${note(l)}`);
  return [...(employees.length ? ["Employees:", ...employees] : []), ...(subs.length ? ["Subs:", ...subs] : []), "Thank you", ...(signer ? [signer] : [])].join("\n");
}

/** A payroll email pasted in, to start the first run from. Lines that aren't a name and a figure are left out. */
export function parseRunEmail(text: string): RunLine[] {
  const lines: RunLine[] = [];
  let kind: RunLine["kind"] = "sub";
  for (const raw of text.split(/\r?\n/)) {
    const row = raw.trim();
    if (/^employees:?$/i.test(row)) kind = "employee";
    else if (/^subs:?$/i.test(row)) kind = "sub";
    else {
      const m = /^(.+?):\s*(\$?)([\d,]+(?:\.\d+)?)\s*(hours?|hrs?)?\s*(?:\((.*)\))?$/i.exec(row);
      if (!m) continue;
      const value = Number(m[3].replace(/,/g, ""));
      const byHours = !!m[4] || (!m[2] && kind === "employee");
      lines.push({ name: m[1].trim(), kind: byHours ? "employee" : "sub", hours: byHours ? value : null, amountCents: byHours ? null : Math.round(value * 100), note: m[5]?.trim() ?? "" });
    }
  }
  return lines;
}
