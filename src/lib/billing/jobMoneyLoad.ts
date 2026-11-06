import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { localDay } from "@/lib/crew/time";
import { contractOf, placeMoney, summarizeJobMoney, type CoStanding, type JobMoney, type MoneyItem } from "./jobMoney";
import { openingItem } from "./jobOpening";
import { loadOpenings } from "./jobOpeningStore";
import { toDocument, type DocumentRow } from "./documents";
import type { BillingProfile } from "./types";
import { paidByDocument } from "./payments";

// Reads what jobMoney.ts needs, with the service role. The caller has already
// decided which jobs the person may see (money.view and the job assignment);
// this only answers for the jobs it is given.
//
// Every issued bill is read, not just the job's: a statement for several jobs
// has no job of its own, and a bill is placed by its number as well (jobMoney.ts).

/**
 * The register, by document. An invoice has billed a change order when an
 * issued document is named as the bill, or an issued draw carries its line: a
 * draw short of 100% leaves it signed with no billed document, and a draft at
 * 100% already names it, so neither the status nor the name alone can say.
 * Billed with no document named means it was billed some other way.
 */
async function changeOrderStanding(issued: ReadonlySet<string>): Promise<Map<string, CoStanding>> {
  const db = getSupabaseAdmin();
  const [cos, drawn] = await Promise.all([
    db.from("change_orders").select("id, status, document_id, billed_document_id").not("document_id", "is", null),
    db.from("sov_progress").select("line_key, document_id").like("line_key", "co:%"),
  ]);
  if (cos.error) throw new Error(`job money failed: ${cos.error.message}`);
  if (drawn.error) throw new Error(`job money failed: ${drawn.error.message}`);
  const onDraw = new Set(((drawn.data ?? []) as { line_key: string; document_id: string }[]).filter((r) => issued.has(r.document_id)).map((r) => r.line_key));
  type Co = { id: number; status: string; document_id: string; billed_document_id: string | null };
  const invoiced = (c: Co) => (c.billed_document_id ? issued.has(c.billed_document_id) : c.status === "billed") || onDraw.has(`co:${c.id}`);
  return new Map(((cos.data ?? []) as Co[]).map((c) => [c.document_id, { status: c.status, invoiced: invoiced(c) }]));
}

async function readPlaced() {
  const db = getSupabaseAdmin();
  const [docs, jobs, clients] = await Promise.all([
    db.from("documents").select("*").eq("status", "issued").in("kind", ["invoice", "change_order", "statement"]),
    db.from("jobs").select("id, number_prefix, client_id, billing, contract_cents"),
    db.from("clients").select("id, billing"),
  ]);
  if (docs.error) throw new Error(`job money failed: ${docs.error.message}`);
  if (jobs.error) throw new Error(`job money failed: ${jobs.error.message}`);
  if (clients.error) throw new Error(`job money failed: ${clients.error.message}`);
  const documents = ((docs.data ?? []) as DocumentRow[]).map(toDocument);
  const ids = documents.map((d) => d.id);

  const [paid, changeOrders, sent] = await Promise.all([
    paidByDocument(ids),
    changeOrderStanding(new Set(ids)),
    ids.length
      ? db.from("document_events").select("document_id, at").eq("kind", "sent").in("document_id", ids).order("at", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (sent.error) throw new Error(`job money failed: ${sent.error.message}`);
  const firstSent = new Map<string, string>();
  for (const e of (sent.data ?? []) as { document_id: string; at: string }[]) {
    if (!firstSent.has(e.document_id)) firstSent.set(e.document_id, e.at);
  }

  const jobRows = (jobs.data ?? []) as { id: string; number_prefix: string | null; client_id: string | null; billing: BillingProfile | null; contract_cents: number | null }[];
  const placed = placeMoney({
    documents,
    paid,
    firstSent,
    changeOrders,
    jobs: jobRows.map((j) => ({ id: j.id, prefix: j.number_prefix, clientId: j.client_id, billing: j.billing })),
    clients: new Map(((clients.data ?? []) as { id: string; billing: BillingProfile | null }[]).map((c) => [c.id, c.billing ?? {}])),
  });
  return { placed, documents, contract: new Map(jobRows.map((j) => [j.id, contractOf(j)])) };
}

export async function loadJobMoney(
  jobIds: string[],
  today: string = localDay(),
): Promise<{ jobs: JobMoney[]; unplaced: MoneyItem[] }> {
  if (jobIds.length === 0) return { jobs: [], unplaced: [] };
  const [{ placed, contract }, openings] = await Promise.all([readPlaced(), loadOpenings(jobIds)]);
  return {
    jobs: jobIds
      .filter((id) => contract.has(id))
      .map((id) => {
        const opening = openingItem(openings.get(id));
        return summarizeJobMoney(id, [...(placed.byJob.get(id) ?? []), ...(opening ? [opening] : [])], contract.get(id) ?? null, today);
      }),
    unplaced: placed.unplaced,
  };
}

/** The numbers of the job's bills issued on or before a day: the ones an opening through that day would count twice. */
export async function billsThrough(jobId: string, day: string): Promise<string[]> {
  const { placed, documents } = await readPlaced();
  const issuedOn = new Map(documents.map((d) => [d.id, d.issuedAt ? localDay(d.issuedAt) : null]));
  const numbers = (placed.byJob.get(jobId) ?? []).filter((it) => {
    const on = issuedOn.get(it.documentId);
    return on && on <= day;
  });
  return [...new Set(numbers.map((it) => it.number))].sort();
}
