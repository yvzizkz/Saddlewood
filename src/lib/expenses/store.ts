// The bot's expenses (Zelle payments, texted receipts) in the one spend
// ledger, purchases (migration 0053). Server-only, service role.
//
// The old Expenses page kept them as JSON in progress_trackers
// ('accounting-state') with seed numbers; that row is left as it was, and
// 0053 copied its real items here. Owners put each line on a job from "Tag
// spend" on Purchases; the bot's "Z12 Powell Materials" lands the same way,
// through the register-name rules every purchase uses.

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { listAliases, listTradeMap, upsertPurchases } from "@/lib/crew/purchaseQueries";
import { linkLines, type PurchaseLine } from "@/lib/crew/purchases";
import { listJobs } from "@/lib/crew/queries";
import { asExpense, expenseRef, spendLine, type SpendRow } from "./spend";
import type { ExpenseItem } from "./types";

const SPEND_SOURCES = ["zelle", "receipt"];
const COLS = "source, source_key, purchased_on, vendor, order_ref, job_name_raw, job_id, job_manual, department, class, sku, description, qty, line_total_cents, meta, created_at";

type Row = SpendRow & { job_manual: boolean; department: string; class: string; sku: string; qty: number | string };

/** Link the lines (alias, job name, trade) and store them, keeping what a person set by hand. */
async function store(lines: PurchaseLine[]): Promise<void> {
  const [aliases, rules, jobs] = await Promise.all([listAliases(), listTradeMap(), listJobs()]);
  const { rows } = linkLines(lines, aliases, rules, jobs.filter((j) => j.active));
  await upsertPurchases(rows);
}

async function find(ref: ReturnType<typeof expenseRef>): Promise<Row | null> {
  if (!ref) return null;
  const db = getSupabaseAdmin();
  let q = db.from("purchases").select(COLS).in("source", SPEND_SOURCES);
  q = "id" in ref ? q.eq("meta->>expenseId", ref.id) : q.eq("meta->>n", String(ref.n));
  const { data, error } = await q.order("created_at", { ascending: false }).limit(1);
  if (error) throw new Error(`purchases read failed: ${error.message}`);
  return ((data ?? [])[0] as Row | undefined) ?? null;
}

async function reread(key: string): Promise<ExpenseItem> {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("purchases").select(COLS).eq("source_key", key).maybeSingle();
  if (error || !data) throw new Error(`purchases read failed: ${error?.message ?? "row missing"}`);
  return asExpense(data as Row);
}

/** The stored line as a line to send again, with changes. */
function lineOf(r: Row, change: { jobNameRaw?: string; meta: Record<string, unknown> }): PurchaseLine {
  return {
    source: r.source === "zelle" ? "zelle" : "receipt",
    sourceKey: r.source_key,
    purchasedOn: r.purchased_on,
    vendor: r.vendor,
    store: "",
    orderRef: r.order_ref,
    jobNameRaw: change.jobNameRaw ?? r.job_name_raw,
    department: r.department,
    class: r.class,
    sku: r.sku,
    description: r.description,
    qty: Number(r.qty) || 1,
    lineTotalCents: r.line_total_cents,
    // The name decides again; a job a person set stays (keepManual).
    jobId: null,
    meta: change.meta,
  };
}

export type AddResult = { ok: true; item: ExpenseItem; created: boolean } | { ok: false; error: string };

/**
 * A new item from the bot. Sending it again is safe (same key). A receipt
 * filed in the app is already a line (app:<entry id>): nothing is added.
 */
export async function addExpense(expense: unknown): Promise<AddResult> {
  const input = spendLine(expense);
  if (input.kind === "bad") return { ok: false, error: input.error };
  if (input.kind === "app") return { ok: true, item: expense as ExpenseItem, created: false };
  const before = await find({ id: String(input.line.meta.expenseId) });
  // A resend keeps the job an owner or a "Z12 ..." text has given it since.
  const line = before ? { ...input.line, jobNameRaw: before.job_name_raw || input.line.jobNameRaw, meta: { ...before.meta, ...input.line.meta } } : input.line;
  await store([line]);
  return { ok: true, item: await reread(line.sourceKey), created: !before };
}

/** "Z12 Powell Materials": the line takes the job name, and the job it names. */
export async function categorizeExpense(idOrN: unknown, project: string, expenseType: string, decidedBy: string): Promise<ExpenseItem | null> {
  const r = await find(expenseRef(idOrN));
  if (!r) return null;
  const { ignored: _was, ...meta } = r.meta ?? {};
  void _was;
  await store([lineOf(r, { jobNameRaw: project.trim().slice(0, 160), meta: { ...meta, category: expenseType.trim().slice(0, 60), decidedBy } })]);
  return reread(r.source_key);
}

/** "Z12 dismiss": set aside, off every job unless a person put it on one. */
export async function dismissExpense(idOrN: unknown, decidedBy: string): Promise<ExpenseItem | null> {
  const r = await find(expenseRef(idOrN));
  if (!r) return null;
  const db = getSupabaseAdmin();
  const { error } = await db
    .from("purchases")
    .update({ meta: { ...(r.meta ?? {}), ignored: true, decidedBy }, ...(r.job_manual ? {} : { job_id: null }), updated_at: new Date().toISOString() })
    .eq("source_key", r.source_key);
  if (error) throw new Error(`purchases update failed: ${error.message}`);
  return reread(r.source_key);
}

/** The bot's items, newest first, in the old shape. */
export async function listExpenses(limit = 300): Promise<ExpenseItem[]> {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("purchases").select(COLS).in("source", SPEND_SOURCES).order("purchased_on", { ascending: false }).limit(limit);
  if (error) throw new Error(`purchases read failed: ${error.message}`);
  return ((data ?? []) as Row[]).map((r) => asExpense(r));
}

export type UntaggedSpend = {
  sourceKey: string;
  source: string;
  purchasedOn: string;
  vendor: string;
  description: string;
  cents: number;
  /** What the bot or the import had typed, when no rule matched it. */
  typed: string;
};

/**
 * Spend on no job, with no name to answer by, that nobody set aside: a Zelle
 * payment nobody tagged, a receipt or a register line with no job typed. A
 * line with a name waits in "Which job is this?" instead, answered once for
 * every line under it; a receipt a Pro Xtra trip covers is not counted.
 */
export async function untaggedSpend(limit = 50): Promise<{ rows: UntaggedSpend[]; count: number }> {
  const db = getSupabaseAdmin();
  const { data, error, count } = await db
    .from("purchases")
    .select("source, source_key, purchased_on, vendor, job_name_raw, description, line_total_cents", { count: "exact" })
    .is("job_id", null)
    .eq("job_key", "")
    .or("meta->>ignored.is.null,meta->>ignored.neq.true")
    .is("meta->>coveredBy", null)
    .order("purchased_on", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`purchases read failed: ${error.message}`);
  const rows = (data ?? []) as { source: string; source_key: string; purchased_on: string; vendor: string; job_name_raw: string; description: string; line_total_cents: number }[];
  return {
    count: count ?? rows.length,
    rows: rows.map((r) => ({
      sourceKey: r.source_key,
      source: r.source,
      purchasedOn: r.purchased_on,
      vendor: r.vendor,
      description: r.description,
      cents: r.line_total_cents,
      typed: r.job_name_raw,
    })),
  };
}

/** Names the spend was filed under that are no crew job yet (Crew admin's "Add a job" hints). */
export async function spendJobNames(limit = 12): Promise<string[]> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("purchases")
    .select("job_name_raw")
    .in("source", SPEND_SOURCES)
    .is("job_id", null)
    .neq("job_name_raw", "")
    .order("purchased_on", { ascending: false })
    .limit(200);
  if (error) throw new Error(`purchases read failed: ${error.message}`);
  const seen = new Map<string, string>();
  for (const r of (data ?? []) as { job_name_raw: string }[]) {
    const k = r.job_name_raw.trim().toLowerCase();
    if (k.length >= 2 && !seen.has(k)) seen.set(k, r.job_name_raw.trim());
  }
  return [...seen.values()].slice(0, limit);
}
