// One job, whichever half of the app you came from. Server only.
//
// The billing side keeps jobs in `jobs` (uuid) and the field side in
// `crew_jobs` (text slug), joined by jobs.crew_job_id. A job's address in the
// app is its field slug when it has one (readable: /app/jobs/8009-n-ironwood-dr)
// and its billing id otherwise; either id opens the same page.

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { contractOf } from "@/lib/billing/jobMoney";

export type JobRef = {
  /** The id in the URL. */
  key: string;
  billingId: string | null;
  crewId: string | null;
  name: string;
  address: string;
  clientId: string | null;
  client: string;
  status: string;
  active: boolean;
  contractCents: number | null;
  pm: string[];
  saleId: string | null;
  saleNumber: string | null;
  awarded: boolean;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function jobHref(key: string, tab?: string): string {
  return `/app/jobs/${encodeURIComponent(key)}${tab ? `?tab=${tab}` : ""}`;
}

/** The URL key for a job named by either id (a cost line, a bill, a shift). */
export function jobKeyOf(ref: { billingId?: string | null; crewId?: string | null }, refs: JobRef[]): string | null {
  const hit = refs.find((r) => (ref.crewId && r.crewId === ref.crewId) || (ref.billingId && r.billingId === ref.billingId));
  return hit?.key ?? ref.crewId ?? ref.billingId ?? null;
}

export async function listJobRefs(): Promise<JobRef[]> {
  const db = getSupabaseAdmin();
  const [jobs, crew, clients, people, persons, sales] = await Promise.all([
    db.from("jobs").select("id,name,address,status,client_id,crew_job_id,billing,contract_cents,client_name"),
    db.from("crew_jobs").select("id,name,address,active"),
    db.from("clients").select("id,name"),
    db.from("crew_job_people").select("job_id,email,role"),
    db.from("crew_people").select("email,name"),
    db.from("sales_opportunities").select("id,number,job_id"),
  ]);
  if (jobs.error) throw new Error(`jobs: ${jobs.error.message}`);
  if (crew.error) throw new Error(`crew_jobs: ${crew.error.message}`);
  type J = { id: string; name: string; address: string | null; status: string | null; client_id: string | null; crew_job_id: string | null; billing: unknown; contract_cents: number | null; client_name: string | null };
  type C = { id: string; name: string; address: string; active: boolean };
  const clientName = new Map(((clients.data ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]));
  const personName = new Map(((persons.data ?? []) as { email: string; name: string | null }[]).map((p) => [p.email, p.name || p.email]));
  const pms = new Map<string, string[]>();
  for (const p of (people.data ?? []) as { job_id: string; email: string; role: string }[]) {
    if (p.role !== "pm") continue;
    pms.set(p.job_id, [...(pms.get(p.job_id) ?? []), personName.get(p.email) ?? p.email]);
  }
  const saleOf = new Map(((sales.data ?? []) as { id: string; number: string; job_id: string | null }[]).filter((s) => s.job_id).map((s) => [s.job_id as string, s]));
  const crewById = new Map(((crew.data ?? []) as C[]).map((c) => [c.id, c]));

  const out: JobRef[] = [];
  const seenCrew = new Set<string>();
  for (const j of (jobs.data ?? []) as J[]) {
    const c = j.crew_job_id ? crewById.get(j.crew_job_id) : undefined;
    if (c) seenCrew.add(c.id);
    const sale = saleOf.get(j.id);
    const billing = (j.billing ?? {}) as Record<string, unknown>;
    out.push({
      key: c?.id ?? j.id,
      billingId: j.id,
      crewId: c?.id ?? null,
      name: c?.name ?? j.name,
      address: c?.address || j.address || "",
      clientId: j.client_id,
      client: (j.client_id && clientName.get(j.client_id)) || j.client_name || "",
      status: j.status ?? "active",
      active: (j.status ?? "active") !== "closed" && (c ? c.active : true),
      contractCents: contractOf(j),
      pm: c ? (pms.get(c.id) ?? []) : [],
      saleId: sale?.id ?? null,
      saleNumber: sale?.number ?? null,
      awarded: Boolean(billing.award),
    });
  }
  for (const c of crewById.values()) {
    if (seenCrew.has(c.id)) continue;
    out.push({ key: c.id, billingId: null, crewId: c.id, name: c.name, address: c.address, clientId: null, client: "", status: c.active ? "active" : "closed", active: c.active, contractCents: null, pm: pms.get(c.id) ?? [], saleId: null, saleNumber: null, awarded: false });
  }
  return out.sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
}

export async function getJobRef(key: string): Promise<JobRef | null> {
  const all = await listJobRefs();
  const k = decodeURIComponent(key);
  return all.find((r) => r.key === k || r.crewId === k || (UUID.test(k) && r.billingId === k)) ?? null;
}
