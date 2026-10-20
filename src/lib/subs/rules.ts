import type { Policies } from "@/lib/policies/rules";
import type { BidLine, BidResponse, PackageLine, Sub } from "./types";

// The rules of the bid-out, pure so they are tested without a database
// (SOP-008 §2). Leveling is the honest-comparison rule: a bid is never ranked
// on its headline total, only on our scope at their price plus what it would
// cost us to cover what they left out.

const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);

// ---- onboarding -------------------------------------------------------------------

export type Readiness = { ready: boolean; missing: string[] };

/**
 * What still stands between a sub and a start (SOP-008 rule 1 and document
 * G): approved, a current COI, a W-9, the MSA, the license checked, ACH
 * confirmed by phone. The award may come before; mobilizing may not.
 */
export function readiness(s: Pick<Sub, "status" | "coiExpiresOn" | "w9OnFile" | "msaSignedOn" | "rocVerifiedAt" | "achConfirmedAt">, today: string): Readiness {
  const missing: string[] = [];
  if (s.status !== "approved") missing.push(s.status === "inactive" ? "marked inactive" : "not approved yet");
  if (!s.coiExpiresOn) missing.push("no insurance certificate");
  else if (s.coiExpiresOn < today) missing.push(`insurance expired ${s.coiExpiresOn}`);
  if (!s.w9OnFile) missing.push("no W-9");
  if (!s.msaSignedOn) missing.push("no signed master agreement");
  if (!s.rocVerifiedAt) missing.push("license not verified");
  if (!s.achConfirmedAt) missing.push("bank details not confirmed by phone");
  return { ready: missing.length === 0, missing };
}

/** Days until the COI runs out (negative when it has); null with none on file. */
export function coiDaysLeft(coiExpiresOn: string | null, today: string): number | null {
  if (!coiExpiresOn) return null;
  return Math.round((Date.parse(`${coiExpiresOn}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);
}

// ---- the leveling sheet -------------------------------------------------------------

export type LeveledBid = {
  inviteId: string;
  /** What they wrote as their total (their priced lines). */
  headlineCents: number;
  /** Our cost for each line they left out, added back. */
  plugs: { lineId: string; cents: number }[];
  pluggedCents: number;
  /** Lines they left out that we have no cost for: the sheet cannot level them. */
  unpriced: string[];
  /** What the office added for the cost of their exclusions and deviations. */
  addCents: number;
  leveledCents: number;
  rank: number;
};

export type Leveling = {
  budgetCents: number;
  /** Lines with no cost of ours: a gap there cannot be plugged. */
  linesWithoutCost: string[];
  bids: LeveledBid[];
  lowestHeadline: string | null;
  lowestLeveled: string | null;
};

/**
 * Each bid on our scope: their price where they priced a line, our cost where
 * they did not (a line added by an addendum after they bid counts as not
 * priced), plus what the office adds for their exclusions. Ranked on that.
 */
export function level(lines: PackageLine[], bids: { inviteId: string; lines: BidLine[]; addCents: number }[]): Leveling {
  const budgetCents = lines.reduce((s, l) => s + (l.ourCents ?? 0), 0);
  const linesWithoutCost = lines.filter((l) => l.ourCents === null).map((l) => l.id);
  const rows: Omit<LeveledBid, "rank">[] = bids.map((b) => {
    const priced = new Map(b.lines.filter((x) => x.cents !== null).map((x) => [x.lineId, x.cents as number]));
    let headline = 0;
    for (const x of b.lines) if (x.cents !== null) headline += x.cents;
    const plugs: { lineId: string; cents: number }[] = [];
    const unpriced: string[] = [];
    for (const l of lines) {
      if (priced.has(l.id)) continue;
      if (l.ourCents === null) unpriced.push(l.id);
      else plugs.push({ lineId: l.id, cents: l.ourCents });
    }
    const pluggedCents = plugs.reduce((s, p) => s + p.cents, 0);
    return { inviteId: b.inviteId, headlineCents: headline, plugs, pluggedCents, unpriced, addCents: b.addCents, leveledCents: headline + pluggedCents + b.addCents };
  });
  const order = [...rows].sort((a, b) => a.leveledCents - b.leveledCents || a.unpriced.length - b.unpriced.length);
  const ranked = rows.map((r) => ({ ...r, rank: order.indexOf(r) + 1 }));
  const byHeadline = [...rows].sort((a, b) => a.headlineCents - b.headlineCents);
  return {
    budgetCents,
    linesWithoutCost,
    bids: ranked,
    lowestHeadline: byHeadline[0]?.inviteId ?? null,
    lowestLeveled: order[0]?.inviteId ?? null,
  };
}

// ---- submitting a bid ---------------------------------------------------------------

/**
 * The lines of a bid as they are kept: one per package line, in the package's
 * order, their price in whole cents or null. Lines the package does not have
 * are dropped; the total is worked out here, never taken from the page.
 */
export function bidLinesFor(lines: PackageLine[], sent: { lineId: string; cents: number | null; note?: string }[]): { lines: BidLine[]; totalCents: number } | { error: string } {
  const byId = new Map(sent.map((s) => [s.lineId, s]));
  const out: BidLine[] = [];
  let total = 0;
  for (const l of lines) {
    const s = byId.get(l.id);
    const cents = s && s.cents !== null && s.cents !== undefined ? s.cents : null;
    if (cents !== null && (!Number.isInteger(cents) || cents < 0 || cents > 10_000_000_000)) return { error: `check the price for "${l.description}"` };
    out.push({ lineId: l.id, cents, note: (s?.note ?? "").slice(0, 500) });
    if (cents !== null) total += cents;
  }
  if (!out.some((l) => l.cents !== null)) return { error: "price at least one line" };
  return { lines: out, totalCents: total };
}

/** What a bid's fingerprint covers: the package as the sub saw it and every word and number they sent. */
export function bidFingerprintInput(p: { packageId: string; addenda: number; lines: PackageLine[] }, r: Pick<BidResponse, "lines" | "totalCents" | "inclusions" | "exclusions" | "startOn" | "duration" | "validDays" | "deviations" | "note" | "signerName">): unknown {
  return {
    packageId: p.packageId,
    addenda: p.addenda,
    scope: p.lines.map((l) => ({ id: l.id, description: l.description, qty: l.qty, unit: l.unit })),
    bid: r,
  };
}

// ---- the award ------------------------------------------------------------------------

export type AwardCheck = { ok: true; warnings: string[] } | { ok: false; reason: string };

/**
 * Who may award (SOP-008 stage 5): the PM, an approved sub inside budget, up
 * to the PM limit in Company policies; anything else an owner. An owner may
 * award past the rules; what they pass over is shown, not hidden.
 */
export function canAward(
  role: "owner" | "staff" | "member",
  canAwardSwitch: boolean,
  a: { subStatus: Sub["status"]; leveledCents: number; budgetCents: number; bids: number; packageCents: number },
  policies: Policies,
): AwardCheck {
  const limit = num(policies["policy.subs.pmAwardLimitCents"], 1_000_000);
  const minBids = num(policies["policy.subs.minBids"], 3);
  const minFrom = num(policies["policy.subs.minBidsFromCents"], 500_000);
  const warnings: string[] = [];
  if (a.subStatus !== "approved") warnings.push("the sub is not approved yet");
  if (a.budgetCents > 0 && a.leveledCents > a.budgetCents) warnings.push("the leveled price is over our budget");
  if (a.leveledCents > limit) warnings.push(`it is over ${dollars(limit)}`);
  if (a.packageCents >= minFrom && a.bids < minBids) warnings.push(`it has ${a.bids} ${a.bids === 1 ? "bid" : "bids"}; the rule is ${minBids}`);
  if (role === "owner" || role === "staff") return { ok: true, warnings };
  if (!canAwardSwitch) return { ok: false, reason: "An owner awards this." };
  const blocking = warnings.filter((w) => !w.startsWith("it has"));
  if (blocking.length) return { ok: false, reason: `An owner awards this: ${blocking.join("; ")}.` };
  return { ok: true, warnings };
}

function dollars(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString("en-US")}`;
}

// ---- dates ------------------------------------------------------------------------------

/** Business days after a day (Monday to Friday), as YYYY-MM-DD. */
export function addBusinessDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  let left = n;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const w = d.getUTCDay();
    if (w !== 0 && w !== 6) left--;
  }
  return d.toISOString().slice(0, 10);
}

/** 5:00 PM in Phoenix (UTC-7 all year) on a day, as an instant. */
export function phoenix5pm(day: string): string {
  return `${day}T17:00:00-07:00`;
}

/** The default due time for a package sent today: N business days out, 5 PM Phoenix (Company policies). */
export function defaultDue(today: string, policies: Policies): string {
  return new Date(phoenix5pm(addBusinessDays(today, num(policies["policy.subs.bidDays"], 5)))).toISOString();
}

/** Our cost of an estimate line, the leveling plug: everything but markup on subs and the hidden uplift. */
export function ourCostCents(d: { material: number; waste: number; tax: number; labor: number; sub: number; equipment: number; allowance: number; other: number }): number {
  return Math.round((d.material + d.waste + d.tax + d.labor + d.sub + d.equipment + d.allowance + d.other) * 100);
}
