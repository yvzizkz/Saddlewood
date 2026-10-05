// Document numbers.
//
// Clients know our numbers as <street number>-<sequence>: 8009-11 is the 11th
// invoice on the job at 8009. We keep that look. What changes is that the app
// hands the number out, so the things that went wrong when they were typed by
// hand cannot: the same number twice, "4847-  16" beside "4847- 16", a suffix
// invented on the day.
//
// Change orders are CO-<n> within their job, per SOP-002.

/** A number as it is stored and compared: no spaces, one dash, upper case. */
export function normalizeNumber(raw: string): string {
  return raw
    .trim()
    .replace(/^#/, "")
    .replace(/\s+/g, "")
    .replace(/-{2,}/g, "-")
    .toUpperCase();
}

/** The sequence at the end of a number with this prefix, or null if it is not one of ours. */
export function sequenceOf(number: string, prefix: string): number | null {
  const n = normalizeNumber(number);
  const p = normalizeNumber(prefix);
  if (!p || !n.startsWith(`${p}-`)) return null;
  const tail = n.slice(p.length + 1);
  if (!/^\d+$/.test(tail)) return null;
  return Number(tail);
}

/**
 * The next number for a job: one past the highest sequence already used with
 * its prefix, two digits at least (8009-09, 8009-10, 8009-100).
 * `used` is every number of that kind on the job, drafts and voids included,
 * so a number is never handed out twice.
 */
export function nextNumber(prefix: string, used: string[]): string {
  const p = normalizeNumber(prefix);
  if (!p) throw new Error("a job needs a number prefix before it can have documents");
  let highest = 0;
  for (const u of used) {
    const s = sequenceOf(u, p);
    if (s !== null && s > highest) highest = s;
  }
  return `${p}-${String(highest + 1).padStart(2, "0")}`;
}

export function nextChangeOrderNumber(used: string[]): string {
  return nextNumber("CO", used).replace(/^CO-0*(\d)/, "CO-$1");
}
