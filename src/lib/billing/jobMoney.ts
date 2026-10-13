import { daysBetween, isPayWhenPaid, ladderClock } from "./ladder";
import { normalizeNumber } from "./numbering";
import type { BillingDocument, BillingProfile } from "./types";

// One job's money, read only: contract, billed, paid, owed and past due
// (money.view, KB docs/APP-PERMISSIONS-PLAN-2026-10-12.md "Project manager
// group", decision C). No cost, margin or pay rates: nothing here reads them.
// Pure, so it is tested without a database; jobMoneyLoad.ts feeds it.
//
// Which job a bill belongs to:
//   1. the document's own job (documents.job_id), else
//   2. the job whose number prefix starts the bill's number (jobs.number_prefix:
//      8009-13 is the job at 8009).
// A statement lists other invoices, often for several jobs (AFT-100526 carries
// Jury, Peter Rabbit and Carder), so each of its lines is placed on its own:
// "Invoice 8009-08 · ..." goes to the 8009 job. A line naming an invoice that
// is also in the app as its own document is left out, so it is not billed twice.
// What cannot be placed is returned apart (`unplaced`) for the owners to link.

export type MoneyJob = { id: string; prefix: string | null; billing?: BillingProfile | null };

export type MoneyItem = {
  /** The invoice number as the client knows it (a statement line: the invoice it names). */
  number: string;
  title: string;
  documentId: string;
  /** The statement line, when the item is one. */
  lineIndex: number | null;
  billedCents: number;
  paidCents: number;
  /** The day it counts as due from (ladder.ts ladderClock). Null: never sent, or pay-when-paid with no due date. */
  dueOn: string | null;
  /** The client (or the job) pays when their own client pays. */
  payWhenPaid: boolean;
};

export type MoneyInput = {
  /** Issued documents (void and draft are ignored here as well). */
  documents: BillingDocument[];
  /** Cents paid per document and per line, standing payments only (payments.ts paidByDocument). */
  paid: Map<string, { total: number; byLine: Map<number, number> }>;
  /** First "sent" per document id (ISO), for a document with no due date. */
  firstSent: Map<string, string>;
  jobs: MoneyJob[];
  /** Billing profile per client id, for pay-when-paid. */
  clients?: Map<string, BillingProfile>;
};

export type Placed = { byJob: Map<string, MoneyItem[]>; unplaced: MoneyItem[] };

const BILLS = new Set(["invoice", "change_order", "statement"]);

/** The invoice a statement line names ("Invoice 8009-08 · Jury ..."), or null. */
export function invoiceNamedIn(description: string): string | null {
  const m = /^\s*invoice\s+#?\s*([0-9A-Za-z][0-9A-Za-z-]*)/i.exec(description);
  return m ? normalizeNumber(m[1]) : null;
}

/** The job whose prefix starts this number, or null. The longest prefix wins. */
export function jobOfNumber(number: string, jobs: MoneyJob[]): string | null {
  const n = normalizeNumber(number);
  let best: { id: string; len: number } | null = null;
  for (const j of jobs) {
    const p = j.prefix ? normalizeNumber(j.prefix) : "";
    if (p && n.startsWith(`${p}-`) && (!best || p.length > best.len)) best = { id: j.id, len: p.length };
  }
  return best?.id ?? null;
}

export function placeMoney(input: MoneyInput): Placed {
  const jobBilling = new Map(input.jobs.map((j) => [j.id, j.billing ?? null]));
  const byJob = new Map<string, MoneyItem[]>();
  const unplaced: MoneyItem[] = [];
  type Draft = Omit<MoneyItem, "dueOn" | "payWhenPaid">;
  const put = (d: BillingDocument, jobId: string | null, draft: Draft) => {
    const placed = jobId && jobBilling.has(jobId) ? jobId : null;
    const payWhenPaid = isPayWhenPaid(d.clientId ? input.clients?.get(d.clientId) : null, placed ? jobBilling.get(placed) : null);
    const item = { ...draft, payWhenPaid, dueOn: ladderClock(d.dueDate, input.firstSent.get(d.id) ?? null, payWhenPaid) };
    if (placed) byJob.set(placed, [...(byJob.get(placed) ?? []), item]);
    else unplaced.push(item);
  };

  const bills = input.documents.filter((d) => d.status === "issued" && BILLS.has(d.kind));
  const ownDocs = new Set(bills.filter((d) => d.kind !== "statement").map((d) => normalizeNumber(d.number)));

  for (const d of bills) {
    const paid = input.paid.get(d.id);
    if (d.kind !== "statement") {
      put(d, d.jobId ?? jobOfNumber(d.number, input.jobs), {
        number: normalizeNumber(d.number),
        title: d.title,
        documentId: d.id,
        lineIndex: null,
        billedCents: d.totalCents,
        paidCents: paid?.total ?? 0,
      });
      continue;
    }

    const lines = d.snapshot.lines ?? [];
    const items: { jobId: string | null; item: Draft }[] = [];
    lines.forEach((l, i) => {
      const named = invoiceNamedIn(l.description);
      if (named && ownDocs.has(named)) return;
      items.push({
        jobId: (named && jobOfNumber(named, input.jobs)) || d.jobId,
        item: {
          number: named ?? normalizeNumber(d.number),
          title: l.description,
          documentId: d.id,
          lineIndex: i,
          billedCents: l.amountCents,
          paidCents: paid?.byLine.get(i) ?? 0,
        },
      });
    });
    // Money applied to the statement as a whole (no line) belongs to a job only
    // when every line it could pay is that job's; otherwise it waits with the owners.
    const lineless = (paid?.total ?? 0) - [...(paid?.byLine.values() ?? [])].reduce((s, c) => s + c, 0);
    if (lineless > 0) {
      const jobsOn = new Set(items.map((x) => x.jobId));
      const only = jobsOn.size === 1 ? [...jobsOn][0] : null;
      if (only && items.length) items[0].item = { ...items[0].item, paidCents: items[0].item.paidCents + lineless };
      else
        put(d, null, {
          number: normalizeNumber(d.number),
          title: "Paid on the statement, not on a line",
          documentId: d.id,
          lineIndex: null,
          billedCents: 0,
          paidCents: lineless,
        });
    }
    for (const x of items) put(d, x.jobId, x.item);
  }
  return { byJob, unplaced };
}

export type OpenBill = { number: string; title: string; owedCents: number; dueOn: string | null; daysLate: number | null; payWhenPaid: boolean };

export type JobMoney = {
  jobId: string;
  /** What the job is contracted for, when the owners have entered it; null = not on file. */
  contractCents: number | null;
  billedCents: number;
  paidCents: number;
  owedCents: number;
  pastDueCents: number;
  /** Bills with money still owed, most late first. */
  open: OpenBill[];
  asOf: string;
};

/** A bill is past due from the day after it was due (the ladder's day 1). A pay-when-paid bill with no due date never is. */
export function summarizeJobMoney(jobId: string, items: MoneyItem[], contractCents: number | null, today: string): JobMoney {
  let billed = 0;
  let paid = 0;
  let owed = 0;
  let pastDue = 0;
  const open: OpenBill[] = [];
  for (const it of items) {
    billed += it.billedCents;
    paid += it.paidCents;
    const left = it.billedCents - it.paidCents;
    if (left <= 0) continue;
    owed += left;
    const daysLate = it.dueOn ? daysBetween(it.dueOn, today) : null;
    if (daysLate !== null && daysLate >= 1) pastDue += left;
    open.push({ number: it.number, title: it.title, owedCents: left, dueOn: it.dueOn, daysLate, payWhenPaid: it.payWhenPaid });
  }
  open.sort((a, b) => (b.daysLate ?? -Infinity) - (a.daysLate ?? -Infinity) || b.owedCents - a.owedCents);
  return { jobId, contractCents, billedCents: billed, paidCents: paid, owedCents: owed, pastDueCents: pastDue, open, asOf: today };
}

/** The contract figure kept on the job (jobs.billing.contractCents), or null when it is not there. */
export function contractOf(billing: unknown): number | null {
  const c = (billing as { contractCents?: unknown } | null)?.contractCents;
  return typeof c === "number" && Number.isInteger(c) && c >= 0 ? c : null;
}
