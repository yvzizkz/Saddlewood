import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { REQUEST_STATUSES, type CrewPickupStatus, type CrewRequest, type CrewRequestStatus } from "./types";

// Every read and write of crew_requests (migration 0023). Service-role client
// only, after the route has decided who is asking, like queries.ts. Kept out
// of queries.ts so the table can be mocked on its own in tests.
//
// Once a request is ordered, where it stands is its pickup's: every read
// takes the pickup's status with it and works the request's out from that
// (requestFromPickup), so the two cannot disagree. The status column is kept
// up to date as well (mirrorPickupToRequest), for the open-list index.

/** The request's status, read through its pickup once it was ordered. */
export function requestFromPickup(status: CrewRequestStatus, pickup: CrewPickupStatus | null): CrewRequestStatus {
  if (!pickup || !["ordered", "picked", "delivered", "cancelled"].includes(status)) return status;
  return pickup === "picked" ? "picked" : pickup === "delivered" ? "delivered" : pickup === "cancelled" ? "cancelled" : "ordered";
}

// The pickup it became, read in the same query (crew_requests.pickup_id).
const COLS = "*, pickup:crew_pickups(status)";

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
  pickup?: { status: string } | null;
};

const PICKUP_STATUSES: readonly CrewPickupStatus[] = ["staged", "picked", "delivered", "problem", "cancelled"];

function toRequest(r: RequestRow): CrewRequest {
  const pickupStatus = r.pickup_id !== null ? (PICKUP_STATUSES.find((s) => s === r.pickup?.status) ?? null) : null;
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
    status: requestFromPickup(REQUEST_STATUSES.find((s) => s === r.status) ?? "asked", pickupStatus),
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
    pickupStatus,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** The ones still moving, plus everything settled (denied, delivered, cancelled) since `since`. */
export async function listRequests(filter: { email?: string; since: string }): Promise<CrewRequest[]> {
  const db = getSupabaseAdmin();
  let open = db.from("crew_requests").select(COLS).in("status", ["asked", "approved", "ordered", "picked"]);
  let settled = db.from("crew_requests").select(COLS).in("status", ["denied", "delivered", "cancelled"]).gte("updated_at", filter.since);
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
  const { data, error } = await db.from("crew_requests").select(COLS).eq("id", id).maybeSingle();
  if (error) fail("crew_requests read", error.message);
  return data ? toRequest(data as RequestRow) : null;
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
    .select(COLS)
    .single();
  if (!error) return { request: toRequest(data as RequestRow), existed: false };
  if (error.code !== UNIQUE_VIOLATION || r.entryId === null) fail("crew_requests insert", error.message);
  const { data: prior, error: e2 } = await db.from("crew_requests").select(COLS).eq("source->>entryId", String(r.entryId)).limit(1);
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
  const { data, error } = await q.select(COLS);
  if (error) fail("crew_requests update", error.message);
  const row = (data as RequestRow[] | null)?.[0];
  return row ? toRequest(row) : null;
}

/**
 * Bring the stored status of the request a pickup came from in line with the
 * pickup (the reads already show it so; this keeps the open-list index right).
 * Only an ordered request moves: one never ordered is not the pickup's.
 */
export async function syncRequestToPickup(pickupId: number, pickup: CrewPickupStatus): Promise<number> {
  const next = requestFromPickup("ordered", pickup);
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("crew_requests")
    .update({ status: next, updated_at: new Date().toISOString() })
    .eq("pickup_id", pickupId)
    .in("status", ["ordered", "picked", "delivered", "cancelled"])
    .neq("status", next)
    .select("id");
  if (error) fail("crew_requests update", error.message);
  return (data ?? []).length;
}
