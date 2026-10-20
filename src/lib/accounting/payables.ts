// Accounts Payable (AP): vendor & subcontractor bills, Melio/ACH/check
// disbursements, aging buckets, Friday pay-run cutoffs, and compliance holds
// (conditional/unconditional lien waivers & COI expiry). Server-only.

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { addDays, localDay } from "@/lib/crew/time";
import { listTrades, resolveTrade, type Trade } from "./trades";

export type BillStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "on_hold"
  | "scheduled"
  | "partial"
  | "paid"
  | "void";

export type BillPaymentItem = {
  id: string;
  billId: string;
  paidOn: string;
  amountCents: number;
  method: string;
  reference: string | null;
  melioPaymentId: string | null;
  waiverType: string | null;
  notes: string | null;
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
  holdReason: string | null;
  waiverRequired: boolean;
  waiverReceivedOn: string | null;
  paymentMethod: string;
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
  vendor_name: string;
  vendor_kind: string;
  sub_id: string | null;
  job_id: string | null;
  crew_job_id: string | null;
  bid_package_id: string | null;
  purchase_trip_key: string | null;
  trade: string;
  issued_on: string;
  due_on: string;
  amount_cents: number;
  retainage_cents: number;
  status: BillStatus;
  hold_reason: string | null;
  waiver_required: boolean;
  waiver_received_on: string | null;
  payment_method: string | null;
  description: string;
  notes: string | null;
};

type DbBillPaymentRow = {
  id: string;
  bill_id: string;
  paid_on: string;
  amount_cents: number;
  method: string;
  reference: string | null;
  melio_payment_id: string | null;
  waiver_type: string | null;
  notes: string | null;
  voided_at: string | null;
};

type DbSubRow = {
  id: string;
  name: string;
  coi_on_file: boolean;
  coi_expires_at: string | null;
  w9_on_file: boolean;
};

const STATUS_LABELS: Record<BillStatus, string> = {
  draft: "Draft",
  pending_approval: "Pending PM approval",
  approved: "Approved for pay run",
  on_hold: "On hold (compliance)",
  scheduled: "Scheduled (Melio/ACH)",
  partial: "Partially paid",
  paid: "Paid",
  void: "Void",
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

export async function loadPayables(today = localDay()): Promise<{
  rows: PayableRow[];
  payments: BillPaymentItem[];
  trades: Trade[];
  fridayCutoff: string;
}> {
  const db = getSupabaseAdmin();
  const [billsRes, payRes, subsRes, crewJobsRes, billingJobsRes, trades] = await Promise.all([
    db.from("bills").select("*").neq("status", "void").order("issued_on", { ascending: false }),
    db.from("bill_payments").select("*").is("voided_at", null).order("paid_on", { ascending: false }),
    db.from("subs").select("id,name,coi_on_file,coi_expires_at,w9_on_file"),
    db.from("crew_jobs").select("id,name"),
    db.from("jobs").select("id,name,crew_job_id"),
    listTrades(),
  ]);

  if (billsRes.error) throw new Error(`bills: ${billsRes.error.message}`);
  if (payRes.error) throw new Error(`bill_payments: ${payRes.error.message}`);

  const payments: BillPaymentItem[] = ((payRes.data ?? []) as DbBillPaymentRow[]).map((p) => ({
    id: p.id,
    billId: p.bill_id,
    paidOn: p.paid_on,
    amountCents: Number(p.amount_cents) || 0,
    method: p.method,
    reference: p.reference,
    melioPaymentId: p.melio_payment_id,
    waiverType: p.waiver_type,
    notes: p.notes,
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

  const rows = ((billsRes.data ?? []) as DbBillRow[]).map((b): PayableRow => {
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

    const pastDue = balanceCents > 0 ? daysBetween(b.due_on, today) : 0;
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
      if (!sub.coi_on_file) coiStatus = "missing";
      else if (sub.coi_expires_at && sub.coi_expires_at < today) coiStatus = "expired";
      else coiStatus = "valid";
    }

    return {
      id: b.id,
      billNumber: b.bill_number,
      vendorName: b.vendor_name,
      vendorKind: b.vendor_kind,
      subId: b.sub_id,
      jobId: rawCrewJobId ?? b.job_id ?? "overhead",
      rawCrewJobId,
      billingJobId,
      job: jobLabel,
      trade: t?.key ?? "general",
      tradeLabel: t?.label ?? "General conditions",
      issuedOn: b.issued_on,
      dueOn: b.due_on,
      amountCents,
      retainageCents,
      paidCents,
      balanceCents,
      status: b.status,
      statusLabel: STATUS_LABELS[b.status] ?? b.status,
      holdReason: b.hold_reason,
      waiverRequired: b.waiver_required,
      waiverReceivedOn: b.waiver_received_on,
      paymentMethod: b.payment_method ?? "melio",
      purchaseTripKey: b.purchase_trip_key,
      bidPackageId: b.bid_package_id,
      description: b.description || "",
      notes: b.notes,
      agingBucket,
      daysPastDue: Math.max(0, pastDue),
      dueByFriday: balanceCents > 0 && b.due_on <= fridayCutoff,
      coiStatus,
      coiExpiresAt: sub?.coi_expires_at ?? null,
      w9OnFile: sub ? sub.w9_on_file : null,
    };
  });

  return { rows, payments, trades, fridayCutoff };
}

export async function loadPayableBill(id: string): Promise<{
  bill: PayableRow;
  payments: BillPaymentItem[];
  otherVendorBills: PayableRow[];
  bidPackage: { id: string; title: string; trade: string; status: string } | null;
} | null> {
  const { rows, payments } = await loadPayables();
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
