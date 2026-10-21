import { RECEIPT_SOURCES, tripKey, type PurchaseSource } from "./purchases";

// One Home Depot trip, counted once.
//
// A trip can reach purchases twice: the Pro Xtra export sends its lines
// (hd:<day>:<store>:<register>:<txn>:<n>, pre-tax), and the crew file the
// same receipt in the app (one line, app:<entry id>, the total they paid,
// tax in). The app line carries no store or transaction number, so the match
// is: same day, a Home Depot vendor, and a receipt total that is the trip's
// pre-tax total plus Arizona sales tax (0 to 10.5%). The Pro Xtra lines win
// (they say what was bought); the app line stays, marked
// meta.coveredBy = <trip key>, and every total leaves it out.
//
// Each trip covers at most one receipt and each receipt at most one trip.
// Where a day has more than one fit, the closest to a typical 8.3% wins.

export const TAX_MIN = 0;
export const TAX_MAX = 0.105;
const TAX_TYPICAL = 0.083;
/** A receipt typed in without the cents, or a penny of rounding, still matches. */
const SLACK_CENTS = 100;

export type DedupeLine = {
  source: PurchaseSource;
  sourceKey: string;
  purchasedOn: string;
  vendor: string;
  lineTotalCents: number;
  jobId: string | null;
  meta: Record<string, unknown>;
};

export type ReceiptMatch = { appKey: string; tripKey: string; jobId: string | null };

export function isHomeDepot(vendor: string): boolean {
  return /home\s*depot|^\s*hd\s*$/i.test(vendor);
}

/** The app receipts that duplicate a Pro Xtra trip, among these lines (any days). */
export function matchReceiptsToTrips(lines: DedupeLine[]): ReceiptMatch[] {
  const trips = new Map<string, { key: string; day: string; cents: number }>();
  for (const l of lines) {
    if (l.source !== "hd") continue;
    const k = tripKey(l.sourceKey);
    const t = trips.get(k) ?? { key: k, day: l.purchasedOn, cents: 0 };
    t.cents += l.lineTotalCents;
    trips.set(k, t);
  }
  const receipts = lines
    .filter((l) => RECEIPT_SOURCES.includes(l.source) && l.lineTotalCents > 0 && isHomeDepot(l.vendor))
    .sort((a, b) => b.lineTotalCents - a.lineTotalCents || a.sourceKey.localeCompare(b.sourceKey));

  // Every receipt-trip pair that fits, best first; then take them greedily.
  const pairs: { r: DedupeLine; t: { key: string }; miss: number }[] = [];
  for (const r of receipts) {
    for (const t of trips.values()) {
      if (t.day !== r.purchasedOn || t.cents <= 0) continue;
      const lo = t.cents * (1 + TAX_MIN) - SLACK_CENTS;
      const hi = t.cents * (1 + TAX_MAX) + SLACK_CENTS;
      if (r.lineTotalCents < lo || r.lineTotalCents > hi) continue;
      pairs.push({ r, t, miss: Math.abs(r.lineTotalCents - t.cents * (1 + TAX_TYPICAL)) });
    }
  }
  pairs.sort((a, b) => a.miss - b.miss || a.r.sourceKey.localeCompare(b.r.sourceKey) || a.t.key.localeCompare(b.t.key));
  const usedR = new Set<string>();
  const usedT = new Set<string>();
  const out: ReceiptMatch[] = [];
  for (const p of pairs) {
    if (usedR.has(p.r.sourceKey) || usedT.has(p.t.key)) continue;
    usedR.add(p.r.sourceKey);
    usedT.add(p.t.key);
    out.push({ appKey: p.r.sourceKey, tripKey: p.t.key, jobId: p.r.jobId });
  }
  return out.sort((a, b) => a.appKey.localeCompare(b.appKey));
}

/** The marks to change: receipts to mark covered, and receipts whose mark no longer holds. */
export function coverChanges(lines: DedupeLine[], matches: ReceiptMatch[]): { set: ReceiptMatch[]; clear: string[] } {
  const want = new Map(matches.map((m) => [m.appKey, m.tripKey]));
  const set: ReceiptMatch[] = [];
  const clear: string[] = [];
  for (const l of lines) {
    if (!RECEIPT_SOURCES.includes(l.source)) continue;
    const has = typeof l.meta.coveredBy === "string" ? (l.meta.coveredBy as string) : null;
    const should = want.get(l.sourceKey) ?? null;
    if (has === should) continue;
    if (should) set.push(matches.find((m) => m.appKey === l.sourceKey)!);
    else clear.push(l.sourceKey);
  }
  return { set, clear };
}

/** Is this line counted in totals? An app receipt a Pro Xtra trip covers is not. */
export function counts(meta: Record<string, unknown> | null | undefined): boolean {
  return !(meta && typeof meta.coveredBy === "string" && meta.coveredBy);
}
