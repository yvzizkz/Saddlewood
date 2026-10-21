// Progress billing on the schedule of values: the math. Pure and client-safe.
//
// Each line of the SOV (Award writes it into jobs.billing.sov) and each signed
// change order is billed by percent complete. A draw asks for the percent
// complete to date on each line; this period is that share of the line less
// what earlier draws already billed on it. Retainage, when the client's
// profile holds some, comes off as its own line, so the invoice total is what
// is due now. A deposit the client already paid (Award's deposit invoice) is
// credited back across the draws in proportion to what each one bills of what
// is left, the last draw taking the rest, so a job billed to 100% bills the
// contract once, deposit included. Guards: a percent is 0 to 100, never lower than the last draw
// (a reduction is a credit, not a smaller draw), and nothing bills past the
// line.

export type ProgressLine = {
  /** Stable id within the job: "sov:<index>" or "co:<change order id>". */
  key: string;
  description: string;
  /** What the line is worth in all (cents). */
  scheduledCents: number;
  /** Already billed on earlier draws (cents), and the percent that was. */
  billedToDateCents: number;
  pctToDate: number;
  kind: "sov" | "co";
};

export type DrawLine = ProgressLine & {
  pct: number;
  thisPeriodCents: number;
  toDateCents: number;
  balanceCents: number;
};

export type Draw = {
  lines: DrawLine[];
  /** This period before retainage. */
  grossCents: number;
  retainagePct: number;
  retainageCents: number;
  /** The deposit credited on this draw ("Less deposit applied"). */
  depositCents: number;
  /** What the invoice asks for now. */
  dueCents: number;
  contractCents: number;
  billedToDateCents: number;
  errors: string[];
};

/** The amount a percent of a line comes to, in whole cents. */
export function shareOf(scheduledCents: number, pct: number): number {
  return Math.round((scheduledCents * pct) / 100);
}

/** The job's deposit (an issued deposit invoice) and how much of it earlier draws credited back. */
export type DepositState = { cents: number; appliedCents: number };

/**
 * The deposit to credit on a draw of `grossCents`: the deposit not yet
 * credited, in proportion to what this draw bills of what was left to bill;
 * all of it when the draw bills the rest of the contract.
 */
export function depositCredit(dep: DepositState | null | undefined, grossCents: number, contractCents: number, billedBeforeCents: number): number {
  if (!dep) return 0;
  const remaining = dep.cents - dep.appliedCents;
  const left = contractCents - billedBeforeCents;
  if (remaining <= 0 || grossCents <= 0 || left <= 0) return 0;
  if (grossCents >= left) return remaining;
  return Math.min(remaining, Math.round((remaining * grossCents) / left));
}

/**
 * The draw for the percents asked (key → percent to date). Lines not asked keep
 * their last percent and bill nothing this period.
 */
export function computeDraw(lines: ProgressLine[], asked: Record<string, number>, retainagePct = 0, deposit?: DepositState | null): Draw {
  const errors: string[] = [];
  const out: DrawLine[] = lines.map((l) => {
    const raw = asked[l.key];
    const pct = raw === undefined || raw === null || Number.isNaN(Number(raw)) ? l.pctToDate : Math.round(Number(raw) * 100) / 100;
    if (pct < 0 || pct > 100) errors.push(`${l.description}: percent complete must be 0 to 100.`);
    if (pct < l.pctToDate) errors.push(`${l.description}: ${pct}% is below the ${l.pctToDate}% already billed. Issue a credit instead.`);
    const toDate = shareOf(l.scheduledCents, Math.min(100, Math.max(0, pct)));
    const thisPeriod = toDate - l.billedToDateCents;
    if (l.scheduledCents >= 0 && toDate > l.scheduledCents) errors.push(`${l.description}: would bill past the line.`);
    return { ...l, pct, thisPeriodCents: thisPeriod, toDateCents: toDate, balanceCents: l.scheduledCents - toDate };
  });
  const gross = out.reduce((a, l) => a + l.thisPeriodCents, 0);
  const pct = Math.max(0, Math.min(100, retainagePct || 0));
  const retainage = Math.round((gross * pct) / 100);
  if (gross < 0) errors.push("This draw comes to less than nothing. Issue a credit instead.");
  const contract = lines.reduce((a, l) => a + l.scheduledCents, 0);
  const credit = depositCredit(deposit, gross, contract, lines.reduce((a, l) => a + l.billedToDateCents, 0));
  return {
    lines: out,
    grossCents: gross,
    retainagePct: pct,
    retainageCents: retainage,
    depositCents: credit,
    dueCents: gross - retainage - credit,
    contractCents: contract,
    billedToDateCents: out.reduce((a, l) => a + l.toDateCents, 0),
    errors,
  };
}

/** The invoice lines for a draw: one per line that bills this period, then retainage held. */
export function drawInvoiceLines(d: Draw): { description: string; amountCents: number; note?: string }[] {
  const lines: { description: string; amountCents: number; note?: string }[] = d.lines
    .filter((l) => l.thisPeriodCents !== 0)
    .map((l) => ({
      description: l.description,
      amountCents: l.thisPeriodCents,
      note: `${l.pct}% complete to date of ${(l.scheduledCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })}; ${(l.billedToDateCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })} billed before`,
    }));
  if (d.retainageCents > 0) lines.push({ description: `Retainage held (${d.retainagePct}%)`, amountCents: -d.retainageCents });
  if (d.depositCents > 0) lines.push({ description: "Less deposit applied", amountCents: -d.depositCents });
  return lines;
}
