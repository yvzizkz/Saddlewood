import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { contractOf, placeMoney, summarizeJobMoney, type JobMoney, type MoneyItem } from "./jobMoney";
import { toDocument, type DocumentRow } from "./documents";
import { paidByDocument } from "./payments";

// Reads what jobMoney.ts needs, with the service role. The caller has already
// decided which jobs the person may see (money.view and the job assignment);
// this only answers for the jobs it is given.
//
// Every issued bill is read, not just the job's: a statement for several jobs
// has no job of its own, and a bill is placed by its number as well (jobMoney.ts).

export async function loadJobMoney(
  jobIds: string[],
  today: string = new Date().toISOString().slice(0, 10),
): Promise<{ jobs: JobMoney[]; unplaced: MoneyItem[] }> {
  if (jobIds.length === 0) return { jobs: [], unplaced: [] };
  const db = getSupabaseAdmin();
  const [docs, jobs] = await Promise.all([
    db.from("documents").select("*").eq("status", "issued").in("kind", ["invoice", "change_order", "statement"]),
    db.from("jobs").select("id, number_prefix, billing"),
  ]);
  if (docs.error) throw new Error(`job money failed: ${docs.error.message}`);
  if (jobs.error) throw new Error(`job money failed: ${jobs.error.message}`);
  const documents = ((docs.data ?? []) as DocumentRow[]).map(toDocument);
  const ids = documents.map((d) => d.id);

  const [paid, sent] = await Promise.all([
    paidByDocument(ids),
    ids.length
      ? db.from("document_events").select("document_id, at").eq("kind", "sent").in("document_id", ids).order("at", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (sent.error) throw new Error(`job money failed: ${sent.error.message}`);
  const firstSent = new Map<string, string>();
  for (const e of (sent.data ?? []) as { document_id: string; at: string }[]) {
    if (!firstSent.has(e.document_id)) firstSent.set(e.document_id, e.at);
  }

  const jobRows = (jobs.data ?? []) as { id: string; number_prefix: string | null; billing: unknown }[];
  const placed = placeMoney({ documents, paid, firstSent, jobs: jobRows.map((j) => ({ id: j.id, prefix: j.number_prefix })) });
  const contract = new Map(jobRows.map((j) => [j.id, contractOf(j.billing)]));
  return {
    jobs: jobIds
      .filter((id) => contract.has(id))
      .map((id) => summarizeJobMoney(id, placed.byJob.get(id) ?? [], contract.get(id) ?? null, today)),
    unplaced: placed.unplaced,
  };
}
