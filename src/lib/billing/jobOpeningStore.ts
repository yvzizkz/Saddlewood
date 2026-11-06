import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { localDay } from "@/lib/crew/time";
import { openingProblem, type JobOpening, type OpeningInput } from "./jobOpening";

// Reads and writes job_openings (0064) with the service role. The caller has
// already checked the seat. Each save is a new row; the newest counts.

export class OpeningError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

type Row = { job_id: string; settled_cents: number | string; as_of: string; source: string; entered_by: string; entered_at: string };

/** The standing opening per job. A read that fails throws: "no opening" would understate what a client paid. */
export async function loadOpenings(jobIds: string[]): Promise<Map<string, JobOpening>> {
  const out = new Map<string, JobOpening>();
  if (!jobIds.length) return out;
  const { data, error } = await getSupabaseAdmin().from("job_openings").select("job_id,settled_cents,as_of,source,entered_by,entered_at").in("job_id", jobIds).order("id", { ascending: false });
  if (error) throw new Error(`job openings: ${error.message}`);
  for (const r of (data ?? []) as Row[]) {
    if (out.has(r.job_id)) continue;
    out.set(r.job_id, { settledCents: Number(r.settled_cents), asOf: r.as_of, source: r.source, enteredBy: r.entered_by, enteredAt: r.entered_at });
  }
  return out;
}

/**
 * Saves the opening and the job's contract. The opening row goes first: it holds
 * the trail, so a contract never changes without one. `overlapping`: the job's
 * bills through that date (jobMoneyLoad.ts billsThrough).
 */
export async function saveOpening(billingJobId: string, input: OpeningInput, by: string, overlapping: string[]): Promise<void> {
  const problem = openingProblem(input, localDay(), overlapping);
  if (problem) throw new OpeningError(problem, 409);
  const db = getSupabaseAdmin();
  const { error } = await db.from("job_openings").insert({ job_id: billingJobId, settled_cents: input.settledCents, as_of: input.asOf, source: input.source, contract_cents: input.contractCents, entered_by: by });
  if (error) throw new Error(`job opening: ${error.message}`);
  const { error: jobError } = await db.from("jobs").update({ contract_cents: input.contractCents }).eq("id", billingJobId);
  if (jobError) throw new Error(`job contract: ${jobError.message}`);
}
