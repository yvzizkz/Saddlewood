import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { SearchMode, SearchRow } from "./purchaseSearch";
import {
  FLAG_LOOKBACK_DAYS,
  MATERIAL_WINDOW_DAYS,
  lowestUnitPrices,
  materialBlock,
  purchasesForDay,
  splitUnmatched,
  type AliasRule,
  type MaterialBlock,
  type PurchaseRow,
  type PurchasesToday,
  type TradeRule,
  type UnmatchedPurchase,
  type UnmatchedPurchases,
} from "./purchases";
import { coverChanges, matchReceiptsToTrips, type DedupeLine } from "./receiptDedupe";
import { addDays } from "./time";

// Every read and write of the purchase tables (migration 0022). Service-role
// client only, after the route has decided who is asking. The rules live in
// purchases.ts; this only moves rows.

function fail(what: string, message: string): never {
  throw new Error(`${what} failed: ${message}`);
}

type PurchaseDbRow = {
  source: "hd" | "app";
  source_key: string;
  purchased_on: string;
  vendor: string;
  store: string;
  order_ref: string;
  job_name_raw: string;
  job_key: string;
  job_id: string | null;
  trade: string;
  department: string;
  class: string;
  sku: string;
  description: string;
  qty: number | string;
  line_total_cents: number;
  meta: Record<string, unknown> | null;
};

const COLS = "source, source_key, purchased_on, vendor, store, order_ref, job_name_raw, job_key, job_id, trade, department, class, sku, description, qty, line_total_cents, meta";

function toRow(r: PurchaseDbRow): PurchaseRow {
  return {
    source: r.source,
    sourceKey: r.source_key,
    purchasedOn: r.purchased_on,
    vendor: r.vendor,
    store: r.store,
    orderRef: r.order_ref,
    jobNameRaw: r.job_name_raw,
    jobKey: r.job_key,
    jobId: r.job_id,
    trade: (r.trade || "general") as PurchaseRow["trade"],
    department: r.department,
    class: r.class,
    sku: r.sku,
    description: r.description,
    // numeric comes back from PostgREST as a number or a string.
    qty: Number(r.qty) || 0,
    lineTotalCents: r.line_total_cents,
    meta: r.meta ?? {},
  };
}

function toDb(r: PurchaseRow, at: string) {
  return {
    source: r.source,
    source_key: r.sourceKey,
    purchased_on: r.purchasedOn,
    vendor: r.vendor,
    store: r.store,
    order_ref: r.orderRef,
    job_name_raw: r.jobNameRaw,
    job_key: r.jobKey,
    job_id: r.jobId,
    trade: r.trade,
    department: r.department,
    class: r.class,
    sku: r.sku,
    description: r.description,
    qty: r.qty,
    line_total_cents: r.lineTotalCents,
    meta: r.meta,
    updated_at: at,
  };
}

const CHUNK = 500;
export const MANUAL_KEY_BATCH = 100;

/** A line as a person left it: the trade they set (0030) and the job they put it on (0042). */
export type ManualEdit = { source_key: string; trade: string; job_id: string | null; trade_manual: boolean; job_manual?: boolean };

/**
 * The Mac's lines with what a person set by hand put back: a manual trade
 * stays, and a manual job stays (and is not "set aside"). Pure, for tests.
 */
export function keepManual(rows: PurchaseRow[], edits: ManualEdit[]): PurchaseRow[] {
  const by = new Map(edits.map((e) => [e.source_key, e]));
  return rows.map((r) => {
    const e = by.get(r.sourceKey);
    if (!e) return r;
    const out = { ...r };
    if (e.trade_manual) out.trade = e.trade as PurchaseRow["trade"];
    if (e.job_manual) {
      out.jobId = e.job_id;
      const meta = { ...(r.meta ?? {}) };
      delete meta.ignored;
      out.meta = meta;
    }
    return out;
  });
}

async function manualEditsBatch(db: ReturnType<typeof getSupabaseAdmin>, batch: string[]): Promise<ManualEdit[]> {
  const full = await db.from("purchases").select("source_key, trade, job_id, trade_manual, job_manual").in("source_key", batch).or("trade_manual.eq.true,job_manual.eq.true");
  if (!full.error) return (full.data ?? []) as ManualEdit[];
  // Before 0042 there is no job_manual: keep the manual trades.
  const trades = await db.from("purchases").select("source_key, trade, job_id, trade_manual").in("source_key", batch).eq("trade_manual", true);
  if (trades.error) fail("purchases manual edits", trades.error.message);
  return (trades.data ?? []) as ManualEdit[];
}

async function manualEdits(keys: string[]): Promise<ManualEdit[]> {
  const db = getSupabaseAdmin();
  const out: ManualEdit[] = [];
  for (let i = 0; i < keys.length; i += MANUAL_KEY_BATCH) {
    out.push(...(await manualEditsBatch(db, keys.slice(i, i + MANUAL_KEY_BATCH))));
  }
  return out;
}

/**
 * Insert or replace by source_key. -> how many rows went in. Safe to send
 * twice, and it keeps what a person set by hand (keepManual).
 */
export async function upsertPurchases(rows: PurchaseRow[]): Promise<number> {
  if (!rows.length) return 0;
  const db = getSupabaseAdmin();
  const at = new Date().toISOString();
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const kept = keepManual(chunk, await manualEdits(chunk.map((r) => r.sourceKey)));
    const { error } = await db.from("purchases").upsert(kept.map((r) => toDb(r, at)), { onConflict: "source_key" });
    if (error) fail("purchases upsert", error.message);
  }
  // A Pro Xtra trip and the same receipt filed in the app count once. The
  // upsert above replaced each line's meta, so the marks are worked out again.
  try {
    await dedupeReceipts([...new Set(rows.map((r) => r.purchasedOn))]);
  } catch (err) {
    console.error("purchases dedupe:", err);
  }
  return rows.length;
}

/**
 * Mark the app receipts a Pro Xtra trip covers on these days (receiptDedupe.ts):
 * meta.coveredBy = <trip key>, so totals leave them out; clear a mark that no
 * longer holds. A covered trip on no job (and not set by hand) takes the job
 * the receipt was filed under. -> how many marks were set and cleared, and
 * how many trip lines got a job.
 */
export async function dedupeReceipts(days: string[]): Promise<{ covered: number; cleared: number; linked: number }> {
  const out = { covered: 0, cleared: 0, linked: 0 };
  const ds = days.filter(Boolean);
  if (!ds.length) return out;
  const db = getSupabaseAdmin();
  const lines: DedupeLine[] = [];
  for (let i = 0; i < ds.length; i += MANUAL_KEY_BATCH) {
    const { data, error } = await db
      .from("purchases")
      .select("source, source_key, purchased_on, vendor, line_total_cents, job_id, meta")
      .in("purchased_on", ds.slice(i, i + MANUAL_KEY_BATCH))
      .limit(10000);
    if (error) fail("purchases dedupe read", error.message);
    for (const r of (data ?? []) as Pick<PurchaseDbRow, "source" | "source_key" | "purchased_on" | "vendor" | "line_total_cents" | "job_id" | "meta">[]) {
      lines.push({ source: r.source, sourceKey: r.source_key, purchasedOn: r.purchased_on, vendor: r.vendor, lineTotalCents: r.line_total_cents, jobId: r.job_id, meta: r.meta ?? {} });
    }
  }
  const matches = matchReceiptsToTrips(lines);
  const { set, clear } = coverChanges(lines, matches);
  const metaOf = new Map(lines.map((l) => [l.sourceKey, l.meta]));
  const at = new Date().toISOString();
  for (const m of set) {
    const { error } = await db.from("purchases").update({ meta: { ...metaOf.get(m.appKey), coveredBy: m.tripKey }, updated_at: at }).eq("source_key", m.appKey);
    if (error) fail("purchases dedupe mark", error.message);
    out.covered += 1;
  }
  for (const key of clear) {
    const rest = { ...metaOf.get(key) };
    delete rest.coveredBy;
    const { error } = await db.from("purchases").update({ meta: rest, updated_at: at }).eq("source_key", key);
    if (error) fail("purchases dedupe clear", error.message);
    out.cleared += 1;
  }
  for (const m of matches) {
    if (!m.jobId) continue;
    const { data, error } = await db
      .from("purchases")
      .update({ job_id: m.jobId, updated_at: at })
      .eq("trip_key", m.tripKey)
      .is("job_id", null)
      .eq("job_manual", false)
      .select("source_key");
    if (error) fail("purchases dedupe link", error.message);
    out.linked += (data ?? []).length;
  }
  return out;
}

/** Put one trip, or some lines, on a job (null = no job) by hand: the alias rule for the register name is not touched. */
export async function assignPurchases(target: { tripKey?: string; sourceKeys?: string[] }, jobId: string | null): Promise<number> {
  const db = getSupabaseAdmin();
  const { data, error } = await db.rpc("purchases_assign", { p_source_keys: target.sourceKeys?.length ? target.sourceKeys : null, p_trip_key: target.tripKey || null, p_job: jobId });
  if (error) fail("purchases assign", error.message);
  return typeof data === "number" ? data : Number(data) || 0;
}

export async function listPurchases(filter: { jobId?: string; fromDay: string; toDay?: string; skus?: string[]; limit?: number }): Promise<PurchaseRow[]> {
  const db = getSupabaseAdmin();
  // A receipt a Pro Xtra trip covers is not counted twice (receiptDedupe.ts).
  let q = db.from("purchases").select(COLS).gte("purchased_on", filter.fromDay).is("meta->>coveredBy", null);
  if (filter.toDay) q = q.lte("purchased_on", filter.toDay);
  if (filter.jobId) q = q.eq("job_id", filter.jobId);
  if (filter.skus) {
    if (!filter.skus.length) return [];
    q = q.in("sku", filter.skus);
  }
  const { data, error } = await q.order("purchased_on", { ascending: true }).limit(filter.limit ?? 5000);
  if (error) fail("purchases list", error.message);
  return ((data ?? []) as PurchaseDbRow[]).map(toRow);
}

// ---- aliases and trades ----------------------------------------------------------------

export async function listAliases(): Promise<AliasRule[]> {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("job_aliases").select("alias, job_id");
  if (error) fail("job_aliases list", error.message);
  return ((data ?? []) as { alias: string; job_id: string | null }[]).map((r) => ({ alias: r.alias, jobId: r.job_id }));
}

export async function upsertAlias(alias: string, jobId: string | null, by: string): Promise<void> {
  const db = getSupabaseAdmin();
  const { error } = await db.from("job_aliases").upsert({ alias, job_id: jobId, created_by: by, updated_at: new Date().toISOString() }, { onConflict: "alias" });
  if (error) fail("job_aliases save", error.message);
}

export async function listTradeMap(): Promise<TradeRule[]> {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("trade_map").select("department, class, trade");
  if (error) fail("trade_map list", error.message);
  return (data ?? []) as TradeRule[];
}

/** Every line with this key gets the job (null = set aside) and its trade again. -> lines moved. */
export async function relinkPurchases(key: string, jobId: string | null): Promise<number> {
  const db = getSupabaseAdmin();
  const { data, error } = await db.rpc("purchases_relink", { p_key: key, p_job: jobId });
  if (error) fail("purchases relink", error.message);
  return typeof data === "number" ? data : Number(data) || 0;
}

/** The day of the newest purchase in the table, or null with none. */
export async function newestPurchaseDay(): Promise<string | null> {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("purchases").select("purchased_on").order("purchased_on", { ascending: false }).limit(1);
  if (error) fail("purchases newest", error.message);
  return ((data ?? []) as { purchased_on: string }[])[0]?.purchased_on ?? null;
}

/**
 * The names waiting for "Which job is this?", biggest spend first: the ones
 * whose last purchase is within UNMATCHED_RECENT_DAYS of the newest purchase
 * in the table, and a count of the older ones (the history from before the
 * app: search finds those). `all` returns every name as a card (the admin
 * read's ?all=1).
 */
export async function listUnmatchedPurchases(opts: { all?: boolean; limit?: number } = {}): Promise<UnmatchedPurchases> {
  const db = getSupabaseAdmin();
  const [newestOn, { data, error }] = await Promise.all([
    newestPurchaseDay(),
    db.from("purchases_unmatched").select("job_key, name, trips, lines, cents, last_on, first_on").order("cents", { ascending: false }).limit(opts.limit ?? 5000),
  ]);
  if (error) fail("purchases_unmatched list", error.message);
  const names: UnmatchedPurchase[] = ((data ?? []) as { job_key: string; name: string; trips: number | string; lines: number | string; cents: number | string; last_on: string; first_on: string }[]).map((r) => ({
    key: r.job_key,
    name: r.name,
    trips: Number(r.trips) || 0,
    lines: Number(r.lines) || 0,
    cents: Number(r.cents) || 0,
    lastOn: r.last_on,
    firstOn: r.first_on,
  }));
  if (opts.all) return { names, older: 0, olderCents: 0, newestOn };
  const { recent, older } = splitUnmatched(names, newestOn);
  return { names: recent, older: older.length, olderCents: older.reduce((sum, n) => sum + n.cents, 0), newestOn };
}

// ---- finding a purchase (0026) --------------------------------------------------------------

type SearchDbRow = {
  trip_key: string;
  rank: number | string;
  total_trips: number | string;
  trip_cents: number | string;
  trip_lines: number | string;
  source_key: string;
  purchased_on: string;
  store: string;
  vendor: string;
  job_id: string | null;
  job_name: string | null;
  job_name_raw: string;
  trade: string;
  description: string;
  sku: string;
  qty: number | string;
  line_total_cents: number;
  matched: boolean;
};

/** purchases_search(): the lines of the top trips for these words, in rank order. The parsing is purchaseSearch.ts's. */
export async function runPurchaseSearch(args: { words: string[]; mode: SearchMode; jobIds: string[] | null; trade: string; from: string | null; to: string | null; trips: number; lines: number }): Promise<SearchRow[]> {
  const db = getSupabaseAdmin();
  const { data, error } = await db.rpc("purchases_search", {
    p_words: args.words,
    p_mode: args.mode,
    p_jobs: args.jobIds,
    p_trade: args.trade,
    p_from: args.from,
    p_to: args.to,
    p_trips: args.trips,
    p_lines: args.lines,
  });
  if (error) fail("purchases search", error.message);
  return ((data ?? []) as SearchDbRow[]).map((r) => ({
    tripKey: r.trip_key,
    rank: Number(r.rank) || 0,
    totalTrips: Number(r.total_trips) || 0,
    tripCents: Number(r.trip_cents) || 0,
    tripLines: Number(r.trip_lines) || 0,
    sourceKey: r.source_key,
    purchasedOn: r.purchased_on,
    store: r.store,
    vendor: r.vendor,
    jobId: r.job_id,
    jobName: r.job_name,
    jobNameRaw: r.job_name_raw,
    trade: r.trade,
    description: r.description,
    sku: r.sku,
    qty: Number(r.qty) || 0,
    lineTotalCents: r.line_total_cents,
    matched: r.matched === true,
  }));
}

/** The field job a billing job is linked to (jobs.crew_job_id), or null. */
export async function crewJobOfBillingJob(billingJobId: string): Promise<string | null> {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("jobs").select("crew_job_id").eq("id", billingJobId).maybeSingle();
  if (error) fail("jobs read", error.message);
  return (data as { crew_job_id: string | null } | null)?.crew_job_id ?? null;
}

// ---- the two reads the screens and the Mac make -------------------------------------------

/** The money card's Material block for one field job. */
export async function loadMaterial(crewJobId: string, today: string): Promise<MaterialBlock> {
  const lines = await listPurchases({ jobId: crewJobId, fromDay: addDays(today, -MATERIAL_WINDOW_DAYS), toDay: today });
  return materialBlock(lines, today);
}

/** One day's purchases per job for the Mac, with the 90-day price flags. */
export async function loadPurchasesToday(day: string, jobs: { id: string; name: string }[]): Promise<PurchasesToday[]> {
  const lines = await listPurchases({ fromDay: day, toDay: day });
  if (!lines.length) return [];
  const skus = [...new Set(lines.map((l) => l.sku).filter(Boolean))];
  const before = skus.length ? await listPurchases({ fromDay: addDays(day, -FLAG_LOOKBACK_DAYS), toDay: addDays(day, -1), skus }) : [];
  return purchasesForDay(lines, lowestUnitPrices(before), jobs);
}
