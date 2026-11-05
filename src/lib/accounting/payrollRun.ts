import { addDays } from "@/lib/crew/time";

// The Wednesday payroll run (Finance & Admin). Employees go to the accountant by
// hours; everyone else by a dollar amount, most of them not from a clock (KB
// #435038, #455577): a weekly figure, a company with a W-9, a piece of work. So a
// line is whatever Finance says it is. The clock only fills in what it knows, and
// the next run starts from the last one. Pure.
//
// A line and a person on the clock are the same person by the crew email saved
// on the line. A line with no email links by name, ignoring accents and case
// ("Omar Peña" is "Omar Pena"), and saving keeps the link. Anyone else on the
// clock is flagged for Finance and never added on their own: "Arnoldo Mujica"
// might be "Arnold Mujica", and a second line would pay him twice.
//
// An amount carries as it was. Only a line Finance marked by rate (`byRate`) is
// recomputed from the clock, and it shows what it was last run.

export type RunLine = {
  name: string;
  kind: "employee" | "sub";
  hours: number | null;
  amountCents: number | null;
  note: string;
  /** The crew person this line is, once linked. */
  email?: string;
  /** Paid hours times rate: the amount comes from the clock each run. */
  byRate?: boolean;
};

/** A line of a new run, and what a by-rate amount was last run when the clock changed it. */
export type StartedLine = RunLine & { lastCents?: number | null };

/** What the clock knows about a person for the pay week. */
export type Clocked = { email: string; name: string; hours: number; costCents: number | null };

/** The Friday a run on this day pays: this one, or today if it's Friday. */
export function payDateFor(today: string): string {
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  return addDays(today, (5 - weekday + 7) % 7);
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** A name with its accents, case and extra spaces gone. */
export function sameName(name: string): string {
  return name.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Each line's person on the clock, by email and then by name, and the people no line claims. */
export function linkClocked(lines: RunLine[], clocked: Clocked[]): { matched: (Clocked | null)[]; unlinked: Clocked[] } {
  const left = new Map(clocked.map((c) => [c.email, c]));
  const take = (c: Clocked | undefined) => (c && left.delete(c.email) ? c : null);
  const byEmail = lines.map((l) => (l.email ? take(left.get(l.email)) : null));
  const matched = lines.map((l, i) => byEmail[i] ?? (l.email ? null : take([...left.values()].find((c) => sameName(c.name) === sameName(l.name)))));
  return { matched, unlinked: [...left.values()] };
}

/**
 * A new run: last run's people with the amounts they had, each employee's hours
 * from the clock when it has any, and a by-rate line at hours times rate, blank
 * if the clock has nothing to go on.
 */
export function startLines(previous: RunLine[], clocked: Clocked[]): StartedLine[] {
  const { matched } = linkClocked(previous, clocked);
  return previous.map((l, i): StartedLine => {
    const c = matched[i];
    const line: RunLine = { ...l, ...(c ? { email: c.email } : {}), note: "" };
    if (l.kind === "employee") return { ...line, hours: c ? round2(c.hours) : null };
    if (!l.byRate) return line;
    const amountCents = c?.costCents ?? null;
    return { ...line, amountCents, ...(amountCents === l.amountCents ? {} : { lastCents: l.amountCents }) };
  });
}

/** Why this run can't be saved, or null. */
export function runProblem(lines: RunLine[]): string | null {
  if (!lines.length) return "Add at least one person.";
  const seen = new Set<string>();
  for (const l of lines) {
    const name = l.name.trim();
    if (!name) return "Every line needs a name.";
    for (const key of [sameName(name), ...(l.email ? [l.email] : [])]) {
      if (seen.has(key)) return `${name} is on the run twice.`;
      seen.add(key);
    }
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
