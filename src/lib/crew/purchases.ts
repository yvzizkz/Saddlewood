import { z } from "zod";

import { QUICK_TRADES, TRADE_SLUGS, type TradeSlug } from "@/lib/accounting/tradeList";

import { addDays, isDay } from "./time";

// Home Depot purchases by job and by trade (migration 0022). The Mac posts the
// Pro Xtra history, one row per receipt line, with the job name typed at the
// register. Nothing about that name is reliable ("POINT LOMA", "Point Loma",
// "PT LOMA"), so each spelling is matched once: an owner (or the project
// manager, for his jobs) answers "Which job is this?" and the answer is kept
// in job_aliases under the normalized name. Pure, so every rule here is
// tested without a database; purchaseQueries.ts reads and writes.

/** The owners' short list for the quick search chips (the shared list's QUICK_TRADES). */
export const TRADES = QUICK_TRADES;

/** The full trade list (public.trades, 0029_trades.sql) accepted by trade_map and purchases.trade. */
export { TRADE_SLUGS };
export type Trade = TradeSlug;

/** A trip this small is worth noticing: someone drove to the store for a box of screws. */
export const SMALL_TRIP_CENTS = 7500;
/** A line is flagged when its unit price is this much above the lowest paid for the same sku lately. */
export const FLAG_ABOVE = 0.2;
export const FLAG_LOOKBACK_DAYS = 90;
export const MATERIAL_WINDOW_DAYS = 365;
export const MAX_PURCHASE_LINES = 2000;

// ---- the normalized register name ----------------------------------------------

/** "Unit 45", "#45", "Apt 45", "Ste 45": the number alone says it. */
const UNIT_WORDS = /\b(?:unit|apt|apartment|suite|ste|no|num|number)\s+(?=\d)/g;

/**
 * The register name as job_aliases keys it: lowercased, accents and
 * punctuation dropped, spaces collapsed, "#45" and "Unit 45" the same.
 * "PT  LOMA," -> "pt loma". Two different spellings of one job stay two keys
 * ("pt loma", "point loma"): each is answered once and remembered.
 */
export function normalizeJobName(raw: string): string {
  return raw
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(UNIT_WORDS, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

/**
 * The trip a line belongs to: its source key up to the last colon
 * (hd:20260812:674:0:6220:1 -> hd:20260812:674:0:6220). Home Depot
 * transaction numbers repeat across stores and days, so the whole prefix is
 * the trip, never the transaction alone. A key with no colon is its own trip.
 *
 * The same rule is the stored purchases.trip_key column (generated, 0044);
 * e2e/purchase-rules-parity.spec.ts holds the two to the same answers.
 */
export function tripKey(sourceKey: string): string {
  // A receipt filed in the app is one line keyed app:<entry id>: its own trip (0044).
  if (/^app:\d+$/.test(sourceKey)) return sourceKey;
  const i = sourceKey.lastIndexOf(":");
  return i >= 0 ? sourceKey.slice(0, i) : sourceKey;
}

// ---- trades -------------------------------------------------------------------------

export type TradeRule = { department: string; class: string; trade: string };

const upper = (s: string) => s.trim().replace(/\s+/g, " ").toUpperCase();

/**
 * Exact (department, class), then the department alone, else general. The
 * same lookup runs in SQL when a register alias relinks lines
 * (purchases_relink, 0042); e2e/purchase-rules-parity.spec.ts holds the two
 * to the same answers.
 */
export function tradeFor(rules: TradeRule[], department: string, cls: string): Trade {
  const d = upper(department);
  const c = upper(cls);
  const hit =
    rules.find((r) => upper(r.department) === d && upper(r.class) === c) ??
    rules.find((r) => upper(r.department) === d && r.class.trim() === "");
  return hit && (TRADE_SLUGS as readonly string[]).includes(hit.trade) ? (hit.trade as Trade) : "general";
}

// ---- what the Mac posts ---------------------------------------------------------------

const clipped = (max: number) =>
  z
    .string()
    .default("")
    .transform((v) => v.replace(/\u0000/g, "").trim().replace(/\s+/g, " ").slice(0, max));

export const purchaseLineSchema = z.object({
  source: z.enum(["hd", "app"]),
  sourceKey: z.string().trim().min(1).max(120),
  purchasedOn: z.string().refine(isDay, "purchasedOn must be YYYY-MM-DD"),
  vendor: clipped(80).transform((v) => v || "Home Depot"),
  store: clipped(80),
  orderRef: clipped(80),
  jobNameRaw: clipped(160),
  department: clipped(80),
  class: clipped(80),
  sku: clipped(40),
  description: clipped(240),
  qty: z.number().finite().min(-1_000_000).max(1_000_000).default(0),
  lineTotalCents: z.number().int().min(-50_000_000).max(50_000_000),
  /** A field job the line is already filed under (a receipt logged in the app: source "app"). Unknown ids are ignored and the name rule applies. */
  jobId: z.string().trim().max(60).nullable().optional(),
  meta: z.record(z.string(), z.unknown()).catch({}),
});
export type PurchaseLine = z.infer<typeof purchaseLineSchema>;

/** A line as the site keeps it (purchases), with the job and the trade decided. */
export type PurchaseRow = Omit<PurchaseLine, "jobId"> & { jobKey: string; jobId: string | null; trade: Trade };

export type AliasRule = { alias: string; jobId: string | null };

/** A field job as linkLines needs it: its id and its name, so a register name that is the job's name needs no alias. */
export type JobRef = { id: string; name: string };

/** A register name that answered to no alias, as the Mac is told after a post. */
export type UnmatchedName = { name: string; lines: number; cents: number };

/**
 * Give each posted line its key, its job and its trade. The job, in order: the
 * line's own jobId when it names a job in `jobs` (a receipt filed from the
 * app); the alias for its register name (a null job means "ignore", kept as
 * meta.ignored); a register name that is a job's name or id, normalized the
 * same way, so "6402 E Bambi Drive" never becomes a "Which job is this?"
 * card. The same source key twice in one post keeps the last one, so the
 * upsert never meets a row twice.
 */
export function linkLines(lines: PurchaseLine[], aliases: AliasRule[], rules: TradeRule[], jobs: JobRef[] = []): { rows: PurchaseRow[]; linked: number; unmatched: UnmatchedName[] } {
  const alias = new Map(aliases.map((a) => [a.alias, a.jobId]));
  const ids = new Set(jobs.map((j) => j.id));
  // A job's normalized name and id -> the job. Two jobs under one name: neither is "the" job; that name waits for an alias.
  const byName = new Map<string, string | null>();
  const claim = (key: string, id: string) => {
    if (!key) return;
    const cur = byName.get(key);
    if (cur === undefined) byName.set(key, id);
    else if (cur !== id) byName.set(key, null);
  };
  for (const j of jobs) {
    claim(normalizeJobName(j.name), j.id);
    claim(normalizeJobName(j.id), j.id);
  }
  const rows = new Map<string, PurchaseRow>();
  for (const line of lines) {
    const { jobId: given, ...rest } = line;
    const jobKey = normalizeJobName(line.jobNameRaw);
    const { ignored: _was, ...meta } = line.meta;
    void _was;
    const direct = given && ids.has(given) ? given : null;
    const known = !direct && jobKey ? alias.has(jobKey) : false;
    const named = !direct && !known && jobKey ? byName.get(jobKey) || null : null;
    const jobId = direct ?? (known ? alias.get(jobKey) ?? null : named);
    rows.set(line.sourceKey, {
      ...rest,
      jobKey,
      jobId,
      trade: tradeFor(rules, line.department, line.class),
      meta: known && jobId === null ? { ...meta, ignored: true } : meta,
    });
  }
  const unmatched = new Map<string, UnmatchedName>();
  let linked = 0;
  for (const r of rows.values()) {
    if (r.jobId) {
      linked++;
      continue;
    }
    if (r.meta.ignored === true) continue;
    const u = unmatched.get(r.jobKey) ?? { name: r.jobNameRaw, lines: 0, cents: 0 };
    u.lines++;
    u.cents += r.lineTotalCents;
    unmatched.set(r.jobKey, u);
  }
  return { rows: [...rows.values()], linked, unmatched: [...unmatched.values()].sort((a, b) => b.cents - a.cents) };
}

// ---- which job is this? -----------------------------------------------------------------

/** One register name waiting for an answer (the purchases_unmatched view). */
export type UnmatchedPurchase = {
  /** The normalized name: what the answer is filed under. */
  key: string;
  /** The name as it was last typed at the register. */
  name: string;
  trips: number;
  lines: number;
  cents: number;
  lastOn: string;
  firstOn: string;
};

/**
 * A name is worth a card while its last purchase is within this many days of
 * the newest purchase in the table (not of today: the history arrives in
 * batches, and a batch of last year's receipts must not light up as new).
 * Older names are counted, not shown; search finds them.
 */
export const UNMATCHED_RECENT_DAYS = 90;

/** The names to ask about now, and the rest. `newestOn` null (no purchases yet) keeps everything recent. */
export function splitUnmatched(names: UnmatchedPurchase[], newestOn: string | null): { recent: UnmatchedPurchase[]; older: UnmatchedPurchase[] } {
  const since = newestOn ? addDays(newestOn, -UNMATCHED_RECENT_DAYS) : "";
  const recent: UnmatchedPurchase[] = [];
  const older: UnmatchedPurchase[] = [];
  for (const n of names) (n.lastOn >= since ? recent : older).push(n);
  return { recent, older };
}

/** What the screens read (listUnmatchedPurchases): the recent names, and the older ones summed into one line. */
export type UnmatchedPurchases = {
  names: UnmatchedPurchase[];
  /** How many names are older than the window (0 when `names` is the whole list). */
  older: number;
  olderCents: number;
  /** The newest purchase in the table, the window's anchor; null with no purchases. */
  newestOn: string | null;
};

// ---- trips -------------------------------------------------------------------------------

type TripLine = { sourceKey: string; lineTotalCents: number };

type Trips = { trips: number; smallTrips: number; spentCents: number; returnsCents: number };

/**
 * Lines rolled up by trip. spentCents is net (returns taken off);
 * returnsCents is what came back, as a positive figure. A small trip is one
 * that cost something and less than SMALL_TRIP_CENTS.
 */
export function rollTrips(lines: TripLine[]): Trips {
  const byTrip = new Map<string, number>();
  let spent = 0;
  let returns = 0;
  for (const l of lines) {
    const k = tripKey(l.sourceKey);
    byTrip.set(k, (byTrip.get(k) ?? 0) + l.lineTotalCents);
    spent += l.lineTotalCents;
    if (l.lineTotalCents < 0) returns -= l.lineTotalCents;
  }
  let small = 0;
  for (const total of byTrip.values()) if (total > 0 && total < SMALL_TRIP_CENTS) small++;
  return { trips: byTrip.size, smallTrips: small, spentCents: spent, returnsCents: returns };
}

// ---- the money card's Material block -------------------------------------------------------

export type MaterialBlock = Trips & {
  /** The first day counted: twelve months back. */
  since: string;
  /** Spend by trade, biggest first; only trades with lines. */
  byTrade: { trade: string; cents: number }[];
  lastOn: string | null;
};

type MaterialLine = TripLine & { trade: string; purchasedOn: string };

/** Last twelve months of Home Depot on one job. Cents in, cents out; the screen formats. */
export function materialBlock(lines: MaterialLine[], today: string): MaterialBlock {
  const since = addDays(today, -MATERIAL_WINDOW_DAYS);
  const inWindow = lines.filter((l) => l.purchasedOn >= since && l.purchasedOn <= today);
  const byTrade = new Map<string, number>();
  let lastOn: string | null = null;
  for (const l of inWindow) {
    const t = l.trade || "general";
    byTrade.set(t, (byTrade.get(t) ?? 0) + l.lineTotalCents);
    if (!lastOn || l.purchasedOn > lastOn) lastOn = l.purchasedOn;
  }
  return {
    since,
    ...rollTrips(inWindow),
    byTrade: [...byTrade.entries()].map(([trade, cents]) => ({ trade, cents })).sort((a, b) => b.cents - a.cents || a.trade.localeCompare(b.trade)),
    lastOn,
  };
}

// ---- the Mac's day feed ---------------------------------------------------------------------

export type PurchaseFlag = { description: string; sku: string; paidCents: number; lowCents: number; lowOn: string };

export type PurchasesToday = Trips & {
  /** "" for lines on no job yet; jobName is then the register name. */
  jobId: string;
  jobName: string;
  /** Lines paid more than FLAG_ABOVE over the lowest unit price for the same sku in the last FLAG_LOOKBACK_DAYS. */
  flags: PurchaseFlag[];
};

type PricedLine = { sku: string; qty: number; lineTotalCents: number; purchasedOn: string };

export type LowPrice = { cents: number; on: string };

/** Unit price of a bought line (qty > 0, paid for), or null. */
export function unitPrice(l: Pick<PricedLine, "qty" | "lineTotalCents">): number | null {
  return l.qty > 0 && l.lineTotalCents > 0 ? l.lineTotalCents / l.qty : null;
}

/** The lowest unit price paid per sku, and the day it was paid. */
export function lowestUnitPrices(lines: PricedLine[]): Map<string, LowPrice> {
  const lows = new Map<string, LowPrice>();
  for (const l of lines) {
    const unit = unitPrice(l);
    if (unit === null || !l.sku) continue;
    const low = lows.get(l.sku);
    if (!low || unit < low.cents || (unit === low.cents && l.purchasedOn < low.on)) lows.set(l.sku, { cents: unit, on: l.purchasedOn });
  }
  return lows;
}

type FeedLine = TripLine & PricedLine & { jobKey: string; jobId: string | null; jobNameRaw: string; description: string };

/**
 * One day's purchases per job, with price flags: `lows` is the lowest unit
 * price per sku over the days before (lowestUnitPrices of those lines).
 * Lines on no job are grouped by their register name with jobId "".
 */
export function purchasesForDay(lines: FeedLine[], lows: Map<string, LowPrice>, jobs: { id: string; name: string }[]): PurchasesToday[] {
  const names = new Map(jobs.map((j) => [j.id, j.name]));
  const groups = new Map<string, { jobId: string; jobName: string; lines: FeedLine[] }>();
  for (const l of lines) {
    const gk = l.jobId ? `job:${l.jobId}` : `name:${l.jobKey}`;
    const g = groups.get(gk) ?? { jobId: l.jobId ?? "", jobName: l.jobId ? (names.get(l.jobId) ?? l.jobNameRaw) : l.jobNameRaw, lines: [] };
    g.lines.push(l);
    groups.set(gk, g);
  }
  const out: PurchasesToday[] = [];
  for (const g of groups.values()) {
    const flags: PurchaseFlag[] = [];
    for (const l of g.lines) {
      const unit = unitPrice(l);
      const low = l.sku ? lows.get(l.sku) : undefined;
      if (unit === null || !low || unit <= low.cents * (1 + FLAG_ABOVE)) continue;
      flags.push({ description: l.description, sku: l.sku, paidCents: Math.round(unit), lowCents: Math.round(low.cents), lowOn: low.on });
    }
    out.push({ jobId: g.jobId, jobName: g.jobName, ...rollTrips(g.lines), flags });
  }
  return out.sort((a, b) => b.spentCents - a.spentCents || a.jobName.localeCompare(b.jobName));
}
