// Accounts Payable (AP): vendor & subcontractor bills, Melio/ACH/check
// disbursements, aging buckets, Friday pay-run cutoffs, and compliance holds
// (conditional/unconditional lien waivers & COI expiry). Server-only.

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { addDays, localDay } from "@/lib/crew/time";
import { listTrades, resolveTrade, type Trade } from "./trades";
import { readAll } from "@/lib/supabase/paged";

export type BillStatus =
  | "draft"
  | "needs_approval"
  | "hold_waiver"
  | "hold_coi"
  | "open"
  | "scheduled"
  | "partial"
  | "paid"
  | "disputed"
  | "void";

export type WaiverStatus = "not_required" | "missing" | "conditional_received" | "final_received";

export type BillPaymentItem = {
  id: string;
  billId: string;
  paidOn: string;
  amountCents: number;
  feeCents: number;
  method: string;
  reference: string | null;
  waiverCollected: boolean;
  recordedBy: string;
  note: string | null;
};

export type PayableRow = {
  id: string;
  billNumber: string;
  vendorName: string;
  vendorKind: string;
  subId: string | null;
  jobId: string;
  rawCrewJobId: string | null;
  billingJobId: string | null;
  job: string;
  trade: string;
  tradeLabel: string;
  issuedOn: string;
  dueOn: string;
  amountCents: number;
  retainageCents: number;
  paidCents: number;
  balanceCents: number;
  status: BillStatus;
  statusLabel: string;
  isOnHold: boolean;
  holdReason: string | null;
  waiverStatus: WaiverStatus;
  waiverLabel: string;
  paymentTerms: string;
  paymentTermsLabel: string;
  purchaseTripKey: string | null;
  bidPackageId: string | null;
  description: string;
  notes: string | null;
  agingBucket: string;
  daysPastDue: number;
  dueByFriday: boolean;
  coiStatus: "valid" | "expired" | "missing" | "n/a";
  coiExpiresAt: string | null;
  w9OnFile: boolean | null;
};

type DbBillRow = {
  id: string;
  bill_number: string;
  kind: string;
  vendor_name: string;
  sub_id: string | null;
  job_id: string | null;
  crew_job_id: string | null;
  bid_package_id: string | null;
  purchase_trip_key: string | null;
  trade: string;
  issued_on: string;
  due_on: string | null;
  amount_cents: number;
  retainage_cents: number;
  status: BillStatus;
  waiver_status: WaiverStatus;
  payment_terms: string;
  approved_by: string;
  approved_at: string | null;
  description: string;
  note: string;
};

type DbBillPaymentRow = {
  id: string;
  bill_id: string;
  paid_on: string;
  amount_cents: number;
  fee_cents: number;
  method: string;
  reference: string;
  waiver_collected: boolean;
  recorded_by: string;
  note: string;
  voided_at: string | null;
};

type DbSubRow = {
  id: string;
  name: string;
  coi_expires_on: string | null;
  w9_on_file: boolean;
};

const STATUS_LABELS: Record<BillStatus, string> = {
  draft: "Draft",
  needs_approval: "Needs PM approval",
  hold_waiver: "Hold · Missing waiver",
  hold_coi: "Hold · Expired COI",
  open: "Approved / Open",
  scheduled: "Scheduled (Friday run)",
  partial: "Partially paid",
  paid: "Paid",
  disputed: "Disputed",
  void: "Void",
};

const WAIVER_LABELS: Record<WaiverStatus, string> = {
  not_required: "Not required",
  missing: "Waiver missing",
  conditional_received: "Conditional waiver on file",
  final_received: "Unconditional final waiver on file",
};

const TERMS_LABELS: Record<string, string> = {
  friday_run: "Friday Melio/ACH run",
  pay_when_paid: "Pay-when-paid",
  net_15: "Net 15",
  net_30: "Net 30",
  due_on_receipt: "Due on receipt",
};

function daysBetween(fromDay: string, toDay: string): number {
  const a = new Date(`${fromDay}T12:00:00Z`).getTime();
  const b = new Date(`${toDay}T12:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

/** Next Friday (or today if today is Friday) in Phoenix YYYY-MM-DD. */
export function nextFridayDay(today: string): string {
  const d = new Date(`${today}T12:00:00Z`);
  const dow = d.getUTCDay(); // 0=Sun..5=Fri..6=Sat
  const diff = dow <= 5 ? 5 - dow : 6;
  return addDays(today, diff);
}

/** True when the bills tables (0031) are not in this database yet: the hub shows a notice, not an error. */
export function missingPayables(e: unknown): boolean {
  return /does not exist|schema cache|could not find the (table|relation)/i.test((e as { message?: string } | null)?.message ?? "");
}

export async function loadPayables(today = localDay()): Promise<{
  rows: PayableRow[];
  payments: BillPaymentItem[];
  trades: Trade[];
  fridayCutoff: string;
  /** Migration 0031 is not applied: no bills to show, and nothing is wrong with the page. */
  missing: boolean;
  /** More bills or payments than the read cap (paged.ts): totals are short, and the page says so. */
  capped: boolean;
}> {
  const db = getSupabaseAdmin();
  // Paged: PostgREST hands back at most max_rows (1000) per request.
  const reads = Promise.all([
    readAll<DbBillRow>((from, to) => db.from("bills").select("*").neq("status", "void").order("issued_on", { ascending: false }).order("id", { ascending: true }).range(from, to), "bills"),
    readAll<DbBillPaymentRow>((from, to) => db.from("bill_payments").select("*").is("voided_at", null).order("paid_on", { ascending: false }).order("id", { ascending: true }).range(from, to), "bill_payments"),
  ]);
  const [paged, subsRes, crewJobsRes, billingJobsRes, trades] = await Promise.all([
    reads.then(
      (r) => ({ ok: true as const, r }),
      (e: unknown) => ({ ok: false as const, e }),
    ),
    db.from("subs").select("id,name,coi_expires_on,w9_on_file"),
    db.from("crew_jobs").select("id,name"),
    db.from("jobs").select("id,name,crew_job_id"),
    listTrades(),
  ]);

  if (!paged.ok) {
    if (missingPayables(paged.e)) return { rows: [], payments: [], trades, fridayCutoff: nextFridayDay(today), missing: true, capped: false };
    throw paged.e;
  }
  const [billsRead, payRead] = paged.r;

  const payments: BillPaymentItem[] = payRead.rows.map((p) => ({
    id: p.id,
    billId: p.bill_id,
    paidOn: p.paid_on,
    amountCents: Number(p.amount_cents) || 0,
    feeCents: Number(p.fee_cents) || 0,
    method: p.method,
    reference: p.reference || null,
    waiverCollected: Boolean(p.waiver_collected),
    recordedBy: p.recorded_by || "",
    note: p.note || null,
  }));

  const paidByBill = new Map<string, number>();
  for (const p of payments) {
    paidByBill.set(p.billId, (paidByBill.get(p.billId) ?? 0) + p.amountCents);
  }

  const subsById = new Map(((subsRes.data ?? []) as DbSubRow[]).map((s) => [s.id, s]));
  const crewJobNames = new Map(((crewJobsRes.data ?? []) as { id: string; name: string }[]).map((j) => [j.id, j.name]));
  const billingJobsById = new Map(
    ((billingJobsRes.data ?? []) as { id: string; name: string; crew_job_id: string | null }[]).map((j) => [j.id, j]),
  );
  const billingByCrewId = new Map<string, string>();
  for (const bj of billingJobsById.values()) {
    if (bj.crew_job_id) billingByCrewId.set(bj.crew_job_id, bj.id);
  }

  const fridayCutoff = nextFridayDay(today);

  const rows = billsRead.rows.map((b): PayableRow => {
    const amountCents = Number(b.amount_cents) || 0;
    const retainageCents = Number(b.retainage_cents) || 0;
    const paidCents = paidByBill.get(b.id) ?? 0;
    const balanceCents = b.status === "paid" ? 0 : Math.max(0, amountCents - paidCents);
    const t = resolveTrade(b.trade || "general", trades);

    const rawCrewJobId = b.crew_job_id ?? (b.job_id ? (billingJobsById.get(b.job_id)?.crew_job_id ?? null) : null);
    const billingJobId = b.job_id ?? (rawCrewJobId ? (billingByCrewId.get(rawCrewJobId) ?? null) : null);
    const jobLabel = rawCrewJobId
      ? (crewJobNames.get(rawCrewJobId) ?? rawCrewJobId)
      : b.job_id
        ? (billingJobsById.get(b.job_id)?.name ?? b.job_id)
        : "Shop & Overhead";

    const dueOn = b.due_on || b.issued_on;
    const pastDue = balanceCents > 0 ? daysBetween(dueOn, today) : 0;
    let agingBucket = "Paid";
    if (balanceCents > 0) {
      if (pastDue <= 0) agingBucket = "Current (not yet due)";
      else if (pastDue <= 30) agingBucket = "1–30 days past due";
      else if (pastDue <= 60) agingBucket = "31–60 days past due";
      else agingBucket = "61+ days past due";
    }

    const sub = b.sub_id ? subsById.get(b.sub_id) : undefined;
    let coiStatus: PayableRow["coiStatus"] = "n/a";
    if (sub) {
      if (!sub.coi_expires_on) coiStatus = "missing";
      else if (sub.coi_expires_on < today) coiStatus = "expired";
      else coiStatus = "valid";
    }

    const isOnHold =
      b.status === "hold_waiver" ||
      b.status === "hold_coi" ||
      b.status === "needs_approval" ||
      b.waiver_status === "missing" ||
      coiStatus === "expired";

    let holdReason: string | null = null;
    if (b.status === "hold_waiver" || b.waiver_status === "missing") {
      holdReason = b.note || "Missing conditional progress lien waiver (SOP-004)";
    } else if (b.status === "hold_coi" || coiStatus === "expired") {
      holdReason = b.note || "Subcontractor COI expired — renewal required before payment";
    } else if (b.status === "needs_approval") {
      holdReason = b.note || "Awaiting PM field verification & sign-off";
    }

    return {
      id: b.id,
      billNumber: b.bill_number,
      vendorName: b.vendor_name,
      vendorKind: b.kind,
      subId: b.sub_id,
      jobId: rawCrewJobId ?? b.job_id ?? "overhead",
      rawCrewJobId,
      billingJobId,
      job: jobLabel,
      trade: t?.key ?? "general",
      tradeLabel: t?.label ?? "General conditions",
      issuedOn: b.issued_on,
      dueOn,
      amountCents,
      retainageCents,
      paidCents,
      balanceCents,
      status: b.status,
      statusLabel: STATUS_LABELS[b.status] ?? b.status,
      isOnHold,
      holdReason,
      waiverStatus: b.waiver_status,
      waiverLabel: WAIVER_LABELS[b.waiver_status] ?? b.waiver_status,
      paymentTerms: b.payment_terms,
      paymentTermsLabel: TERMS_LABELS[b.payment_terms] ?? b.payment_terms,
      purchaseTripKey: b.purchase_trip_key,
      bidPackageId: b.bid_package_id,
      description: b.description || "",
      notes: b.note || null,
      agingBucket,
      daysPastDue: Math.max(0, pastDue),
      dueByFriday: balanceCents > 0 && dueOn <= fridayCutoff,
      coiStatus,
      coiExpiresAt: sub?.coi_expires_on ?? null,
      w9OnFile: sub ? sub.w9_on_file : null,
    };
  });

  return { rows, payments, trades, fridayCutoff, missing: false, capped: billsRead.capped || payRead.capped };
}

export async function loadPayableBill(id: string): Promise<{ missing: true } | {
  missing?: false;
  bill: PayableRow;
  payments: BillPaymentItem[];
  otherVendorBills: PayableRow[];
  bidPackage: { id: string; title: string; trade: string; status: string } | null;
} | null> {
  const { rows, payments, missing } = await loadPayables();
  if (missing) return { missing: true };
  const bill = rows.find((r) => r.id === id);
  if (!bill) return null;

  const billPayments = payments.filter((p) => p.billId === bill.id);
  const otherVendorBills = rows.filter((r) => r.vendorName === bill.vendorName && r.id !== bill.id);

  let bidPackage: { id: string; title: string; trade: string; status: string } | null = null;
  if (bill.bidPackageId) {
    const { data } = await getSupabaseAdmin()
      .from("bid_packages")
      .select("id,title,trade,status")
      .eq("id", bill.bidPackageId)
      .maybeSingle();
    if (data) {
      bidPackage = data as { id: string; title: string; trade: string; status: string };
    }
  }

  return {
    bill,
    payments: billPayments,
    otherVendorBills,
    bidPackage,
  };
}
