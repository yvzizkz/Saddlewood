import { getSupabaseAdmin } from "@/lib/supabase/admin";

// Money in (supabase/migrations/0014_payments.sql). A payment is recorded
// with its allocations in one go; a mistake is voided with a reason.

export const PAYMENT_METHODS = ["check", "wire", "ach", "melio", "zelle", "card", "cash", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export type Allocation = { documentId: string; lineIndex: number | null; amountCents: number };

export type Payment = {
  id: string;
  clientId: string | null;
  receivedOn: string;
  amountCents: number;
  feeCents: number;
  method: PaymentMethod;
  reference: string;
  note: string;
  evidence: string;
  recordedBy: string;
  recordedAt: string;
  voidedAt: string | null;
  voidReason: string;
  allocations: Allocation[];
};

type PaymentRow = {
  id: string;
  client_id: string | null;
  received_on: string;
  amount_cents: number | string;
  fee_cents: number | string;
  method: PaymentMethod;
  reference: string;
  note: string;
  evidence: string;
  recorded_by: string;
  recorded_at: string;
  voided_at: string | null;
  void_reason: string;
};
type AllocationRow = { payment_id: string; document_id: string; line_index: number | null; amount_cents: number | string };

function fail(what: string, message: string): never {
  throw new Error(`${what} failed: ${message}`);
}

function toPayment(r: PaymentRow, allocations: AllocationRow[]): Payment {
  return {
    id: r.id,
    clientId: r.client_id,
    receivedOn: r.received_on,
    amountCents: Number(r.amount_cents),
    feeCents: Number(r.fee_cents),
    method: r.method,
    reference: r.reference,
    note: r.note,
    evidence: r.evidence,
    recordedBy: r.recorded_by,
    recordedAt: r.recorded_at,
    voidedAt: r.voided_at,
    voidReason: r.void_reason,
    allocations: allocations
      .filter((a) => a.payment_id === r.id)
      .map((a) => ({ documentId: a.document_id, lineIndex: a.line_index, amountCents: Number(a.amount_cents) })),
  };
}

export type PaymentInput = {
  clientId: string | null;
  receivedOn: string;
  amountCents: number;
  feeCents?: number;
  method: PaymentMethod;
  reference?: string;
  note?: string;
  evidence?: string;
  recordedBy: string;
  allocations: Allocation[];
};

/** What the input must look like before anything is written. Returns the problem, or null. */
export function checkPaymentInput(p: PaymentInput): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.receivedOn) || Number.isNaN(Date.parse(`${p.receivedOn}T12:00:00Z`))) return "receivedOn must be a date (YYYY-MM-DD)";
  if (!Number.isInteger(p.amountCents) || p.amountCents <= 0) return "amount must be whole cents, above zero";
  const fee = p.feeCents ?? 0;
  if (!Number.isInteger(fee) || fee < 0 || fee >= p.amountCents) return "fee must be whole cents, below the amount";
  if (!PAYMENT_METHODS.includes(p.method)) return "method is not one we know";
  if (!Array.isArray(p.allocations) || p.allocations.length === 0) return "a payment must be applied to at least one document";
  let sum = 0;
  for (const a of p.allocations) {
    if (!/^[0-9a-f-]{36}$/i.test(a.documentId)) return "allocation needs a document";
    if (a.lineIndex !== null && (!Number.isInteger(a.lineIndex) || a.lineIndex < 0)) return "allocation line must be a line number";
    if (!Number.isInteger(a.amountCents) || a.amountCents <= 0) return "allocation amount must be whole cents, above zero";
    sum += a.amountCents;
  }
  if (sum > p.amountCents) return "allocations add up to more than the payment";
  return null;
}

export async function recordPayment(p: PaymentInput): Promise<Payment> {
  const problem = checkPaymentInput(p);
  if (problem) throw new Error(problem);
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("payments")
    .insert({
      client_id: p.clientId,
      received_on: p.receivedOn,
      amount_cents: p.amountCents,
      fee_cents: p.feeCents ?? 0,
      method: p.method,
      reference: (p.reference ?? "").trim().slice(0, 120),
      note: (p.note ?? "").trim().slice(0, 1000),
      evidence: (p.evidence ?? "").trim().slice(0, 300),
      recorded_by: p.recordedBy,
    })
    .select("*")
    .single();
  if (error) fail("record payment", error.message);
  const row = data as PaymentRow;
  const { data: allocs, error: aerr } = await db
    .from("payment_allocations")
    .insert(p.allocations.map((a) => ({ payment_id: row.id, document_id: a.documentId, line_index: a.lineIndex, amount_cents: a.amountCents })))
    .select("*");
  if (aerr) {
    // The payment row exists without its allocations: void it so it never counts.
    await db.from("payments").update({ voided_at: new Date().toISOString(), void_reason: `allocations failed: ${aerr.message}` }).eq("id", row.id);
    fail("apply payment", aerr.message);
  }
  return toPayment(row, (allocs ?? []) as AllocationRow[]);
}

export async function voidPayment(id: string, reason: string, now: Date = new Date()): Promise<boolean> {
  const why = reason.trim();
  if (!why) throw new Error("voiding a payment needs a reason");
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("payments")
    .update({ voided_at: now.toISOString(), void_reason: why })
    .eq("id", id)
    .is("voided_at", null)
    .select("id")
    .maybeSingle();
  if (error) fail("void payment", error.message);
  return Boolean(data);
}

/** Payments applied to a document, newest first, voided ones included and marked. */
export async function paymentsForDocument(documentId: string): Promise<Payment[]> {
  const db = getSupabaseAdmin();
  const { data: allocs, error } = await db.from("payment_allocations").select("*").eq("document_id", documentId);
  if (error) fail("list allocations", error.message);
  const ids = [...new Set((allocs ?? []).map((a) => (a as AllocationRow).payment_id))];
  if (ids.length === 0) return [];
  const { data: rows, error: perr } = await db.from("payments").select("*").in("id", ids).order("received_on", { ascending: false });
  if (perr) fail("list payments", perr.message);
  // All allocations of those payments, so a payment split across documents shows whole.
  const { data: all, error: allErr } = await db.from("payment_allocations").select("*").in("payment_id", ids);
  if (allErr) fail("list allocations", allErr.message);
  return (rows ?? []).map((r) => toPayment(r as PaymentRow, (all ?? []) as AllocationRow[]));
}

/** Cents paid against each document (and per line), counting only payments that stand. */
export async function paidByDocument(documentIds: string[]): Promise<Map<string, { total: number; byLine: Map<number, number> }>> {
  const out = new Map<string, { total: number; byLine: Map<number, number> }>();
  if (documentIds.length === 0) return out;
  const db = getSupabaseAdmin();
  const { data: allocs, error } = await db.from("payment_allocations").select("*").in("document_id", documentIds);
  if (error) fail("list allocations", error.message);
  const rows = (allocs ?? []) as AllocationRow[];
  const ids = [...new Set(rows.map((a) => a.payment_id))];
  const standing = new Set<string>();
  if (ids.length) {
    const { data: ps, error: perr } = await db.from("payments").select("id").in("id", ids).is("voided_at", null);
    if (perr) fail("list payments", perr.message);
    for (const p of ps ?? []) standing.add((p as { id: string }).id);
  }
  for (const a of rows) {
    if (!standing.has(a.payment_id)) continue;
    const entry = out.get(a.document_id) ?? { total: 0, byLine: new Map<number, number>() };
    const cents = Number(a.amount_cents);
    entry.total += cents;
    if (a.line_index !== null) entry.byLine.set(a.line_index, (entry.byLine.get(a.line_index) ?? 0) + cents);
    out.set(a.document_id, entry);
  }
  return out;
}
