// The bot's expense items (Zelle payments, texted receipts) as purchases lines
// (migration 0053). Pure: the rules only, no database. Client-safe.
//
// The bot (KB accounting.py, receipt_ocr.py, crew.py) still posts its items to
// /api/expenses in the old page's shape; this turns one into a line of the one
// spend ledger, and a line back into that shape for the bot's replies.

import type { PurchaseLine } from "@/lib/crew/purchases";
import { isDay } from "@/lib/crew/time";
import type { ExpenseItem } from "./types";

/** The bot's ids: z-12 (Zelle), r-7 (receipt). */
const EXPENSE_ID = /^[a-z]{1,3}-\d{1,9}$/;

/** expense:z-12:1, so the trip key (everything before the last colon) is expense:z-12: each payment its own trip. */
export function spendKey(id: string): string {
  return `expense:${id}:1`;
}

/** The item the bot means: a number is its n (Z12 -> 12), a string like z-12 its id. */
export function expenseRef(v: unknown): { id: string } | { n: number } | null {
  if (typeof v === "number") return Number.isInteger(v) && v > 0 ? { n: v } : null;
  const s = String(v ?? "").trim().toLowerCase();
  if (EXPENSE_ID.test(s)) return { id: s };
  return /^\d{1,9}$/.test(s) ? { n: Number(s) } : null;
}

const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\u0000/g, "").trim().replace(/\s+/g, " ").slice(0, max) : "");

export type SpendInput =
  | { kind: "line"; line: PurchaseLine }
  /** A receipt filed in the app: crew.py already sent it to /api/bot/purchases as app:<entry id>. */
  | { kind: "app"; entry: number }
  | { kind: "bad"; error: string };

/** One bot expense item -> its purchases line, or why not. */
export function spendLine(e: unknown): SpendInput {
  if (!e || typeof e !== "object") return { kind: "bad", error: "send the whole expense item, not only its number" };
  const x = e as Record<string, unknown>;
  if (typeof x.appEntry === "number") return { kind: "app", entry: x.appEntry };
  const id = text(x.id, 20).toLowerCase();
  if (!EXPENSE_ID.test(id)) return { kind: "bad", error: "expense id must look like z-12 or r-7" };
  const day = text(x.date, 10);
  if (!isDay(day)) return { kind: "bad", error: "expense date must be YYYY-MM-DD" };
  const amount = Number(x.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 500_000) return { kind: "bad", error: "expense amount must be above zero" };
  const zelle = x.source === "zelle";
  const recipient = text(x.recipient, 80);
  const memo = text(x.memo, 160);
  const meta: Record<string, unknown> = { expenseId: id };
  // The bot's number is the one its id carries (z-12 is Z12), whatever n says.
  meta.n = Number(id.slice(id.indexOf("-") + 1));
  if (recipient) meta.recipient = recipient;
  for (const [k, max] of [["expenseType", 60], ["receiptUrl", 300], ["notes", 600], ["decidedBy", 120]] as const) {
    const v = text(x[k], max);
    if (v) meta[k === "expenseType" ? "category" : k] = v;
  }
  if (x.status === "dismissed") meta.ignored = true;
  return {
    kind: "line",
    line: {
      source: zelle ? "zelle" : "receipt",
      sourceKey: spendKey(id),
      purchasedOn: day,
      vendor: text(x.vendor, 80) || recipient || "Unknown",
      store: "",
      orderRef: text(x.transactionId, 80),
      jobNameRaw: text(x.project, 160),
      department: "",
      class: "",
      sku: "",
      description: (zelle ? `Zelle to ${recipient || "?"}${memo ? `: ${memo}` : ""}` : memo || "Receipt").slice(0, 240),
      qty: 1,
      lineTotalCents: Math.round(amount * 100),
      jobId: null,
      meta,
    },
  };
}

/** A spend line as the stored row has it. */
export type SpendRow = {
  source: string;
  source_key: string;
  purchased_on: string;
  vendor: string;
  order_ref: string;
  job_name_raw: string;
  job_id: string | null;
  description: string;
  line_total_cents: number;
  meta: Record<string, unknown> | null;
  created_at?: string;
};

/** A spend line back in the old page's shape: what the bot gets in reply. */
export function asExpense(r: SpendRow, jobName?: string | null): ExpenseItem {
  const m = r.meta ?? {};
  const id = typeof m.expenseId === "string" ? m.expenseId : r.source_key;
  const str = (v: unknown) => (typeof v === "string" && v ? v : null);
  return {
    id,
    n: typeof m.n === "number" ? m.n : 0,
    source: r.source === "zelle" ? "zelle" : "receipt",
    direction: "out",
    date: r.purchased_on,
    amount: r.line_total_cents / 100,
    recipient: str(m.recipient) ?? r.vendor,
    memo: r.description,
    transactionId: r.order_ref || undefined,
    status: m.ignored === true ? "dismissed" : r.job_id || r.job_name_raw ? "categorized" : "pending",
    project: jobName ?? (r.job_name_raw || null),
    expenseType: str(m.category),
    decidedBy: str(m.decidedBy),
    decidedAt: null,
    clearedVia: null,
    notes: str(m.notes),
    receiptUrl: str(m.receiptUrl),
    vendor: r.vendor,
    createdAt: r.created_at ?? "",
  };
}
