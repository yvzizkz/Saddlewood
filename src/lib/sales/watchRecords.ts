import { paidByDocument } from "@/lib/billing/payments";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { readAll } from "@/lib/supabase/paged";

// Watches that close themselves from the records (cleanup Batch 3, "Waiting
// on an owner"). The deposit watch is done when its deposit invoice is paid in
// full on Money, and opens again if that payment is voided. Nobody has to tick
// it as well.
//
// A close made here is marked in done_by ("record: ..."), so it can be told
// apart from an owner's tick: only those are opened again by the records. An
// owner who opens a record-closed watch by hand wins; it is marked "reopened
// by ..." and the records leave it alone after that.
//
// The agreement watch is done when the client signs the job's agreement on
// its link (/d/<token>, src/lib/agreements/store.ts signAgreement), and opens
// again if that agreement is voided. The old /sign/ contracts are matched to
// nothing but free text, so they close nothing.

export const RECORD_MARK = "record: ";
export const REOPENED_MARK = "reopened by ";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type RecordWatch = { id: number; job_id: string; kind: string; done_at: string | null; done_by: string };
/** A job's deposit invoice: its number, and whether payments that stand cover it. */
export type DepositState = { number: string; paid: boolean };
/** A job's agreement: its number, and whether the client signed it (a void one is not signed). */
export type AgreementState = { number: string; signed: boolean };

/**
 * What the records say should change: close these (with the note), open these
 * again. Only a deposit known to be unpaid, or an agreement known to be
 * unsigned, opens a watch again; a job whose record could not be found leaves
 * its watch as it is.
 */
export function recordChanges(
  watches: RecordWatch[],
  deposits: Map<string, DepositState>,
  agreements: Map<string, AgreementState> = new Map(),
): { close: { id: number; by: string }[]; reopen: number[] } {
  const close: { id: number; by: string }[] = [];
  const reopen: number[] = [];
  for (const w of watches) {
    let rec: { done: boolean; by: string } | undefined;
    if (w.kind === "deposit") {
      const d = deposits.get(w.job_id);
      rec = d && { done: d.paid, by: `${d.number} paid in full` };
    } else if (w.kind === "agreement") {
      const a = agreements.get(w.job_id);
      rec = a && { done: a.signed, by: `${a.number} signed by the client` };
    } else continue;
    const byRecord = !!w.done_at && w.done_by.startsWith(RECORD_MARK);
    if (!w.done_at && !w.done_by.startsWith(REOPENED_MARK) && rec?.done) close.push({ id: w.id, by: `${RECORD_MARK}${rec.by}` });
    else if (byRecord && rec && !rec.done) reopen.push(w.id);
  }
  return { close, reopen };
}

/**
 * The deposit invoice Award made for each job: the one the award names, else
 * the first titled Deposit, followed to its latest revision (a corrected
 * deposit is a new document that supersedes the first).
 */
async function depositsFor(jobIds: string[]): Promise<Map<string, DepositState>> {
  const out = new Map<string, DepositState>();
  if (!jobIds.length) return out;
  const db = getSupabaseAdmin();
  const { data: jobs, error } = await db.from("jobs").select("id, billing").in("id", jobIds);
  if (error) throw new Error(`watch records: read deposits failed: ${error.message}`);
  type Doc = { id: string; job_id: string; number: string; title: string; status: string; total_cents: number | string; supersedes: string | null; created_at: string };
  const named = new Map<string, string>();
  for (const j of (jobs ?? []) as { id: string; billing: { award?: { depositId?: string | null } } | null }[]) {
    const id = j.billing?.award?.depositId;
    if (id && UUID.test(id)) named.set(j.id, id);
  }
  // Only the invoices that can be a deposit: the named one, those titled
  // Deposit, and revisions (a revision keeps no title rule). Every job's other
  // invoices stay out, and the read is paged, so the 1,000-row cap can't drop
  // a deposit and make it look unpaid.
  const which = ["title.eq.Deposit", "supersedes.not.is.null", ...(named.size ? [`id.in.(${[...new Set(named.values())].join(",")})`] : [])].join(",");
  const { rows, capped } = await readAll<Doc>(
    (from, to) =>
      db
        .from("documents")
        .select("id, job_id, number, title, status, total_cents, supersedes, created_at")
        .eq("kind", "invoice")
        .in("job_id", jobIds)
        .or(which)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    "watch records: read deposits",
  );
  if (capped) throw new Error("watch records: too many deposit invoices to read; watches left as they are");
  const chosen = new Map<string, Doc>();
  for (const jobId of jobIds) {
    const mine = rows.filter((d) => d.job_id === jobId);
    let doc = mine.find((d) => d.id === named.get(jobId)) ?? mine.find((d) => d.title === "Deposit");
    for (let hops = 0; doc && hops < 20; hops++) {
      const next = mine.find((d) => d.supersedes === doc!.id && d.status !== "draft");
      if (!next) break;
      doc = next;
    }
    if (doc) chosen.set(jobId, doc);
  }
  const paid = await paidByDocument([...chosen.values()].map((d) => d.id));
  for (const [jobId, d] of chosen) {
    const total = Number(d.total_cents);
    out.set(jobId, { number: d.number, paid: d.status === "issued" && total > 0 && (paid.get(d.id)?.total ?? 0) >= total });
  }
  return out;
}

/**
 * Each job's agreement: the latest one that is not void, signed when its
 * proof record has the client's signature. A job whose agreements are all
 * void has an unsigned one; a job with none is left out.
 */
async function agreementsFor(jobIds: string[]): Promise<Map<string, AgreementState>> {
  const out = new Map<string, AgreementState>();
  if (!jobIds.length) return out;
  const db = getSupabaseAdmin();
  type Doc = { id: string; job_id: string; number: string; status: string; revision: number; created_at: string };
  const { rows, capped } = await readAll<Doc>(
    (from, to) =>
      db
        .from("documents")
        .select("id, job_id, number, status, revision, created_at")
        .eq("kind", "agreement")
        .in("job_id", jobIds)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    "watch records: read agreements",
  );
  if (capped) throw new Error("watch records: too many agreements to read; watches left as they are");
  const chosen = new Map<string, Doc>();
  for (const jobId of jobIds) {
    const mine = rows.filter((d) => d.job_id === jobId).sort((a, b) => b.revision - a.revision || b.created_at.localeCompare(a.created_at));
    const doc = mine.find((d) => d.status !== "void") ?? mine[0];
    if (doc) chosen.set(jobId, doc);
  }
  const issued = [...chosen.values()].filter((d) => d.status === "issued").map((d) => d.id);
  const signed = new Set<string>();
  if (issued.length) {
    const { data, error } = await db.from("document_events").select("document_id, detail").eq("kind", "signed").in("document_id", issued);
    if (error) throw new Error(`watch records: read signatures failed: ${error.message}`);
    for (const e of (data ?? []) as { document_id: string; detail: { role?: string } | null }[]) {
      if (e.detail?.role !== "company") signed.add(e.document_id);
    }
  }
  for (const [jobId, d] of chosen) out.set(jobId, { number: d.number, signed: d.status === "issued" && signed.has(d.id) });
  return out;
}

/** Bring the deposit and agreement watches in line with Money and the signatures. Safe to run on every read; it only writes what changed. */
export async function closeWatchesFromRecords(jobIds?: string[], now: Date = new Date()): Promise<{ closed: number; reopened: number }> {
  const db = getSupabaseAdmin();
  let q = db.from("job_watches").select("id, job_id, kind, done_at, done_by").in("kind", ["deposit", "agreement"]).limit(2000);
  if (jobIds) q = q.in("job_id", jobIds);
  const { data, error } = await q;
  if (error) throw new Error(`watch records: read watches failed: ${error.message}`);
  const watches = (data ?? []) as RecordWatch[];
  const candidates = watches.filter((w) => (!w.done_at && !w.done_by.startsWith(REOPENED_MARK)) || w.done_by.startsWith(RECORD_MARK));
  if (!candidates.length) return { closed: 0, reopened: 0 };
  const jobsOf = (kind: string) => [...new Set(candidates.filter((w) => w.kind === kind).map((w) => w.job_id))];
  const [deposits, agreements] = await Promise.all([depositsFor(jobsOf("deposit")), agreementsFor(jobsOf("agreement"))]);
  const { close, reopen } = recordChanges(candidates, deposits, agreements);
  let closed = 0;
  for (const c of close) {
    const { data: row, error: e } = await db.from("job_watches").update({ done_at: now.toISOString(), done_by: c.by }).eq("id", c.id).is("done_at", null).select("id").maybeSingle();
    if (e) throw new Error(`watch records: close failed: ${e.message}`);
    if (row) closed++;
  }
  let reopened = 0;
  if (reopen.length) {
    const { data: rows, error: e } = await db.from("job_watches").update({ done_at: null, done_by: "" }).in("id", reopen).like("done_by", `${RECORD_MARK}%`).select("id");
    if (e) throw new Error(`watch records: reopen failed: ${e.message}`);
    reopened = (rows ?? []).length;
  }
  return { closed, reopened };
}

/** Reading the watches never fails because the records could not be checked. */
export async function settleWatches(jobIds?: string[]): Promise<void> {
  await closeWatchesFromRecords(jobIds).catch((err) => console.error("[sales/watches] records:", (err as Error).message));
}
