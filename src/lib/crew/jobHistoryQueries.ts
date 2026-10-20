import { getSupabaseAdmin } from "@/lib/supabase/admin";

import { jobHistorySchema, type HistoryPost, type JobHistory } from "./jobHistory";

// Reads and writes job_history (0050) with the service role. The caller has
// already checked who is asking (the Mac's token, or money.view and the job).

export async function upsertHistory(rows: HistoryPost[]): Promise<number> {
  if (rows.length === 0) return 0;
  const db = getSupabaseAdmin();
  const now = new Date().toISOString();
  const { error } = await db.from("job_history").upsert(
    rows.map((r) => ({ crew_job_id: r.crewJobId, summary: r.summary, as_of: r.asOf, updated_at: now })),
    { onConflict: "crew_job_id" },
  );
  if (error) throw new Error(`job_history upsert: ${error.message}`);
  return rows.length;
}

/** The job's summary with when the Mac read it, or null when there is none (or it no longer parses). */
export async function loadHistory(crewJobId: string): Promise<(JobHistory & { readAt: string }) | null> {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("job_history").select("summary, as_of").eq("crew_job_id", crewJobId).maybeSingle();
  if (error) throw new Error(`job_history read: ${error.message}`);
  if (!data) return null;
  const parsed = jobHistorySchema.safeParse((data as { summary: unknown }).summary);
  return parsed.success ? { ...parsed.data, readAt: (data as { as_of: string }).as_of } : null;
}
