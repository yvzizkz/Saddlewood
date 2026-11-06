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
// is also in the app as its own document isn't billed twice, but money applied
// to that line is credited to that document's job.
// What cannot be placed is returned apart (`unplaced`) for the owners to link.
//
// What counts as billed:
//   - A revision replaces what it corrects: a document an issued revision
//     supersedes isn't billed again, and money paid on it moves to the revision.
//   - A change order's document stays issued whatever the client decides, so the
//     register says if it's a bill: once signed, until an issued invoice bills
//     it, and then the invoice is the bill. A draft draw hasn't billed anything
//     yet. Rejected, voided, awaiting approval or not on the register, it bills
//     nothing.
//   - Money paid on a document that bills nothing still counts as paid, and a
//     job's Open nets it: dollars over on one item pay down its other bills.

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

/** Where a change order's document stands on the register. `invoiced`: an issued invoice billed it, whole or in part. */
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

/** The job a bill belongs to, by the two rules above. A statement has no job by its number: its lines are placed one by one. */
export function jobOfBill(d: { jobId: string | null; number: string; kind: string }, jobs: MoneyJob[]): string | null {
  return d.jobId ?? (d.kind === "statement" ? null : jobOfNumber(d.number, jobs));
}

/** Whether a change order's document is itself a bill right now. */
export function coIsBill(co: CoStanding | undefined): boolean {
  return (co?.status === "signed" || co?.status === "billed") && !co.invoiced;
}

export function placeMoney(input: MoneyInput): Placed {
  const jobBilling = new Map(input.jobs.map((j) => [j.id, j.billing ?? null]));
  const byJob = new Map<string, MoneyItem[]>();
  const unplaced: MoneyItem[] = [];
  type Draft = Omit<MoneyItem, "dueOn" | "payWhenPaid">;
  // The jobs a document's money might be: its client's, and any job with no client on file. With no
  // client on the document, the jobs it's known to bill say whose it is.
  const clientJobs = (d: BillingDocument, known: string[] = []) => {
    const owners = new Set(d.clientId ? [d.clientId] : input.jobs.filter((j) => j.clientId && known.includes(j.id)).map((j) => j.clientId));
    return owners.size ? input.jobs.filter((j) => !j.clientId || owners.has(j.clientId)).map((j) => j.id) : [];
  };
  const put = (d: BillingDocument, jobId: string | null, draft: Draft, couldBe = clientJobs(d)) => {
    const placed = jobId && jobBilling.has(jobId) ? jobId : null;
    const payWhenPaid = isPayWhenPaid(d.clientId ? input.clients?.get(d.clientId) : null, placed ? jobBilling.get(placed) : null);
    const item = { ...draft, payWhenPaid, dueOn: ladderClock(d.dueDate, input.firstSent.get(d.id) ?? null, payWhenPaid) };
    if (placed) byJob.set(placed, [...(byJob.get(placed) ?? []), item]);
    else unplaced.push({ ...item, couldBe });
  };

  const bills = input.documents.filter((d) => d.status === "issued" && BILLS.has(d.kind));
  const ownDocs = new Map(bills.filter((d) => d.kind !== "statement").map((d) => [normalizeNumber(d.number), jobOfBill(d, input.jobs)]));

  const replacedBy = new Map(bills.flatMap((d) => (d.supersedes ? [[d.supersedes, d.id] as const] : [])));
  const newest = (id: string): string => {
    const next = replacedBy.get(id);
    return next ? newest(next) : id;
  };
  // What's paid on a replaced document moves to its revision, a line's money to the
  // same line there. A line the revision no longer has leaves its money on the whole document.
  const docById = new Map(input.documents.map((d) => [d.id, d]));
  const movedPaid = new Map<string, number>();
  const movedLines = new Map<string, Map<number, number>>();
  for (const [id] of replacedBy) {
    const paid = input.paid.get(id);
    if (!paid?.total) continue;
    const to = newest(id);
    movedPaid.set(to, (movedPaid.get(to) ?? 0) + paid.total);
    const from = docById.get(id)?.snapshot.lines ?? [];
    const lines = docById.get(to)?.snapshot.lines ?? [];
    const onto = movedLines.get(to) ?? new Map<number, number>();
    for (const [i, cents] of paid.byLine) {
      const same = lines.findIndex((l) => l.description === from[i]?.description);
      if (same >= 0) onto.set(same, (onto.get(same) ?? 0) + cents);
    }
    movedLines.set(to, onto);
  }
  // The register names a change order's first document; a revision of it stands the same.
  const standing = new Map([...input.changeOrders].map(([id, co]) => [newest(id), co]));

  for (const d of bills) {
    if (replacedBy.has(d.id)) continue;
    const paid = input.paid.get(d.id);
    const paidCents = (paid?.total ?? 0) + (movedPaid.get(d.id) ?? 0);
    if (d.kind !== "statement") {
      const isBill = d.kind !== "change_order" || coIsBill(standing.get(d.id));
      if (!isBill && !paidCents) continue;
      put(d, jobOfBill(d, input.jobs), {
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
    const onLine = (i: number) => (paid?.byLine.get(i) ?? 0) + (movedLines.get(d.id)?.get(i) ?? 0);
    const items: { jobId: string | null; item: Draft }[] = [];
    // Every job the statement bills, a line that's its own document included: money on the whole statement could be any of them.
    const lineJobs = new Set<string | null>();
    lines.forEach((l, i) => {
      const named = invoiceNamedIn(l.description);
      const base = { number: named ?? normalizeNumber(d.number), title: l.description, documentId: d.id, lineIndex: i, paidCents: onLine(i) };
      if (named && ownDocs.has(named)) {
        // Billed by its own document. Money applied to the line is still that job's.
        const jobId = ownDocs.get(named) ?? null;
        lineJobs.add(jobId);
        if (base.paidCents) put(d, jobId, { ...base, billedCents: 0 });
        return;
      }
      const jobId = (named && jobOfNumber(named, input.jobs)) || d.jobId;
      lineJobs.add(jobId);
      items.push({ jobId, item: { ...base, billedCents: l.amountCents } });
    });
    // Money applied to the statement as a whole (no line) belongs to a job only
    // when every line it could pay is that job's; otherwise it waits with the owners.
    let lineless = paidCents - lines.reduce((sum, _, i) => sum + onLine(i), 0);
    if (lineless > 0) {
      const only = lineJobs.size === 1 ? [...lineJobs][0] : null;
      if (only) {
        for (const x of items) {
          const toLine = Math.min(lineless, Math.max(0, x.item.billedCents - x.item.paidCents));
          x.item = { ...x.item, paidCents: x.item.paidCents + toLine };
          lineless -= toLine;
        }
      }
      if (lineless > 0) {
        const known = [...lineJobs].filter((j): j is string => !!j);
        const couldBe = known.length === lineJobs.size && known.length ? known : [...new Set([...known, ...clientJobs(d, known)])];
        put(
          d,
          only,
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

/** Money received that sits on no job yet and could be this one's, so this job's Paid and Open can't be trusted. With nothing to say whose it is, it could be anyone's. */
export function unplacedPaidFor(jobId: string, unplaced: readonly MoneyItem[]): number {
  return unplaced.reduce((sum, u) => sum + (!u.couldBe?.length || u.couldBe.includes(jobId) ? u.paidCents : 0), 0);
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

/**
 * A bill is past due from the day after it was due (the ladder's day 1). A pay-when-paid bill with no due date never is.
 * Money over on one item (a change order paid before an invoice billed it) pays down the job's other bills, most late first.
 */
export function summarizeJobMoney(jobId: string, items: MoneyItem[], contractCents: number | null, today: string): JobMoney {
  const byMostLate = (a: OpenBill, b: OpenBill) => (b.daysLate ?? -Infinity) - (a.daysLate ?? -Infinity) || b.owedCents - a.owedCents;
  let billed = 0;
  let paid = 0;
  let over = 0;
  const bills: OpenBill[] = [];
  for (const it of items) {
    billed += it.billedCents;
    paid += it.paidCents;
    const left = it.billedCents - it.paidCents;
    if (left <= 0) {
      over -= left;
      continue;
    }
    const daysLate = it.dueOn ? daysBetween(it.dueOn, today) : null;
    bills.push({ number: it.number, title: it.title, owedCents: left, dueOn: it.dueOn, daysLate, payWhenPaid: it.payWhenPaid, documentId: it.documentId });
  }
  const open: OpenBill[] = [];
  for (const b of bills.sort(byMostLate)) {
    const credit = Math.min(over, b.owedCents);
    over -= credit;
    if (b.owedCents > credit) open.push({ ...b, owedCents: b.owedCents - credit });
  }
  open.sort(byMostLate);
  const owed = open.reduce((sum, b) => sum + b.owedCents, 0);
  const pastDue = open.reduce((sum, b) => sum + (b.daysLate !== null && b.daysLate >= 1 ? b.owedCents : 0), 0);
  return { jobId, contractCents, billedCents: billed, paidCents: paid, owedCents: owed, pastDueCents: pastDue, open, asOf: today };
}

/** The contract figure kept on the job (jobs.contract_cents, 0055), or null when it is not on file. */
export function contractOf(job: { contract_cents?: unknown } | null | undefined): number | null {
  const c = job?.contract_cents;
  const n = typeof c === "string" && /^\d+$/.test(c) ? Number(c) : c;
  return typeof n === "number" && Number.isSafeInteger(n) && n >= 0 ? n : null;
}
