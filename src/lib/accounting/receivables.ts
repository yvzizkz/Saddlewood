// Receivables and billing for the Accounting hub. Server only.
//
// Open balances come from the same reader as Money (billing/overview.ts):
// issued invoices, statements and change orders less the payments placed on
// them, with the proof record and the next step on the collection ladder.
// Collections are payments received in a range, split by the documents they
// paid. Billing is every document issued (or drafted) in a range.

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { localDay } from "@/lib/crew/time";
import { moneyOverview } from "@/lib/billing/overview";
import { daysBetween } from "@/lib/billing/ladder";
import type { BillingProfile } from "@/lib/billing/types";

export const AGE_BUCKETS = [
  { key: "current", label: "Not yet due" },
  { key: "1-30", label: "1–30 days late" },
  { key: "31-60", label: "31–60 days late" },
  { key: "61-90", label: "61–90 days late" },
  { key: "90+", label: "Over 90 days late" },
  { key: "pwp", label: "Pay-when-paid" },
] as const;

export function ageBucket(daysLate: number | null, payWhenPaid: boolean): (typeof AGE_BUCKETS)[number] {
  if (payWhenPaid && (daysLate === null || daysLate <= 0)) return AGE_BUCKETS[5];
  if (daysLate === null || daysLate <= 0) return AGE_BUCKETS[0];
  if (daysLate <= 30) return AGE_BUCKETS[1];
  if (daysLate <= 60) return AGE_BUCKETS[2];
  if (daysLate <= 90) return AGE_BUCKETS[3];
  return AGE_BUCKETS[4];
}

export type OpenRow = {
  id: string;
  number: string;
  title: string;
  kind: string;
  clientId: string;
  client: string;
  jobId: string;
  job: string;
  issuedOn: string | null;
  dueOn: string | null;
  totalCents: number;
  paidCents: number;
  balanceCents: number;
  daysLate: number | null;
  age: string;
  ageLabel: string;
  standing: string;
  next: string;
  payWhenPaid: boolean;
};

type JobName = { id: string; name: string; crew_job_id: string | null; billing: unknown };

async function jobNames(): Promise<Map<string, JobName>> {
  const { data, error } = await getSupabaseAdmin().from("jobs").select("id,name,crew_job_id,billing");
  if (error) throw new Error(`jobs: ${error.message}`);
  return new Map(((data ?? []) as JobName[]).map((j) => [j.id, j]));
}

export async function loadOpenReceivables(today = localDay()): Promise<{ rows: OpenRow[]; today: string }> {
  const [o, jobs] = await Promise.all([moneyOverview(today), jobNames()]);
  const rows: OpenRow[] = [];
  for (const c of o.clients) {
    for (const d of c.documents) {
      const due = d.doc.dueDate;
      const daysLate = d.next?.daysLate ?? (due ? daysBetween(due, today) : null);
      const b = ageBucket(daysLate, d.payWhenPaid);
      const p = d.proof;
      const standing =
        p.bouncedAt ? "Bounced" : p.viewCount > 0 ? "Viewed" : d.unconfirmed ? "Not viewed" : p.deliveredAt ? "Delivered" : p.firstSentAt ? "Sent" : "Not sent";
      const job = d.doc.jobId ? jobs.get(d.doc.jobId) : undefined;
      rows.push({
        id: d.doc.id,
        number: d.doc.number,
        title: d.doc.title || d.doc.kind,
        kind: d.doc.kind,
        clientId: c.id ?? "",
        client: c.name,
        jobId: d.doc.jobId ?? "",
        job: job?.name ?? "No job",
        issuedOn: d.doc.issuedAt ? localDay(d.doc.issuedAt) : null,
        dueOn: due,
        totalCents: d.doc.totalCents,
        paidCents: d.paidCents,
        balanceCents: d.balanceCents,
        daysLate,
        age: b.key,
        ageLabel: b.label,
        standing,
        next: d.next ? `${d.next.label} (${d.next.who})` : "",
        payWhenPaid: d.payWhenPaid,
      });
    }
  }
  return { rows, today: o.today };
}

export type CollectedRow = {
  id: string;
  paymentId: string;
  receivedOn: string;
  clientId: string;
  client: string;
  jobId: string;
  job: string;
  documentId: string | null;
  number: string;
  method: string;
  reference: string;
  /** Where it was recorded: "Money" (a person) or "Joist (bot)" (0054). */
  recordedIn: string;
  amountCents: number;
  feeCents: number;
};

/** Every payment received in the range, one row per document it paid (unplaced money gets its own row). */
export async function loadCollected(fromDay: string, toDay: string): Promise<CollectedRow[]> {
  const db = getSupabaseAdmin();
  const { data: pays, error } = await db
    .from("payments")
    // "*": source is there only once 0054 is in.
    .select("*")
    .is("voided_at", null)
    .gte("received_on", fromDay)
    .lte("received_on", toDay);
  if (error) throw new Error(`payments: ${error.message}`);
  const list = (pays ?? []) as { id: string; client_id: string | null; received_on: string; amount_cents: number; fee_cents: number; method: string; reference: string; source?: string }[];
  if (!list.length) return [];
  const [alloc, clients, jobs] = await Promise.all([
    db.from("payment_allocations").select("payment_id,document_id,amount_cents").in("payment_id", list.map((p) => p.id)),
    db.from("clients").select("id,name"),
    jobNames(),
  ]);
  if (alloc.error) throw new Error(`payment_allocations: ${alloc.error.message}`);
  const allocs = (alloc.data ?? []) as { payment_id: string; document_id: string; amount_cents: number }[];
  const docIds = [...new Set(allocs.map((a) => a.document_id))];
  const docs = docIds.length ? await db.from("documents").select("id,number,job_id").in("id", docIds) : { data: [], error: null };
  if (docs.error) throw new Error(`documents: ${docs.error.message}`);
  const docMap = new Map(((docs.data ?? []) as { id: string; number: string; job_id: string | null }[]).map((d) => [d.id, d]));
  const clientName = new Map(((clients.data ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]));

  const out: CollectedRow[] = [];
  for (const p of list) {
    const mine = allocs.filter((a) => a.payment_id === p.id);
    const placed = mine.reduce((s, a) => s + Number(a.amount_cents), 0);
    const base = {
      paymentId: p.id,
      receivedOn: p.received_on,
      clientId: p.client_id ?? "",
      client: (p.client_id && clientName.get(p.client_id)) || "Unknown client",
      method: p.method,
      reference: p.reference,
      recordedIn: p.source === "bot" ? "Joist (bot)" : "Money",
    };
    mine.forEach((a, i) => {
      const d = docMap.get(a.document_id);
      const j = d?.job_id ? jobs.get(d.job_id) : undefined;
      out.push({
        ...base,
        id: `${p.id}:${i}`,
        jobId: d?.job_id ?? "",
        job: j?.name ?? "No job",
        documentId: a.document_id,
        number: d?.number ?? "",
        amountCents: Number(a.amount_cents),
        // The fee belongs to the whole payment: shown on its first line.
        feeCents: i === 0 ? Number(p.fee_cents) : 0,
      });
    });
    const left = Number(p.amount_cents) - placed;
    if (left > 0 || mine.length === 0) {
      out.push({ ...base, id: `${p.id}:u`, jobId: "", job: "Not placed yet", documentId: null, number: "", amountCents: left, feeCents: mine.length ? 0 : Number(p.fee_cents) });
    }
  }
  return out;
}

export type IssuedRow = {
  id: string;
  number: string;
  title: string;
  kind: string;
  status: string;
  clientId: string;
  client: string;
  jobId: string;
  job: string;
  day: string;
  dueOn: string | null;
  totalCents: number;
};

/** Documents issued in the range (and drafts created in it), for Billing. */
export async function loadIssued(fromDay: string, toDay: string): Promise<IssuedRow[]> {
  const db = getSupabaseAdmin();
  const fromIso = `${fromDay}T00:00:00-07:00`;
  const [docs, clients, jobs] = await Promise.all([
    db
      .from("documents")
      .select("id,number,title,kind,status,client_id,job_id,issued_at,created_at,due_date,total_cents")
      .in("kind", ["invoice", "change_order", "statement"])
      .neq("status", "void")
      .or(`issued_at.gte.${fromIso},and(issued_at.is.null,created_at.gte.${fromIso})`)
      .order("created_at", { ascending: false }),
    db.from("clients").select("id,name"),
    jobNames(),
  ]);
  if (docs.error) throw new Error(`documents: ${docs.error.message}`);
  const clientName = new Map(((clients.data ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]));
  type D = { id: string; number: string; title: string; kind: string; status: string; client_id: string | null; job_id: string | null; issued_at: string | null; created_at: string; due_date: string | null; total_cents: number };
  return ((docs.data ?? []) as D[])
    .map((d) => ({ d, day: localDay(d.issued_at ?? d.created_at) }))
    .filter(({ day }) => day >= fromDay && day <= toDay)
    .map(({ d, day }) => ({
      id: d.id,
      number: d.number || "(draft)",
      title: d.title || d.kind,
      kind: d.kind,
      status: d.status,
      clientId: d.client_id ?? "",
      client: (d.client_id && clientName.get(d.client_id)) || "No client",
      jobId: d.job_id ?? "",
      job: (d.job_id && jobs.get(d.job_id)?.name) || "No job",
      day,
      dueOn: d.due_date,
      totalCents: Number(d.total_cents),
    }));
}

export type CutoffRow = {
  client: string;
  clientId: string;
  day: string;
  label: string;
  prepOn: string;
  delivery: string;
  attachments: string[];
  openJobs: number;
  /** Open jobs billed by percent complete (a schedule of values), and how many have the PM's report for this cycle. */
  sovJobs: number;
  reported: number;
};

/**
 * The next billing date per client: their cutoff day (AFT the 23rd, Schifferer
 * the 20th), or the 1st and 15th by default, with the day the PM's percent
 * complete is due (3 business days before, SOP-006 Gate 3).
 */
export async function loadBillingCalendar(today = localDay()): Promise<CutoffRow[]> {
  const db = getSupabaseAdmin();
  const [clients, jobs] = await Promise.all([db.from("clients").select("id,name,billing"), db.from("jobs").select("id,client_id,status,billing")]);
  if (clients.error) throw new Error(`clients: ${clients.error.message}`);
  const open = new Map<string, number>();
  type J = { client_id: string | null; status: string | null; billing: { sov?: unknown[]; pmReport?: { day?: string } } | null };
  const openJobs = ((jobs.data ?? []) as J[]).filter((j) => j.client_id && j.status !== "closed" && j.status !== "lost");
  for (const j of openJobs) open.set(j.client_id!, (open.get(j.client_id!) ?? 0) + 1);
  const out: CutoffRow[] = [];
  for (const c of (clients.data ?? []) as { id: string; name: string; billing: BillingProfile | null }[]) {
    if (!open.get(c.id)) continue;
    const b = c.billing ?? {};
    const day = nextCutoff(today, b.cutoffDay);
    const sov = openJobs.filter((j) => j.client_id === c.id && (j.billing?.sov?.length ?? 0) > 0);
    out.push({
      client: c.name,
      clientId: c.id,
      day,
      label: b.cutoffDay ? `Closes the ${ordinal(b.cutoffDay)}` : "1st and 15th",
      prepOn: businessDaysBefore(day, 3),
      delivery: b.delivery === "portal" ? `Upload to ${b.portalName || "their portal"}` : "Email",
      attachments: (b.attachments ?? []).map((a) => ATTACHMENT_LABEL[a] ?? a),
      openJobs: open.get(c.id) ?? 0,
      sovJobs: sov.length,
      reported: sov.filter((j) => reportedThisCycle(j.billing?.pmReport?.day, day, b.cutoffDay)).length,
    });
  }
  return out.sort((a, b) => a.day.localeCompare(b.day));
}

const ATTACHMENT_LABEL: Record<string, string> = {
  conditional_waiver: "Conditional waiver",
  final_waiver: "Final waiver",
  tracker_workbook: "Tracker workbook",
  schedule_of_values: "Schedule of values",
  insurance_certificate: "COI",
  w9: "W-9",
};

function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th";
  return `${n}${s}`;
}

function clampDay(y: number, m: number, d: number): string {
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

export function nextCutoff(today: string, cutoffDay?: number): string {
  const [y, m] = today.split("-").map(Number);
  const days = cutoffDay ? [cutoffDay] : [1, 15];
  for (const step of [0, 1]) {
    const yy = m + step > 12 ? y + 1 : y;
    const mm = ((m + step - 1) % 12) + 1;
    for (const d of days) {
      const c = clampDay(yy, mm, d);
      if (c >= today) return c;
    }
  }
  return today;
}

/** The cutoff before this one: the cycle a PM's report counts for runs from the day after it to `day`. */
export function previousCutoff(day: string, cutoffDay?: number): string {
  const [y, m] = day.split("-").map(Number);
  const days = cutoffDay ? [cutoffDay] : [1, 15];
  let best = "";
  for (const step of [1, 0]) {
    const yy = m - step < 1 ? y - 1 : y;
    const mm = ((m - step + 11) % 12) + 1;
    for (const d of days) {
      const c = clampDay(yy, mm, d);
      if (c < day && c > best) best = c;
    }
  }
  return best;
}

/** Whether a report sent on `reportDay` is the one for the cycle that bills on `day`. */
export function reportedThisCycle(reportDay: string | null | undefined, day: string, cutoffDay?: number): boolean {
  return !!reportDay && reportDay > previousCutoff(day, cutoffDay) && reportDay <= day;
}

export function businessDaysBefore(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  let left = n;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() - 1);
    const w = d.getUTCDay();
    if (w !== 0 && w !== 6) left--;
  }
  return d.toISOString().slice(0, 10);
}
