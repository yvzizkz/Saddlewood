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
//
// What counts as billed:
//   - A revision replaces what it corrects: a document an issued revision
//     supersedes isn't billed again, and money paid on it moves to the revision.
//   - A change order's document stays issued whatever the client decides, so the
//     register says if it's a bill: once signed, until an invoice bills it, and
//     then the invoice is the bill. Rejected, voided, awaiting approval or not
//     on the register, it bills nothing.
//   - Money paid on a document that bills nothing still counts as paid.

export type MoneyJob = { id: string; prefix: string | null; clientId?: string | null; billing?: BillingProfile | null };

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
  /** Unplaced money only: the jobs it might be. */
  couldBe?: string[];
};

/** Where a change order's document stands on the register. `invoiced`: an invoice billed it, whole or in part. */
export type CoStanding = { status: string; invoiced: boolean };

export type MoneyInput = {
  /** Issued documents (void and draft are ignored here as well). */
  documents: BillingDocument[];
  /** Cents paid per document and per line, standing payments only (payments.ts paidByDocument). */
  paid: Map<string, { total: number; byLine: Map<number, number> }>;
  /** First "sent" per document id (ISO), for a document with no due date. */
  firstSent: Map<string, string>;
  /** The register's change orders, by their document id. */
  changeOrders: Map<string, CoStanding>;
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

/** Whether a change order's document is itself a bill right now. */
export function coIsBill(co: CoStanding | undefined): boolean {
  return co?.status === "signed" && !co.invoiced;
}

export function placeMoney(input: MoneyInput): Placed {
  const jobBilling = new Map(input.jobs.map((j) => [j.id, j.billing ?? null]));
  const byJob = new Map<string, MoneyItem[]>();
  const unplaced: MoneyItem[] = [];
  type Draft = Omit<MoneyItem, "dueOn" | "payWhenPaid">;
  const clientJobs = (d: BillingDocument) => (d.clientId ? input.jobs.filter((j) => j.clientId === d.clientId).map((j) => j.id) : []);
  const put = (d: BillingDocument, jobId: string | null, draft: Draft, couldBe = clientJobs(d)) => {
    const placed = jobId && jobBilling.has(jobId) ? jobId : null;
    const payWhenPaid = isPayWhenPaid(d.clientId ? input.clients?.get(d.clientId) : null, placed ? jobBilling.get(placed) : null);
    const item = { ...draft, payWhenPaid, dueOn: ladderClock(d.dueDate, input.firstSent.get(d.id) ?? null, payWhenPaid) };
    if (placed) byJob.set(placed, [...(byJob.get(placed) ?? []), item]);
    else unplaced.push({ ...item, couldBe });
  };

  const bills = input.documents.filter((d) => d.status === "issued" && BILLS.has(d.kind));
  const ownDocs = new Map(bills.filter((d) => d.kind !== "statement").map((d) => [normalizeNumber(d.number), d.jobId ?? jobOfNumber(d.number, input.jobs)]));

  const replacedBy = new Map(bills.flatMap((d) => (d.supersedes ? [[d.supersedes, d.id] as const] : [])));
  const newest = (id: string): string => {
    const next = replacedBy.get(id);
    return next ? newest(next) : id;
  };
  const movedPaid = new Map<string, number>();
  for (const [id] of replacedBy) {
    const cents = input.paid.get(id)?.total ?? 0;
    if (cents) movedPaid.set(newest(id), (movedPaid.get(newest(id)) ?? 0) + cents);
  }

  for (const d of bills) {
    if (replacedBy.has(d.id)) continue;
    const paid = input.paid.get(d.id);
    const paidCents = (paid?.total ?? 0) + (movedPaid.get(d.id) ?? 0);
    if (d.kind !== "statement") {
      const isBill = d.kind !== "change_order" || coIsBill(input.changeOrders.get(d.id));
      if (!isBill && !paidCents) continue;
      put(d, d.jobId ?? jobOfNumber(d.number, input.jobs), {
        number: normalizeNumber(d.number),
        title: d.title,
        documentId: d.id,
        lineIndex: null,
        billedCents: isBill ? d.totalCents : 0,
        paidCents,
      });
      continue;
    }

    const lines = d.snapshot.lines ?? [];
    const items: { jobId: string | null; item: Draft }[] = [];
    // Every job the statement bills, a line that's its own document included: money on the whole statement could be any of them.
    const lineJobs = new Set<string | null>();
    lines.forEach((l, i) => {
      const named = invoiceNamedIn(l.description);
      if (named && ownDocs.has(named)) {
        lineJobs.add(ownDocs.get(named) ?? null);
        return;
      }
      const jobId = (named && jobOfNumber(named, input.jobs)) || d.jobId;
      lineJobs.add(jobId);
      items.push({
        jobId,
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
    const lineless = paidCents - [...(paid?.byLine.values() ?? [])].reduce((s, c) => s + c, 0);
    if (lineless > 0) {
      const only = lineJobs.size === 1 ? [...lineJobs][0] : null;
      if (only && items.length) items[0].item = { ...items[0].item, paidCents: items[0].item.paidCents + lineless };
      else {
        const known = [...lineJobs].filter((j): j is string => !!j);
        const couldBe = known.length === lineJobs.size && known.length ? known : [...new Set([...known, ...clientJobs(d)])];
        put(
          d,
          null,
          {
            number: normalizeNumber(d.number),
            title: "Paid on the statement, not on a line",
            documentId: d.id,
            lineIndex: null,
            billedCents: 0,
            paidCents: lineless,
          },
          couldBe,
        );
      }
    }
    for (const x of items) put(d, x.jobId, x.item);
  }
  return { byJob, unplaced };
}

/** Money received that sits on no job yet and could be this one's, so this job's Paid and Open can't be trusted. */
export function unplacedPaidFor(jobId: string, unplaced: readonly MoneyItem[]): number {
  return unplaced.reduce((sum, u) => sum + (u.couldBe?.includes(jobId) ? u.paidCents : 0), 0);
}

export type OpenBill = { number: string; title: string; owedCents: number; dueOn: string | null; daysLate: number | null; payWhenPaid: boolean; documentId?: string };

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
    open.push({ number: it.number, title: it.title, owedCents: left, dueOn: it.dueOn, daysLate, payWhenPaid: it.payWhenPaid, documentId: it.documentId });
  }
  open.sort((a, b) => (b.daysLate ?? -Infinity) - (a.daysLate ?? -Infinity) || b.owedCents - a.owedCents);
  return { jobId, contractCents, billedCents: billed, paidCents: paid, owedCents: owed, pastDueCents: pastDue, open, asOf: today };
}

/** The contract figure kept on the job (jobs.contract_cents, 0055), or null when it is not on file. */
export function contractOf(job: { contract_cents?: unknown } | null | undefined): number | null {
  const c = job?.contract_cents;
  const n = typeof c === "string" && /^\d+$/.test(c) ? Number(c) : c;
  return typeof n === "number" && Number.isSafeInteger(n) && n >= 0 ? n : null;
}
