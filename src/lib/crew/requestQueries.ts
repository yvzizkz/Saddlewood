import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { REQUEST_STATUSES, type CrewRequest, type CrewRequestStatus } from "./types";

// Every read and write of crew_requests (migration 0023). Service-role client
// only, after the route has decided who is asking, like queries.ts. Kept out
// of queries.ts so the table can be mocked on its own in tests.

const UNIQUE_VIOLATION = "23505";

function fail(what: string, message: string): never {
  throw new Error(`${what} failed: ${message}`);
}

type RequestRow = {
  id: number;
  kind: string;
  job_id: string | null;
  job_name: string;
  trade: string;
  items: string;
  qty: string;
  est_cents: number | null;
  status: string;
  asked_by: string;
  asked_at: string;
  source: unknown;
  decided_by: string;
  decided_at: string | null;
  decision_note: string;
  talk: boolean;
  supplier: string;
  order_ref: string;
  store: string;
  pickup_id: number | null;
  created_at: string;
  updated_at: string;
};

function toRequest(r: RequestRow): CrewRequest {
  const source = r.source && typeof r.source === "object" && !Array.isArray(r.source) ? (r.source as Record<string, unknown>) : {};
  return {
    id: r.id,
    kind: "material",
    jobId: r.job_id ?? "",
    jobName: r.job_name,
    trade: r.trade,
    items: r.items,
    qty: r.qty,
    estCents: typeof r.est_cents === "number" ? r.est_cents : null,
    status: REQUEST_STATUSES.find((s) => s === r.status) ?? "asked",
    askedBy: r.asked_by,
    askedAt: r.asked_at,
    entryId: typeof source.entryId === "number" ? source.entryId : null,
    decidedBy: r.decided_by,
    decidedAt: r.decided_at,
    decisionNote: r.decision_note,
    talk: !!r.talk,
    supplier: r.supplier,
    orderRef: r.order_ref,
    store: r.store,
    pickupId: r.pickup_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** The ones still moving, plus everything settled (denied, delivered, cancelled) since `since`. */
export async function listRequests(filter: { email?: string; since: string }): Promise<CrewRequest[]> {
  const db = getSupabaseAdmin();
  let open = db.from("crew_requests").select("*").in("status", ["asked", "approved", "ordered", "picked"]);
  let settled = db.from("crew_requests").select("*").in("status", ["denied", "delivered", "cancelled"]).gte("updated_at", filter.since);
  if (filter.email) {
    open = open.eq("asked_by", filter.email);
    settled = settled.eq("asked_by", filter.email);
  }
  const [a, b] = await Promise.all([open.order("id", { ascending: true }).limit(300), settled.order("id", { ascending: false }).limit(200)]);
  if (a.error) fail("crew_requests list", a.error.message);
  if (b.error) fail("crew_requests list", b.error.message);
  const seen = new Set<number>();
  return [...((a.data ?? []) as RequestRow[]), ...((b.data ?? []) as RequestRow[])]
    .filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)))
    .map(toRequest);
}

export async function getRequest(id: number): Promise<CrewRequest | null> {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("crew_requests").select("*").eq("id", id).maybeSingle();
  if (error) fail("crew_requests read", error.message);
  return data ? toRequest(data as RequestRow) : null;
}

/** The request an ordered pickup came from, if any. */
export async function getRequestByPickup(pickupId: number): Promise<CrewRequest | null> {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("crew_requests").select("*").eq("pickup_id", pickupId).order("id", { ascending: false }).limit(1);
  if (error) fail("crew_requests read", error.message);
  const row = (data as RequestRow[] | null)?.[0];
  return row ? toRequest(row) : null;
}

export type NewRequest = {
  jobId: string;
  jobName: string;
  trade: string;
  items: string;
  qty: string;
  estCents: number | null;
  askedBy: string;
  /** The end of day it came from, for the one-per-entry index. */
  entryId: number | null;
};

/** Insert, or hand back the request an earlier read of the same end of day already made. */
export async function insertRequest(r: NewRequest): Promise<{ request: CrewRequest; existed: boolean }> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("crew_requests")
    .insert({
      job_id: r.jobId || null,
      job_name: r.jobName,
      trade: r.trade,
      items: r.items,
      qty: r.qty,
      est_cents: r.estCents,
      asked_by: r.askedBy,
      source: r.entryId !== null ? { entryId: r.entryId } : {},
    })
    .select("*")
    .single();
  if (!error) return { request: toRequest(data as RequestRow), existed: false };
  if (error.code !== UNIQUE_VIOLATION || r.entryId === null) fail("crew_requests insert", error.message);
  const { data: prior, error: e2 } = await db.from("crew_requests").select("*").eq("source->>entryId", String(r.entryId)).limit(1);
  const row = (prior as RequestRow[] | null)?.[0];
  if (e2 || !row) fail("crew_requests insert", e2?.message ?? "the earlier copy could not be read");
  return { request: toRequest(row), existed: true };
}

export async function patchRequest(
  id: number,
  patch: Partial<{
    status: CrewRequestStatus;
    est_cents: number | null;
    decided_by: string;
    decided_at: string | null;
    decision_note: string;
    talk: boolean;
    supplier: string;
    order_ref: string;
    store: string;
    pickup_id: number | null;
  }>,
  only?: { statusIn?: CrewRequestStatus[] },
): Promise<CrewRequest | null> {
  const db = getSupabaseAdmin();
  let q = db
    .from("crew_requests")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (only?.statusIn) q = q.in("status", only.statusIn);
  const { data, error } = await q.select("*");
  if (error) fail("crew_requests update", error.message);
  const row = (data as RequestRow[] | null)?.[0];
  return row ? toRequest(row) : null;
}
