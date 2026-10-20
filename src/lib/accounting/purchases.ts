// Purchases & materials: every receipt line in a range, categorized to a trade,
// linked to its field job (and billing job), rolled up by trip, vendor and store.
// Server-only.

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { readAll } from "@/lib/supabase/paged";
import { listUnmatchedPurchases } from "@/lib/crew/purchaseQueries";
import { tripKey as computeTripKey, type UnmatchedPurchase } from "@/lib/crew/purchases";
import { listTrades, resolveTrade, type Trade } from "./trades";

export type PurchaseItemRow = {
  id: string;
  sourceKey: string;
  tripKey: string;
  source: string;
  purchasedOn: string;
  vendor: string;
  store: string;
  orderRef: string;
  /** Either the field job_id or "unassigned" for drill-down grouping. */
  jobId: string;
  /** Null when the line is not yet matched to a field job. */
  rawJobId: string | null;
  billingJobId: string | null;
  job: string;
  jobNameRaw: string;
  jobKey: string;
  trade: string;
  tradeLabel: string;
  tradeManual: boolean;
  department: string;
  class: string;
  sku: string;
  description: string;
  qty: number;
  unitCents: number | null;
  lineTotalCents: number;
  runner: string | null;
  ignored: boolean;
};

type DbPurchaseRow = {
  source: string;
  source_key: string;
  trip_key?: string | null;
  purchased_on: string;
  vendor: string;
  store: string;
  order_ref: string;
  job_name_raw: string;
  job_key: string;
  job_id: string | null;
  trade: string;
  trade_manual?: boolean | null;
  department: string;
  class: string;
  sku: string;
  description: string;
  qty: number | string;
  line_total_cents: number;
  meta: Record<string, unknown> | null;
};

export async function loadPurchases(
  fromDay: string,
  toDay: string,
): Promise<{
  rows: PurchaseItemRow[];
  trades: Trade[];
  jobs: { id: string; name: string; billingJobId: string | null }[];
  unmatched: UnmatchedPurchase[];
  /** More lines than the read cap (paged.ts): totals are short, and the page says so. */
  capped: boolean;
}> {
  const db = getSupabaseAdmin();
  const [purchRead, crewJobsRes, billingJobsRes, trades, unmatchedRes] = await Promise.all([
    // Paged: PostgREST hands back at most max_rows (1000) per request, whatever .limit() asks.
    readAll<DbPurchaseRow>(
      (from, to) =>
        db
          .from("purchases")
          .select("*")
          .gte("purchased_on", fromDay)
          .lte("purchased_on", toDay)
          .order("purchased_on", { ascending: false })
          .order("source_key", { ascending: true })
          .range(from, to),
      "purchases",
    ),
    db.from("crew_jobs").select("id,name,active").order("name"),
    db.from("jobs").select("id,name,crew_job_id"),
    listTrades(),
    listUnmatchedPurchases({ limit: 50 }).catch(() => ({ names: [], older: 0, olderCents: 0, newestOn: null })),
  ]);


  const billingByCrewId = new Map<string, string>();
  for (const bj of (billingJobsRes.data ?? []) as { id: string; name: string; crew_job_id: string | null }[]) {
    if (bj.crew_job_id) billingByCrewId.set(bj.crew_job_id, bj.id);
  }

  const jobs = ((crewJobsRes.data ?? []) as { id: string; name: string; active: boolean }[])
    .filter((j) => j.active)
    .map((j) => ({
      id: j.id,
      name: j.name,
      billingJobId: billingByCrewId.get(j.id) ?? null,
    }));
  const jobNameMap = new Map(jobs.map((j) => [j.id, j.name]));

  const rows = purchRead.rows.map((r): PurchaseItemRow => {
    const qty = Number(r.qty) || 0;
    const cents = Number(r.line_total_cents) || 0;
    const t = resolveTrade(r.trade || "general", trades);
    const meta = r.meta ?? {};
    const ignored = meta.ignored === true;
    const rawJobId = r.job_id;
    const jobLabel = rawJobId
      ? jobNameMap.get(rawJobId) ?? rawJobId
      : ignored
        ? `Set aside (${r.job_name_raw || "No PO"})`
        : r.job_name_raw
          ? `Unassigned · "${r.job_name_raw}"`
          : "Unassigned";

    return {
      id: r.source_key,
      sourceKey: r.source_key,
      tripKey: r.trip_key || computeTripKey(r.source_key),
      source: r.source,
      purchasedOn: r.purchased_on,
      vendor: r.vendor || "Home Depot",
      store: r.store || "—",
      orderRef: r.order_ref || "",
      jobId: rawJobId ?? "unassigned",
      rawJobId,
      billingJobId: rawJobId ? (billingByCrewId.get(rawJobId) ?? null) : null,
      job: jobLabel,
      jobNameRaw: r.job_name_raw || "",
      jobKey: r.job_key || "",
      trade: t?.key ?? "general",
      tradeLabel: t?.label ?? "General conditions",
      tradeManual: Boolean(r.trade_manual),
      department: r.department || "",
      class: r.class || "",
      sku: r.sku || "",
      description: r.description || "",
      qty,
      unitCents: qty > 0 && cents > 0 ? Math.round(cents / qty) : null,
      lineTotalCents: cents,
      runner: typeof meta.runner === "string" ? meta.runner : null,
      ignored,
    };
  });

  return {
    rows,
    trades,
    jobs,
    unmatched: unmatchedRes.names,
    capped: purchRead.capped,
  };
}

export type PurchaseTripDetail = {
  tripKey: string;
  purchasedOn: string;
  vendor: string;
  store: string;
  orderRef: string;
  rawJobId: string | null;
  billingJobId: string | null;
  jobName: string;
  jobNameRaw: string;
  jobKey: string;
  runner: string | null;
  totalCents: number;
  lines: PurchaseItemRow[];
  linkedBill: { id: string; billNumber: string; status: string; amountCents: number } | null;
  trades: Trade[];
  jobs: { id: string; name: string; billingJobId: string | null }[];
};

export async function loadPurchaseTrip(keyOrSourceKey: string): Promise<PurchaseTripDetail | null> {
  const db = getSupabaseAdmin();
  const decoded = decodeURIComponent(keyOrSourceKey);
  const tk = computeTripKey(decoded);

  // Match either exact trip_key or exact source_key
  const [byTripRes, crewJobsRes, billingJobsRes, trades, billRes] = await Promise.all([
    db.from("purchases").select("*").or(`trip_key.eq.${tk},source_key.eq.${decoded}`).order("source_key", { ascending: true }),
    db.from("crew_jobs").select("id,name,active").order("name"),
    db.from("jobs").select("id,name,crew_job_id"),
    listTrades(),
    db.from("bills").select("id,bill_number,status,amount_cents").eq("purchase_trip_key", tk).maybeSingle(),
  ]);

  if (byTripRes.error || !byTripRes.data?.length) return null;

  const billingByCrewId = new Map<string, string>();
  for (const bj of (billingJobsRes.data ?? []) as { id: string; name: string; crew_job_id: string | null }[]) {
    if (bj.crew_job_id) billingByCrewId.set(bj.crew_job_id, bj.id);
  }

  const jobs = ((crewJobsRes.data ?? []) as { id: string; name: string; active: boolean }[])
    .filter((j) => j.active)
    .map((j) => ({
      id: j.id,
      name: j.name,
      billingJobId: billingByCrewId.get(j.id) ?? null,
    }));
  const jobNameMap = new Map(jobs.map((j) => [j.id, j.name]));

  const lines = ((byTripRes.data ?? []) as DbPurchaseRow[]).map((r): PurchaseItemRow => {
    const qty = Number(r.qty) || 0;
    const cents = Number(r.line_total_cents) || 0;
    const t = resolveTrade(r.trade || "general", trades);
    const meta = r.meta ?? {};
    const rawJobId = r.job_id;
    return {
      id: r.source_key,
      sourceKey: r.source_key,
      tripKey: r.trip_key || computeTripKey(r.source_key),
      source: r.source,
      purchasedOn: r.purchased_on,
      vendor: r.vendor || "Home Depot",
      store: r.store || "—",
      orderRef: r.order_ref || "",
      jobId: rawJobId ?? "unassigned",
      rawJobId,
      billingJobId: rawJobId ? (billingByCrewId.get(rawJobId) ?? null) : null,
      job: rawJobId ? (jobNameMap.get(rawJobId) ?? rawJobId) : r.job_name_raw ? `Unassigned · "${r.job_name_raw}"` : "Unassigned",
      jobNameRaw: r.job_name_raw || "",
      jobKey: r.job_key || "",
      trade: t?.key ?? "general",
      tradeLabel: t?.label ?? "General conditions",
      tradeManual: Boolean(r.trade_manual),
      department: r.department || "",
      class: r.class || "",
      sku: r.sku || "",
      description: r.description || "",
      qty,
      unitCents: qty > 0 && cents > 0 ? Math.round(cents / qty) : null,
      lineTotalCents: cents,
      runner: typeof meta.runner === "string" ? meta.runner : null,
      ignored: meta.ignored === true,
    };
  });

  const first = lines[0];
  const totalCents = lines.reduce((a, l) => a + l.lineTotalCents, 0);
  const billData = billRes.data as { id: string; bill_number: string; status: string; amount_cents: number } | null;

  return {
    tripKey: first.tripKey,
    purchasedOn: first.purchasedOn,
    vendor: first.vendor,
    store: first.store,
    orderRef: first.orderRef,
    rawJobId: first.rawJobId,
    billingJobId: first.billingJobId,
    jobName: first.job,
    jobNameRaw: first.jobNameRaw,
    jobKey: first.jobKey,
    runner: first.runner,
    totalCents,
    lines,
    linkedBill: billData
      ? {
          id: billData.id,
          billNumber: billData.bill_number,
          status: billData.status,
          amountCents: Number(billData.amount_cents) || 0,
        }
      : null,
    trades,
    jobs,
  };
}
