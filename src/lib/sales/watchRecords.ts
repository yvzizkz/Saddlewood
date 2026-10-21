import { paidByDocument } from "@/lib/billing/payments";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

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
// The agreement watch is not closed here yet. Its signature record has to be
// tied to the job, which comes with the Contracts move (the agreement is made
// on the awarded job and signed like a proposal). The old /sign/ contracts
// are matched to nothing but free text and fall back to seed rows.

export const RECORD_MARK = "record: ";
export const REOPENED_MARK = "reopened by ";

export type RecordWatch = { id: number; job_id: string; kind: string; done_at: string | null; done_by: string };
/** A job's deposit invoice: its number, and whether payments that stand cover it. */
export type DepositState = { number: string; paid: boolean };

/** What the records say should change: close these (with the note), open these again. */
export function recordChanges(watches: RecordWatch[], deposits: Map<string, DepositState>): { close: { id: number; by: string }[]; reopen: number[] } {
  const close: { id: number; by: string }[] = [];
  const reopen: number[] = [];
  for (const w of watches) {
    if (w.kind !== "deposit") continue;
    const d = deposits.get(w.job_id);
    const byRecord = !!w.done_at && w.done_by.startsWith(RECORD_MARK);
    if (!w.done_at && !w.done_by.startsWith(REOPENED_MARK) && d?.paid) close.push({ id: w.id, by: `${RECORD_MARK}${d.number} paid in full` });
    else if (byRecord && !d?.paid) reopen.push(w.id);
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
  const [{ data: jobs, error }, { data: docs, error: dErr }] = await Promise.all([
    db.from("jobs").select("id, billing").in("id", jobIds),
    db.from("documents").select("id, job_id, number, title, status, total_cents, supersedes, created_at").eq("kind", "invoice").in("job_id", jobIds),
  ]);
  if (error || dErr) throw new Error(`watch records: read deposits failed: ${(error ?? dErr)!.message}`);
  type Doc = { id: string; job_id: string; number: string; title: string; status: string; total_cents: number | string; supersedes: string | null; created_at: string };
  const named = new Map<string, string>();
  for (const j of (jobs ?? []) as { id: string; billing: { award?: { depositId?: string | null } } | null }[]) {
    const id = j.billing?.award?.depositId;
    if (id) named.set(j.id, id);
  }
  const rows = ((docs ?? []) as Doc[]).sort((a, b) => a.created_at.localeCompare(b.created_at));
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

/** Bring the deposit watches in line with Money. Safe to run on every read; it only writes what changed. */
export async function closeWatchesFromRecords(jobIds?: string[], now: Date = new Date()): Promise<{ closed: number; reopened: number }> {
  const db = getSupabaseAdmin();
  let q = db.from("job_watches").select("id, job_id, kind, done_at, done_by").eq("kind", "deposit").limit(2000);
  if (jobIds) q = q.in("job_id", jobIds);
  const { data, error } = await q;
  if (error) throw new Error(`watch records: read watches failed: ${error.message}`);
  const watches = (data ?? []) as RecordWatch[];
  const candidates = watches.filter((w) => (!w.done_at && !w.done_by.startsWith(REOPENED_MARK)) || w.done_by.startsWith(RECORD_MARK));
  if (!candidates.length) return { closed: 0, reopened: 0 };
  const { close, reopen } = recordChanges(candidates, await depositsFor([...new Set(candidates.map((w) => w.job_id))]));
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
