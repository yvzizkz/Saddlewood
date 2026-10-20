import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  FLAG_LOOKBACK_DAYS,
  MATERIAL_WINDOW_DAYS,
  lowestUnitPrices,
  materialBlock,
  purchasesForDay,
  type AliasRule,
  type MaterialBlock,
  type PurchaseRow,
  type PurchasesToday,
  type TradeRule,
  type UnmatchedPurchase,
} from "./purchases";
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

/** Insert or replace by source_key. -> how many rows went in. */
export async function upsertPurchases(rows: PurchaseRow[]): Promise<number> {
  if (!rows.length) return 0;
  const db = getSupabaseAdmin();
  const at = new Date().toISOString();
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await db.from("purchases").upsert(rows.slice(i, i + CHUNK).map((r) => toDb(r, at)), { onConflict: "source_key" });
    if (error) fail("purchases upsert", error.message);
  }
  return rows.length;
}

export async function listPurchases(filter: { jobId?: string; fromDay: string; toDay?: string; skus?: string[]; limit?: number }): Promise<PurchaseRow[]> {
  const db = getSupabaseAdmin();
  let q = db.from("purchases").select(COLS).gte("purchased_on", filter.fromDay);
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

/** The names waiting for "Which job is this?", biggest spend first. */
export async function listUnmatchedPurchases(limit = 200): Promise<UnmatchedPurchase[]> {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("purchases_unmatched").select("job_key, name, trips, lines, cents, last_on, first_on").order("cents", { ascending: false }).limit(limit);
  if (error) fail("purchases_unmatched list", error.message);
  return ((data ?? []) as { job_key: string; name: string; trips: number | string; lines: number | string; cents: number | string; last_on: string; first_on: string }[]).map((r) => ({
    key: r.job_key,
    name: r.name,
    trips: Number(r.trips) || 0,
    lines: Number(r.lines) || 0,
    cents: Number(r.cents) || 0,
    lastOn: r.last_on,
    firstOn: r.first_on,
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
