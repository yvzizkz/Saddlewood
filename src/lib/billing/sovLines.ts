// A job's schedule of values, one row per line in public.sov_lines (migration
// 0055). Award writes it; progress billing reads it. A draw names a line by
// its id ("line:<id>"), so the schedule's order never moves a draw onto the
// wrong line. Lines are never edited; Award may replace a schedule nothing has
// billed yet (the database refuses to delete a line a draw billed). Server only.

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { SovLine } from "@/lib/sales/award";

export type StoredSovLine = SovLine & { id: number; position: number };

export const lineKey = (id: number) => `line:${id}`;

type Row = { id: number | string; job_id: string; position: number; description: string; amount_cents: number | string; kind: SovLine["kind"] };

const toLine = (r: Row): StoredSovLine => ({ id: Number(r.id), position: r.position, description: r.description, amountCents: Number(r.amount_cents), kind: r.kind });

/** The schedule of values per job, in order. A job with none is absent. */
export async function loadSovLines(jobIds?: string[]): Promise<Map<string, StoredSovLine[]>> {
  const out = new Map<string, StoredSovLine[]>();
  if (jobIds && !jobIds.length) return out;
  let q = getSupabaseAdmin().from("sov_lines").select("id, job_id, position, description, amount_cents, kind").order("position", { ascending: true });
  if (jobIds) q = q.in("job_id", jobIds);
  const { data, error } = await q;
  if (error) throw new Error(`sov_lines: ${error.message}`);
  for (const r of (data ?? []) as Row[]) out.set(r.job_id, [...(out.get(r.job_id) ?? []), toLine(r)]);
  return out;
}

/**
 * Set a job's schedule of values: the lines already there go (the database
 * refuses if a draw billed one), these go in, in order. Not one transaction:
 * if the insert fails after the delete, run it again.
 */
export async function replaceSovLines(jobId: string, lines: SovLine[], by: string): Promise<StoredSovLine[]> {
  const db = getSupabaseAdmin();
  const del = await db.from("sov_lines").delete().eq("job_id", jobId);
  if (del.error) throw new Error(`sov_lines delete: ${del.error.message}`);
  const rows = lines
    .filter((l) => l.description.trim())
    .map((l, position) => ({ job_id: jobId, position, description: l.description.trim(), amount_cents: Math.round(l.amountCents), kind: l.kind, created_by: by }));
  if (!rows.length) return [];
  const { data, error } = await db.from("sov_lines").insert(rows).select("id, job_id, position, description, amount_cents, kind");
  if (error) throw new Error(`sov_lines insert: ${error.message}`);
  return ((data ?? []) as Row[]).map(toLine).sort((a, b) => a.position - b.position);
}
