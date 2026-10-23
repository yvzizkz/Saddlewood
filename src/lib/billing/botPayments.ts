// Joist payments the bot confirmed, recorded in the app too (migration 0054;
// Lando 2026-10-22: "record in BOTH for now"). Server-only.
//
// KB accounting.py records each confirmed P<n> in Joist, as it always has,
// then posts it here. One row in payments, source 'bot', external_ref 'P<n>',
// applied to the issued invoice with that number. Safe to send again: a P
// number already standing is answered with its row, and one an owner voided
// stays voided. Nothing here writes back to Joist.
//
// A Joist payment someone already entered on Money by hand is refused as a
// possible duplicate (same invoice, same amount, received within a week), so
// a person reconciles it instead of the invoice being paid twice.

import { z } from "zod";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isDay } from "@/lib/crew/time";
import { PAYMENT_METHODS, getPayment, paidByDocument, recordPayment, type Payment, type PaymentMethod } from "./payments";

/**
 * The bot's own rule (accounting.py norm_invoice_no): Melio references carry
 * AFT's job code in front and Joist pads the sequence, so 'Inv AFT123-8009-4'
 * and '8009-04' are the same invoice.
 */
export function normInvoiceNo(s: string): string {
  const parts = s.trim().toUpperCase().replace(/^(INV\s*)?AFT\d+-/, "").split("-");
  if (parts.length >= 2 && /^\d+$/.test(parts[0]) && /^\d+$/.test(parts[1])) parts[1] = String(Number(parts[1])).padStart(2, "0");
  return parts.join("-");
}

export const botPaymentSchema = z.object({
  pNumber: z.number().int().positive().max(1_000_000),
  invoice: z.string().trim().min(1).max(60),
  client: z.string().trim().max(120).default(""),
  amountCents: z.number().int().positive().max(1_000_000_000),
  receivedOn: z.string().refine(isDay, "receivedOn must be YYYY-MM-DD"),
  method: z.string().transform((m): PaymentMethod => ((PAYMENT_METHODS as readonly string[]).includes(m) ? (m as PaymentMethod) : "other")).default("other"),
  joistId: z.union([z.string(), z.number()]).transform(String).default(""),
  evidence: z.string().trim().max(300).default(""),
});
export type BotPayment = z.infer<typeof botPaymentSchema>;

export type BotPaymentResult =
  | { status: "recorded" | "already"; payment: Payment }
  /** An owner voided the app's row: it stays voided, and the bot stops sending it. */
  | { status: "voided"; paymentId: string }
  | { status: "no_invoice" | "ambiguous" | "overpays" | "possible_duplicate"; detail: string };

/** How far apart, in days, a Money entry and the bot's received date can be and still look like the same payment. */
export const DUPLICATE_WINDOW_DAYS = 7;

/** A payment a person recorded on Money, as it stands on this invoice. */
export type MoneyEntry = { id: string; receivedOn: string; amountCents: number; onInvoiceCents: number; reference: string };

const dayNumber = (d: string) => Date.parse(`${d}T12:00:00Z`) / 86_400_000;

/** The Money entry that looks like this bot payment (same amount, within the window), or null. */
export function possibleDuplicate(entries: MoneyEntry[], p: Pick<BotPayment, "amountCents" | "receivedOn">): MoneyEntry | null {
  return (
    entries.find(
      (e) => (e.amountCents === p.amountCents || e.onInvoiceCents === p.amountCents) && Math.abs(dayNumber(e.receivedOn) - dayNumber(p.receivedOn)) <= DUPLICATE_WINDOW_DAYS,
    ) ?? null
  );
}

/** Standing payments recorded on Money (source 'app') that are applied to this document. */
async function moneyEntries(documentId: string): Promise<MoneyEntry[]> {
  const db = getSupabaseAdmin();
  const { data: allocs, error } = await db.from("payment_allocations").select("payment_id, amount_cents").eq("document_id", documentId);
  if (error) throw new Error(`payment_allocations read failed: ${error.message}`);
  const onInvoice = new Map<string, number>();
  for (const a of (allocs ?? []) as { payment_id: string; amount_cents: number | string }[]) onInvoice.set(a.payment_id, (onInvoice.get(a.payment_id) ?? 0) + Number(a.amount_cents));
  if (!onInvoice.size) return [];
  const { data: rows, error: perr } = await db
    .from("payments")
    .select("id, received_on, amount_cents, reference")
    .in("id", [...onInvoice.keys()])
    .eq("source", "app")
    .is("voided_at", null);
  if (perr) throw new Error(`payments read failed: ${perr.message}`);
  return ((rows ?? []) as { id: string; received_on: string; amount_cents: number | string; reference: string }[]).map((r) => ({
    id: r.id,
    receivedOn: r.received_on,
    amountCents: Number(r.amount_cents),
    onInvoiceCents: onInvoice.get(r.id) ?? 0,
    reference: r.reference,
  }));
}

const ref = (n: number) => `P${n}`;

type Standing = { id: string; voided_at: string | null; void_reason: string };

async function standing(externalRef: string): Promise<Standing | null> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("payments")
    .select("id, voided_at, void_reason")
    .eq("source", "bot")
    .eq("external_ref", externalRef)
    .order("recorded_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(`payments read failed: ${error.message}`);
  return ((data ?? [])[0] as Standing | undefined) ?? null;
}

async function paymentById(id: string): Promise<Payment> {
  const p = await getPayment(id);
  if (!p) throw new Error(`payment ${id} is missing`);
  return p;
}

/** A voided row that never counted (its allocations failed) may be recorded again; one a person voided may not. */
const retryable = (s: Standing) => s.void_reason.startsWith("allocations failed");

export async function recordBotPayment(p: BotPayment, actor: string): Promise<BotPaymentResult> {
  const externalRef = ref(p.pNumber);
  const before = await standing(externalRef);
  if (before && !before.voided_at) return { status: "already", payment: await paymentById(before.id) };
  if (before && !retryable(before)) return { status: "voided", paymentId: before.id };

  const db = getSupabaseAdmin();
  const number = normInvoiceNo(p.invoice);
  const { data, error } = await db.from("documents").select("id, number, client_id, total_cents").eq("kind", "invoice").eq("status", "issued").eq("number", number);
  if (error) throw new Error(`documents read failed: ${error.message}`);
  const docs = (data ?? []) as { id: string; number: string; client_id: string | null; total_cents: number | string }[];
  if (docs.length === 0) return { status: "no_invoice", detail: `no issued invoice ${number} in the app` };
  if (docs.length > 1) return { status: "ambiguous", detail: `${docs.length} issued invoices are numbered ${number}` };
  const doc = docs[0];

  const twin = possibleDuplicate(await moneyEntries(doc.id), p);
  if (twin) {
    return {
      status: "possible_duplicate",
      detail: `possible duplicate: ${number} already has ${(twin.amountCents / 100).toFixed(2)} received ${twin.receivedOn} entered on Money${twin.reference ? ` (${twin.reference})` : ""}, payment ${twin.id}. If it is the same payment, void the Money entry and the bot's next send records it; if not, enter this one on Money too`,
    };
  }

  const paid = (await paidByDocument([doc.id])).get(doc.id)?.total ?? 0;
  const balance = Number(doc.total_cents) - paid;
  if (p.amountCents > balance) {
    return { status: "overpays", detail: `${number} has ${(balance / 100).toFixed(2)} open in the app; ${(p.amountCents / 100).toFixed(2)} would overpay it` };
  }

  try {
    const payment = await recordPayment({
      clientId: doc.client_id,
      receivedOn: p.receivedOn,
      amountCents: p.amountCents,
      method: p.method,
      reference: externalRef,
      note: `Recorded in Joist by the bot${p.client ? ` (${p.client})` : ""}`,
      evidence: [p.evidence, p.joistId ? `joist ${p.joistId}` : ""].filter(Boolean).join(" · "),
      recordedBy: actor,
      allocations: [{ documentId: doc.id, lineIndex: null, amountCents: p.amountCents }],
      bot: { externalRef },
    });
    return { status: "recorded", payment };
  } catch (err) {
    // Two sends at once: the unique index let one in. Answer with that one.
    const now = await standing(externalRef);
    if (now && !now.voided_at) return { status: "already", payment: await paymentById(now.id) };
    throw err;
  }
}
