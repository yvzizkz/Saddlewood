import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { BotFileRef } from "@/lib/bot/types";
import type {
  CrewEntry,
  CrewEntryKind,
  CrewEntryStatus,
  CrewJob,
  CrewJobPhase,
  CrewLang,
  CrewOption,
  CrewPerson,
  CrewPickup,
  CrewPickupStatus,
  CrewGroup,
  CrewReport,
  CrewReportAnswer,
  CrewQuestion,
  CrewQuestionKind,
  CrewScheduleItem,
  CrewShift,
  CrewTask,
  CrewTaskStatus,
  Geo,
  ShiftEdit,
} from "./types";
import { fromJobOf } from "./geo";
import { JOB_ROLES, normalizePerms, type BillingJobRef, type CrewJobGeo, type CrewJobPerson, type CrewJobRole } from "./types";

// Every read and write of the crew tables. Service-role client only, after the
// route has decided who is asking (src/lib/crew/auth.ts). The tables carry RLS
// with no policies.

const UNIQUE_VIOLATION = "23505";

function fail(what: string, message: string): never {
  throw new Error(`${what} failed: ${message}`);
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function asFiles(v: unknown): BotFileRef[] {
  if (!Array.isArray(v)) return [];
  return v.filter(
    (f): f is BotFileRef => !!f && typeof f === "object" && typeof (f as BotFileRef).path === "string" && typeof (f as BotFileRef).name === "string",
  );
}

function asGeo(v: unknown): Geo | null {
  const g = asRecord(v);
  return typeof g.lat === "number" && typeof g.lng === "number"
    ? { lat: g.lat, lng: g.lng, acc: typeof g.acc === "number" ? g.acc : null }
    : null;
}

// ---- people -------------------------------------------------------------------

type PersonRow = {
  email: string;
  auth_id: string | null;
  name: string;
  lang: string;
  phone: string;
  trade: string;
  group_id?: string;
  pay_rate?: number | string | null;
  /** The group, embedded through crew_people_group_fk. */
  crew_groups?: { name: string; perms: unknown } | null;
  active: boolean;
  added_by: string;
  created_at: string;
  last_seen_at: string | null;
};

/** A seat with its group's switches as they are right now. */
const PERSON_COLS = "*, crew_groups(name, perms)";

function asStrings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

export type CrewPersonRow = CrewPerson & { authId: string | null };

function toPerson(r: PersonRow): CrewPersonRow {
  return {
    email: r.email,
    name: r.name,
    lang: (r.lang === "es" ? "es" : "en") as CrewLang,
    phone: r.phone,
    trade: r.trade,
    group: r.group_id ?? "crew",
    groupName: r.crew_groups?.name ?? "Crew",
    perms: normalizePerms(asStrings(r.crew_groups?.perms)),
    // numeric comes back from PostgREST as a number or a string.
    payRate: r.pay_rate === null || r.pay_rate === undefined || r.pay_rate === "" ? null : Number(r.pay_rate),
    active: r.active,
    addedBy: r.added_by,
    createdAt: r.created_at,
    lastSeenAt: r.last_seen_at,
    authId: r.auth_id,
  };
}

export async function getPerson(email: string): Promise<CrewPersonRow | null> {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("crew_people").select(PERSON_COLS).eq("email", email).maybeSingle();
  if (error) fail("crew_people read", error.message);
  return data ? toPerson(data as PersonRow) : null;
}

export async function listPeople(): Promise<CrewPersonRow[]> {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("crew_people").select(PERSON_COLS).order("name", { ascending: true });
  if (error) fail("crew_people list", error.message);
  return ((data ?? []) as PersonRow[]).map(toPerson);
}

export async function savePerson(p: {
  email: string;
  authId: string | null;
  name: string;
  lang: CrewLang;
  phone: string;
  trade: string;
  group: string;
  payRate?: number | null;
  addedBy: string;
}): Promise<CrewPersonRow> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("crew_people")
    .upsert(
      {
        email: p.email,
        auth_id: p.authId,
        name: p.name,
        lang: p.lang,
        phone: p.phone,
        trade: p.trade,
        group_id: p.group,
        ...(p.payRate !== undefined ? { pay_rate: p.payRate } : {}),
        active: true,
        added_by: p.addedBy,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "email" },
    )
    .select(PERSON_COLS)
    .single();
  if (error) fail("crew_people save", error.message);
  return toPerson(data as PersonRow);
}

export async function patchPerson(
  email: string,
  patch: Partial<{ name: string; lang: CrewLang; phone: string; trade: string; group_id: string; pay_rate: number | null; active: boolean; auth_id: string | null }>,
): Promise<CrewPersonRow | null> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("crew_people")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("email", email)
    .select(PERSON_COLS);
  if (error) fail("crew_people update", error.message);
  const row = (data as PersonRow[] | null)?.[0];
  return row ? toPerson(row) : null;
}

/** Stamp that this person opened the app. At most one write every five minutes. */
export async function touchSeen(person: CrewPerson): Promise<void> {
  if (person.lastSeenAt && Date.now() - Date.parse(person.lastSeenAt) < 5 * 60_000) return;
  const db = getSupabaseAdmin();
  await db.from("crew_people").update({ last_seen_at: new Date().toISOString() }).eq("email", person.email);
}

// ---- groups -------------------------------------------------------------------

type GroupRow = { id: string; name: string; description: string; perms: unknown; builtin: boolean };

function toGroup(r: GroupRow): CrewGroup {
  return { id: r.id, name: r.name, description: r.description, perms: normalizePerms(asStrings(r.perms)), builtin: r.builtin };
}

export async function listGroups(): Promise<CrewGroup[]> {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("crew_groups").select("id, name, description, perms, builtin").order("created_at", { ascending: true });
  if (error) fail("crew_groups list", error.message);
  return ((data ?? []) as GroupRow[]).map(toGroup);
}

export async function getGroup(id: string): Promise<CrewGroup | null> {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("crew_groups").select("id, name, description, perms, builtin").eq("id", id).maybeSingle();
  if (error) fail("crew_groups read", error.message);
  return data ? toGroup(data as GroupRow) : null;
}

/** -> null when a new group's id is taken. */
export async function insertGroup(g: { id: string; name: string; description: string; perms: string[]; createdBy: string }): Promise<CrewGroup | null> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("crew_groups")
    .insert({ id: g.id, name: g.name, description: g.description, perms: g.perms, created_by: g.createdBy })
    .select("id, name, description, perms, builtin")
    .single();
  if (error) {
    if (error.code === UNIQUE_VIOLATION) return null;
    fail("crew_groups insert", error.message);
  }
  return toGroup(data as GroupRow);
}

export async function patchGroup(id: string, patch: { name: string; description: string; perms: string[] }): Promise<CrewGroup | null> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("crew_groups")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id, name, description, perms, builtin");
  if (error) fail("crew_groups update", error.message);
  const row = (data as GroupRow[] | null)?.[0];
  return row ? toGroup(row) : null;
}

export async function deleteGroup(id: string): Promise<boolean> {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("crew_groups").delete().eq("id", id).eq("builtin", false).select("id");
  if (error) fail("crew_groups delete", error.message);
  return !!data?.length;
}

// ---- who is on a job (0018) ----------------------------------------------------

type JobPersonRow = { job_id: string; email: string; role: string };

function toJobPerson(r: JobPersonRow): CrewJobPerson {
  return { jobId: r.job_id, email: r.email, role: (JOB_ROLES as readonly string[]).includes(r.role) ? (r.role as CrewJobRole) : "crew" };
}

/** Everyone on every job, or one person's jobs. */
export async function listJobPeople(filter: { email?: string } = {}): Promise<CrewJobPerson[]> {
  const db = getSupabaseAdmin();
  let q = db.from("crew_job_people").select("job_id, email, role").order("job_id", { ascending: true });
  if (filter.email) q = q.eq("email", filter.email);
  const { data, error } = await q;
  if (error) fail("crew_job_people list", error.message);
  return ((data ?? []) as JobPersonRow[]).map(toJobPerson);
}

/** Who is on a job, replaced as a whole: the owner's picker sends the full list. */
export async function setJobPeople(jobId: string, people: { email: string; role: CrewJobRole }[], by: string): Promise<CrewJobPerson[]> {
  const db = getSupabaseAdmin();
  const keep = people.map((p) => p.email);
  let del = db.from("crew_job_people").delete().eq("job_id", jobId);
  if (keep.length) del = del.not("email", "in", `(${keep.map((e) => `"${e}"`).join(",")})`);
  const gone = await del;
  if (gone.error) fail("crew_job_people delete", gone.error.message);
  if (people.length) {
    const { error } = await db
      .from("crew_job_people")
      .upsert(people.map((p) => ({ job_id: jobId, email: p.email, role: p.role, created_by: by })), { onConflict: "job_id,email" });
    if (error) fail("crew_job_people upsert", error.message);
  }
  return (await listJobPeople()).filter((p) => p.jobId === jobId);
}

// ---- billing jobs (public.jobs, 0012), for the link -------------------------------

type BillingJobRow = { id: string; name: string; client_name: string | null; number_prefix: string | null; crew_job_id: string | null };

export async function listBillingJobs(): Promise<BillingJobRef[]> {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("jobs").select("id, name, client_name, number_prefix, crew_job_id").order("name", { ascending: true });
  if (error) fail("jobs list", error.message);
  return ((data ?? []) as BillingJobRow[]).map((r) => ({ id: r.id, name: r.name, client: r.client_name ?? "", prefix: r.number_prefix ?? "", crewJobId: r.crew_job_id }));
}

/**
 * Point a field job at its billing job (jobs.crew_job_id, unique), or at none.
 * -> "taken" when that billing job already belongs to another field job.
 */
export async function linkBillingJob(crewJobId: string, billingJobId: string | null): Promise<"ok" | "taken" | "missing"> {
  const db = getSupabaseAdmin();
  if (billingJobId) {
    const { data, error } = await db.from("jobs").select("id, crew_job_id").eq("id", billingJobId).maybeSingle();
    if (error) fail("jobs read", error.message);
    if (!data) return "missing";
    const current = (data as { crew_job_id: string | null }).crew_job_id;
    if (current && current !== crewJobId) return "taken";
  }
  let clear = db.from("jobs").update({ crew_job_id: null }).eq("crew_job_id", crewJobId);
  if (billingJobId) clear = clear.neq("id", billingJobId);
  const cleared = await clear;
  if (cleared.error) fail("jobs unlink", cleared.error.message);
  if (billingJobId) {
    const { error } = await db.from("jobs").update({ crew_job_id: crewJobId }).eq("id", billingJobId);
    if (error) fail("jobs link", error.message);
  }
  return "ok";
}

// ---- jobs ---------------------------------------------------------------------

type JobRow = { id: string; name: string; address: string; note: string; active: boolean; promised?: string | null; promise_note?: string; geo?: unknown };

const JOB_COLS = "id, name, address, note, active, promised, promise_note, geo";

function toJob(r: JobRow): CrewJob {
  const geo = asGeo(r.geo);
  return {
    id: r.id,
    name: r.name,
    address: r.address,
    note: r.note,
    active: r.active,
    promised: r.promised ?? null,
    promiseNote: r.promise_note ?? "",
    geo: geo ? { lat: geo.lat, lng: geo.lng } : null,
  };
}

export async function listJobs(): Promise<CrewJob[]> {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("crew_jobs").select(JOB_COLS).order("name", { ascending: true });
  if (error) fail("crew_jobs list", error.message);
  return ((data ?? []) as JobRow[]).map(toJob);
}

export async function getJob(id: string): Promise<CrewJob | null> {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("crew_jobs").select(JOB_COLS).eq("id", id).maybeSingle();
  if (error) fail("crew_jobs read", error.message);
  return data ? toJob(data as JobRow) : null;
}

/** -> null when a job with that id already exists. */
export async function insertJob(job: {
  id: string;
  name: string;
  address: string;
  note: string;
  promised: string | null;
  promiseNote: string;
  createdBy: string;
}): Promise<CrewJob | null> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("crew_jobs")
    .insert({
      id: job.id,
      name: job.name,
      address: job.address,
      note: job.note,
      promised: job.promised,
      promise_note: job.promiseNote,
      created_by: job.createdBy,
    })
    .select(JOB_COLS)
    .single();
  if (error) {
    if (error.code === UNIQUE_VIOLATION) return null;
    fail("crew_jobs insert", error.message);
  }
  return toJob(data as JobRow);
}

export async function patchJob(
  id: string,
  patch: Partial<{ name: string; address: string; note: string; active: boolean; promised: string | null; promise_note: string; geo: CrewJobGeo | null }>,
): Promise<CrewJob | null> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("crew_jobs")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select(JOB_COLS);
  if (error) fail("crew_jobs update", error.message);
  const row = (data as JobRow[] | null)?.[0];
  return row ? toJob(row) : null;
}

// ---- job phases (0024) ----------------------------------------------------------

type PhaseRow = {
  id: number;
  job_id: string;
  ord: number;
  name: string;
  trade: string;
  planned_from: string | null;
  planned_to: string | null;
  verified_by: string;
  verified_at: string | null;
  note: string;
  created_by: string;
};

const PHASE_COLS = "id, job_id, ord, name, trade, planned_from, planned_to, verified_by, verified_at, note, created_by";

function toPhase(r: PhaseRow): CrewJobPhase {
  return {
    id: r.id,
    jobId: r.job_id,
    ord: r.ord,
    name: r.name,
    trade: r.trade ?? "",
    plannedFrom: r.planned_from ?? null,
    plannedTo: r.planned_to ?? null,
    verifiedBy: r.verified_by ?? "",
    verifiedAt: r.verified_at ?? null,
    note: r.note ?? "",
    createdBy: r.created_by ?? "",
  };
}

/** Every job's phases in order, or one job's. */
export async function listJobPhases(filter: { jobId?: string } = {}): Promise<CrewJobPhase[]> {
  const db = getSupabaseAdmin();
  let q = db.from("crew_job_phases").select(PHASE_COLS);
  if (filter.jobId) q = q.eq("job_id", filter.jobId);
  const { data, error } = await q.order("job_id", { ascending: true }).order("ord", { ascending: true }).limit(2000);
  if (error) fail("crew_job_phases list", error.message);
  return ((data ?? []) as PhaseRow[]).map(toPhase);
}

export async function getJobPhase(id: number): Promise<CrewJobPhase | null> {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("crew_job_phases").select(PHASE_COLS).eq("id", id).maybeSingle();
  if (error) fail("crew_job_phases read", error.message);
  return data ? toPhase(data as PhaseRow) : null;
}

export type NewPhase = { jobId: string; ord: number; name: string; trade: string; plannedFrom: string | null; plannedTo: string | null; createdBy: string };

export async function insertJobPhases(rows: NewPhase[]): Promise<CrewJobPhase[]> {
  if (!rows.length) return [];
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("crew_job_phases")
    .insert(
      rows.map((r) => ({
        job_id: r.jobId,
        ord: r.ord,
        name: r.name,
        trade: r.trade,
        planned_from: r.plannedFrom,
        planned_to: r.plannedTo,
        created_by: r.createdBy,
      })),
    )
    .select(PHASE_COLS);
  if (error) fail("crew_job_phases insert", error.message);
  return ((data ?? []) as PhaseRow[]).map(toPhase);
}

/**
 * -> null when the phase is gone, or `only` does not hold: verified: true
 * patches only a verified phase, false only an unverified one (so two people
 * verifying at once cannot both win).
 */
export async function patchJobPhase(
  id: number,
  patch: Partial<{ name: string; trade: string; planned_from: string | null; planned_to: string | null; verified_by: string; verified_at: string | null; note: string }>,
  only?: { verified?: boolean },
): Promise<CrewJobPhase | null> {
  const db = getSupabaseAdmin();
  let q = db.from("crew_job_phases").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
  if (only?.verified === true) q = q.not("verified_at", "is", null);
  if (only?.verified === false) q = q.is("verified_at", null);
  const { data, error } = await q.select(PHASE_COLS);
  if (error) fail("crew_job_phases update", error.message);
  const row = (data as PhaseRow[] | null)?.[0];
  return row ? toPhase(row) : null;
}

/**
 * Re-make a job's list: the unverified phases go, the verified ones (`keep`)
 * move to their new positions, and `add` is inserted. Kept rows are parked at
 * a negative ord first so the unique (job_id, ord) never collides while they
 * move. -> the job's phases afterwards.
 */
export async function replaceJobPhases(
  jobId: string,
  keep: { id: number; ord: number; trade: string; plannedFrom: string | null; plannedTo: string | null }[],
  add: NewPhase[],
): Promise<CrewJobPhase[]> {
  const db = getSupabaseAdmin();
  const gone = await db.from("crew_job_phases").delete().eq("job_id", jobId).is("verified_at", null);
  if (gone.error) fail("crew_job_phases delete", gone.error.message);
  for (const k of keep) {
    const parked = await db.from("crew_job_phases").update({ ord: -k.id }).eq("id", k.id).eq("job_id", jobId);
    if (parked.error) fail("crew_job_phases park", parked.error.message);
  }
  const at = new Date().toISOString();
  for (const k of keep) {
    const moved = await db
      .from("crew_job_phases")
      .update({ ord: k.ord, trade: k.trade, planned_from: k.plannedFrom, planned_to: k.plannedTo, updated_at: at })
      .eq("id", k.id)
      .eq("job_id", jobId);
    if (moved.error) fail("crew_job_phases move", moved.error.message);
  }
  await insertJobPhases(add);
  return listJobPhases({ jobId });
}

/** The day of the earliest kept shift on each of these jobs (none when nobody has clocked in there). */
export async function firstShiftDays(jobIds: string[]): Promise<Record<string, string>> {
  const db = getSupabaseAdmin();
  const out: Record<string, string> = {};
  await Promise.all(
    jobIds.map(async (id) => {
      const { data, error } = await db.from("crew_shifts").select("day").eq("job_id", id).eq("status", "ok").order("day", { ascending: true }).limit(1);
      if (error) fail("crew_shifts first", error.message);
      const day = (data as { day: string }[] | null)?.[0]?.day;
      if (day) out[id] = day;
    }),
  );
  return out;
}

// ---- shifts -------------------------------------------------------------------

type ShiftRow = {
  id: number;
  email: string;
  job_id: string;
  job_name: string;
  day: string;
  started_at: string;
  ended_at: string | null;
  break_min: number;
  start_geo: unknown;
  end_geo: unknown;
  note: string;
  source: string;
  end_source: string | null;
  review: string;
  status: string;
  edits: unknown;
  client_in: string | null;
  client_out: string | null;
};

export type CrewShiftRow = CrewShift & { clientIn: string | null; clientOut: string | null };

function toShift(r: ShiftRow): CrewShiftRow {
  return {
    id: r.id,
    email: r.email,
    jobId: r.job_id,
    jobName: r.job_name,
    day: r.day,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    breakMin: r.break_min,
    startGeo: asGeo(r.start_geo),
    endGeo: asGeo(r.end_geo),
    note: r.note,
    source: r.source === "late" || r.source === "office" ? r.source : "app",
    endSource: (["app", "late", "reported", "office"] as const).find((s) => s === r.end_source) ?? null,
    review: r.review,
    status: r.status === "void" ? "void" : "ok",
    edits: Array.isArray(r.edits) ? (r.edits as ShiftEdit[]) : [],
    // Figured against the job once the jobs are in hand (withJobDistance); a row alone does not know where its job is.
    fromJobM: { in: null, out: null },
    clientIn: r.client_in,
    clientOut: r.client_out,
  };
}

/** The same shifts with each punch measured against its job's place on the map (null where either side is unknown). */
export function withJobDistance<T extends Pick<CrewShift, "jobId" | "startGeo" | "endGeo" | "fromJobM">>(shifts: T[], jobs: Pick<CrewJob, "id" | "geo">[]): T[] {
  const where = new Map(jobs.map((j) => [j.id, j.geo]));
  return shifts.map((s) => ({ ...s, fromJobM: fromJobOf(s, where.get(s.jobId)) }));
}

export async function getShift(id: number): Promise<CrewShiftRow | null> {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("crew_shifts").select("*").eq("id", id).maybeSingle();
  if (error) fail("crew_shifts read", error.message);
  return data ? toShift(data as ShiftRow) : null;
}

export async function openShift(email: string): Promise<CrewShiftRow | null> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("crew_shifts")
    .select("*")
    .eq("email", email)
    .eq("status", "ok")
    .is("ended_at", null)
    .order("id", { ascending: false })
    .limit(1);
  if (error) fail("crew_shifts open read", error.message);
  const row = (data as ShiftRow[] | null)?.[0];
  return row ? toShift(row) : null;
}

/** The person's most recent shift, open or closed. */
export async function lastShift(email: string): Promise<CrewShiftRow | null> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("crew_shifts")
    .select("*")
    .eq("email", email)
    .eq("status", "ok")
    .order("started_at", { ascending: false })
    .limit(1);
  if (error) fail("crew_shifts last read", error.message);
  const row = (data as ShiftRow[] | null)?.[0];
  return row ? toShift(row) : null;
}

export async function listShifts(filter: { email?: string; fromDay: string; toDay?: string; includeVoid?: boolean }): Promise<CrewShiftRow[]> {
  const db = getSupabaseAdmin();
  let q = db.from("crew_shifts").select("*").gte("day", filter.fromDay);
  if (filter.toDay) q = q.lte("day", filter.toDay);
  if (filter.email) q = q.eq("email", filter.email);
  if (!filter.includeVoid) q = q.eq("status", "ok");
  const { data, error } = await q.order("started_at", { ascending: true }).limit(2000);
  if (error) fail("crew_shifts list", error.message);
  return ((data ?? []) as ShiftRow[]).map(toShift);
}

/** Everyone on the clock right now, whatever day they started. */
export async function listOpenShifts(): Promise<CrewShiftRow[]> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("crew_shifts")
    .select("*")
    .eq("status", "ok")
    .is("ended_at", null)
    .order("started_at", { ascending: true })
    .limit(200);
  if (error) fail("crew_shifts open list", error.message);
  return ((data ?? []) as ShiftRow[]).map(toShift);
}

export type NewShift = {
  email: string;
  jobId: string;
  jobName: string;
  day: string;
  startedAt: string;
  endedAt?: string | null;
  breakMin?: number;
  startGeo?: Geo | null;
  note?: string;
  source: "app" | "late" | "office";
  endSource?: "office" | null;
  review?: string;
  clientIn?: string | null;
  edits?: ShiftEdit[];
};

/** -> conflict when the person already has an open shift (the unique index refused it). */
export async function insertShift(s: NewShift): Promise<{ shift: CrewShiftRow | null; conflict: boolean }> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("crew_shifts")
    .insert({
      email: s.email,
      job_id: s.jobId,
      job_name: s.jobName,
      day: s.day,
      started_at: s.startedAt,
      ended_at: s.endedAt ?? null,
      break_min: s.breakMin ?? 0,
      start_geo: s.startGeo ?? null,
      note: s.note ?? "",
      source: s.source,
      end_source: s.endSource ?? null,
      review: s.review ?? "",
      client_in: s.clientIn ?? null,
      edits: s.edits ?? [],
    })
    .select("*")
    .single();
  if (error) {
    if (error.code === UNIQUE_VIOLATION) return { shift: null, conflict: true };
    fail("crew_shifts insert", error.message);
  }
  return { shift: toShift(data as ShiftRow), conflict: false };
}

/** Close a shift that is still open. -> null when it was already closed by something else. */
export async function closeShift(
  id: number,
  fields: { endedAt: string; breakMin: number; endGeo: Geo | null; note: string; endSource: "app" | "late" | "reported" | "office"; review: string; clientOut: string | null },
): Promise<CrewShiftRow | null> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("crew_shifts")
    .update({
      ended_at: fields.endedAt,
      break_min: fields.breakMin,
      end_geo: fields.endGeo,
      note: fields.note,
      end_source: fields.endSource,
      review: fields.review,
      client_out: fields.clientOut,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "ok")
    .is("ended_at", null)
    .select("*");
  if (error) fail("crew_shifts close", error.message);
  const row = (data as ShiftRow[] | null)?.[0];
  return row ? toShift(row) : null;
}

/** An owner's change. -> conflict when reopening would put the person on the clock twice. */
export async function patchShift(
  id: number,
  patch: Partial<{
    job_id: string;
    job_name: string;
    day: string;
    started_at: string;
    ended_at: string | null;
    break_min: number;
    end_source: string | null;
    review: string;
    status: "ok" | "void";
    edits: ShiftEdit[];
  }>,
): Promise<{ shift: CrewShiftRow | null; conflict: boolean }> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("crew_shifts")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*");
  if (error) {
    if (error.code === UNIQUE_VIOLATION) return { shift: null, conflict: true };
    fail("crew_shifts update", error.message);
  }
  const row = (data as ShiftRow[] | null)?.[0];
  return { shift: row ? toShift(row) : null, conflict: false };
}

// ---- entries ------------------------------------------------------------------

type EntryRow = {
  id: number;
  email: string;
  kind: string;
  day: string;
  job_id: string;
  job_name: string;
  body: string;
  data: unknown;
  files: unknown;
  status: string;
  bot: unknown;
  bot_at: string | null;
  decided_by: string;
  created_at: string;
};

function toEntry(r: EntryRow): CrewEntry {
  return {
    id: r.id,
    email: r.email,
    kind: (["receipt", "progress", "eod", "note", "timefix"] as const).find((k) => k === r.kind) ?? "note",
    day: r.day,
    jobId: r.job_id,
    jobName: r.job_name,
    body: r.body,
    data: asRecord(r.data),
    files: asFiles(r.files),
    status: (["new", "filed", "needs", "approved", "denied"] as const).find((s) => s === r.status) ?? "new",
    bot: asRecord(r.bot),
    botAt: r.bot_at,
    decidedBy: r.decided_by,
    createdAt: r.created_at,
  };
}

export type NewEntry = {
  email: string;
  kind: CrewEntryKind;
  day: string;
  jobId: string;
  jobName: string;
  body: string;
  data: Record<string, unknown>;
  files: BotFileRef[];
  clientId: string;
};

/** Insert, or hand back the entry an earlier attempt already made (same client id). */
export async function insertEntry(e: NewEntry): Promise<{ entry: CrewEntry; existed: boolean }> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("crew_entries")
    .insert({
      email: e.email,
      kind: e.kind,
      day: e.day,
      job_id: e.jobId,
      job_name: e.jobName,
      body: e.body,
      data: e.data,
      files: e.files,
      client_id: e.clientId,
    })
    .select("*")
    .single();
  if (!error) return { entry: toEntry(data as EntryRow), existed: false };
  if (error.code !== UNIQUE_VIOLATION) fail("crew_entries insert", error.message);
  const { data: prior, error: e2 } = await db
    .from("crew_entries")
    .select("*")
    .eq("email", e.email)
    .eq("client_id", e.clientId)
    .maybeSingle();
  if (e2 || !prior) fail("crew_entries insert", e2?.message ?? "the earlier copy could not be read");
  return { entry: toEntry(prior as EntryRow), existed: true };
}

export async function getEntry(id: number): Promise<CrewEntry | null> {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("crew_entries").select("*").eq("id", id).maybeSingle();
  if (error) fail("crew_entries read", error.message);
  return data ? toEntry(data as EntryRow) : null;
}

export async function listEntries(filter: { email?: string; fromDay: string; limit?: number }): Promise<CrewEntry[]> {
  const db = getSupabaseAdmin();
  let q = db.from("crew_entries").select("*").gte("day", filter.fromDay);
  if (filter.email) q = q.eq("email", filter.email);
  const { data, error } = await q.order("id", { ascending: false }).limit(filter.limit ?? 200);
  if (error) fail("crew_entries list", error.message);
  return ((data ?? []) as EntryRow[]).map(toEntry);
}

/** Entries the Mac has not filed yet, oldest first, whatever day they are from. */
export async function listUnfiledEntries(limit = 40): Promise<CrewEntry[]> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("crew_entries")
    .select("*")
    .is("bot_at", null)
    .neq("kind", "timefix")
    .order("id", { ascending: true })
    .limit(limit);
  if (error) fail("crew_entries unfiled list", error.message);
  return ((data ?? []) as EntryRow[]).map(toEntry);
}

export async function countEntries(email: string, day: string): Promise<number> {
  const db = getSupabaseAdmin();
  const { count, error } = await db.from("crew_entries").select("id", { count: "exact", head: true }).eq("email", email).eq("day", day);
  if (error) fail("crew_entries count", error.message);
  return count ?? 0;
}

export async function patchEntry(
  id: number,
  patch: Partial<{ status: CrewEntryStatus; bot: Record<string, unknown>; bot_at: string | null; data: Record<string, unknown>; decided_by: string }>,
  only?: { status?: CrewEntryStatus },
): Promise<CrewEntry | null> {
  const db = getSupabaseAdmin();
  let q = db
    .from("crew_entries")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (only?.status) q = q.eq("status", only.status);
  const { data, error } = await q.select("*");
  if (error) fail("crew_entries update", error.message);
  const row = (data as EntryRow[] | null)?.[0];
  return row ? toEntry(row) : null;
}

// ---- schedule -----------------------------------------------------------------

type ScheduleRow = {
  id: number;
  day: string;
  email: string;
  job_id: string;
  job_name: string;
  start_time: string;
  note: string;
  priority?: number | null;
  ack: string;
  ack_note: string;
  ack_at: string | null;
  created_by: string;
};

function toSchedule(r: ScheduleRow): CrewScheduleItem {
  return {
    id: r.id,
    day: r.day,
    email: r.email,
    jobId: r.job_id,
    jobName: r.job_name,
    startTime: r.start_time,
    note: r.note,
    priority: r.priority ?? null,
    ack: r.ack === "ok" || r.ack === "cant" ? r.ack : "",
    ackNote: r.ack_note,
    ackAt: r.ack_at,
    createdBy: r.created_by,
  };
}

export async function listSchedule(filter: { email?: string; fromDay: string; toDay: string }): Promise<CrewScheduleItem[]> {
  const db = getSupabaseAdmin();
  let q = db.from("crew_schedule").select("*").gte("day", filter.fromDay).lte("day", filter.toDay);
  if (filter.email) q = q.eq("email", filter.email);
  const { data, error } = await q.order("day", { ascending: true }).order("start_time", { ascending: true }).limit(2000);
  if (error) fail("crew_schedule list", error.message);
  return ((data ?? []) as ScheduleRow[]).map(toSchedule);
}

export async function getScheduleItem(id: number): Promise<CrewScheduleItem | null> {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("crew_schedule").select("*").eq("id", id).maybeSingle();
  if (error) fail("crew_schedule read", error.message);
  return data ? toSchedule(data as ScheduleRow) : null;
}

export type NewSchedule = {
  day: string;
  email: string;
  jobId: string;
  jobName: string;
  startTime: string;
  note: string;
  /** undefined leaves an existing row's priority as it was. */
  priority?: number | null;
  createdBy: string;
};

/**
 * Put people on a job for a day. Someone already on that job that day keeps
 * their row, with the new time and note, and their "got it" is cleared only
 * if something they agreed to changed.
 */
export async function upsertSchedule(rows: NewSchedule[]): Promise<CrewScheduleItem[]> {
  if (!rows.length) return [];
  const db = getSupabaseAdmin();
  const out: CrewScheduleItem[] = [];
  for (const r of rows) {
    const { data: existing, error: e1 } = await db
      .from("crew_schedule")
      .select("*")
      .eq("day", r.day)
      .eq("email", r.email)
      .eq("job_id", r.jobId)
      .maybeSingle();
    if (e1) fail("crew_schedule read", e1.message);
    const now = new Date().toISOString();
    if (existing) {
      const was = existing as ScheduleRow;
      const changed = was.start_time !== r.startTime || was.note !== r.note;
      const { data, error } = await db
        .from("crew_schedule")
        .update({
          job_name: r.jobName,
          start_time: r.startTime,
          note: r.note,
          ...(r.priority !== undefined ? { priority: r.priority } : {}),
          updated_at: now,
          ...(changed ? { ack: "", ack_note: "", ack_at: null } : {}),
        })
        .eq("id", was.id)
        .select("*")
        .single();
      if (error) fail("crew_schedule update", error.message);
      out.push(toSchedule(data as ScheduleRow));
      continue;
    }
    const { data, error } = await db
      .from("crew_schedule")
      .insert({
        day: r.day,
        email: r.email,
        job_id: r.jobId,
        job_name: r.jobName,
        start_time: r.startTime,
        note: r.note,
        priority: r.priority ?? null,
        created_by: r.createdBy,
      })
      .select("*")
      .single();
    if (error) {
      if (error.code === UNIQUE_VIOLATION) continue; // someone else just added the same row
      fail("crew_schedule insert", error.message);
    }
    out.push(toSchedule(data as ScheduleRow));
  }
  return out;
}

export async function deleteSchedule(id: number): Promise<boolean> {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("crew_schedule").delete().eq("id", id).select("id");
  if (error) fail("crew_schedule delete", error.message);
  return !!data?.length;
}

export async function ackSchedule(id: number, email: string, ack: "ok" | "cant", note: string): Promise<CrewScheduleItem | null> {
  const db = getSupabaseAdmin();
  const now = new Date().toISOString();
  const { data, error } = await db
    .from("crew_schedule")
    .update({ ack, ack_note: note, ack_at: now, updated_at: now })
    .eq("id", id)
    .eq("email", email)
    .select("*");
  if (error) fail("crew_schedule ack", error.message);
  const row = (data as ScheduleRow[] | null)?.[0];
  return row ? toSchedule(row) : null;
}

// ---- tasks --------------------------------------------------------------------

type TaskRow = {
  id: number;
  email: string;
  title: string;
  detail: string;
  job_id: string;
  job_name: string;
  due: string | null;
  status: string;
  done_note: string;
  files: unknown;
  closed_at: string | null;
  priority?: number | null;
  reported_at?: string | null;
  verified_at?: string | null;
  verified_by?: string;
  sent_back?: number;
  created_by: string;
  created_at: string;
};

function toTask(r: TaskRow): CrewTask {
  return {
    id: r.id,
    email: r.email,
    title: r.title,
    detail: r.detail,
    jobId: r.job_id,
    jobName: r.job_name,
    due: r.due,
    status: (["open", "doing", "done", "blocked", "dropped"] as const).find((s) => s === r.status) ?? "open",
    doneNote: r.done_note,
    files: asFiles(r.files),
    closedAt: r.closed_at,
    priority: r.priority ?? null,
    reportedAt: r.reported_at ?? null,
    verifiedAt: r.verified_at ?? null,
    verifiedBy: r.verified_by ?? "",
    sentBack: r.sent_back ?? 0,
    createdBy: r.created_by,
    createdAt: r.created_at,
  };
}

/**
 * Live tasks (not started, started, waiting), tasks reported done that nobody
 * has checked yet (however old), plus the ones closed since `closedSince`.
 */
export async function listTasks(filter: { email?: string; closedSince: string }): Promise<CrewTask[]> {
  const db = getSupabaseAdmin();
  let live = db.from("crew_tasks").select("*").in("status", ["open", "doing", "blocked"]);
  let unchecked = db.from("crew_tasks").select("*").eq("status", "done").is("verified_at", null);
  let closed = db.from("crew_tasks").select("*").in("status", ["done", "dropped"]).gte("closed_at", filter.closedSince);
  if (filter.email) {
    live = live.eq("email", filter.email);
    unchecked = unchecked.eq("email", filter.email);
    closed = closed.eq("email", filter.email);
  }
  const [a, u, b] = await Promise.all([
    live.order("id", { ascending: true }).limit(500),
    unchecked.order("id", { ascending: true }).limit(300),
    closed.order("closed_at", { ascending: false }).limit(200),
  ]);
  if (a.error) fail("crew_tasks list", a.error.message);
  if (u.error) fail("crew_tasks list", u.error.message);
  if (b.error) fail("crew_tasks list", b.error.message);
  const seen = new Set<number>();
  return [...((a.data ?? []) as TaskRow[]), ...((u.data ?? []) as TaskRow[]), ...((b.data ?? []) as TaskRow[])]
    .filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)))
    .map(toTask);
}

export async function getTask(id: number): Promise<CrewTask | null> {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("crew_tasks").select("*").eq("id", id).maybeSingle();
  if (error) fail("crew_tasks read", error.message);
  return data ? toTask(data as TaskRow) : null;
}

export type NewTask = {
  email: string;
  title: string;
  detail: string;
  jobId: string;
  jobName: string;
  due: string | null;
  priority?: number | null;
  createdBy: string;
};

export async function insertTasks(rows: NewTask[]): Promise<CrewTask[]> {
  if (!rows.length) return [];
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("crew_tasks")
    .insert(
      rows.map((r) => ({
        email: r.email,
        title: r.title,
        detail: r.detail,
        job_id: r.jobId,
        job_name: r.jobName,
        due: r.due,
        priority: r.priority ?? null,
        created_by: r.createdBy,
      })),
    )
    .select("*");
  if (error) fail("crew_tasks insert", error.message);
  return ((data ?? []) as TaskRow[]).map(toTask);
}

export async function patchTask(
  id: number,
  patch: Partial<{
    status: CrewTaskStatus;
    title: string;
    detail: string;
    due: string | null;
    done_note: string;
    files: BotFileRef[];
    closed_at: string | null;
    priority: number | null;
    reported_at: string | null;
    verified_at: string | null;
    verified_by: string;
    sent_back: number;
  }>,
  only?: { email?: string; status?: CrewTaskStatus; unverified?: boolean },
): Promise<CrewTask | null> {
  const db = getSupabaseAdmin();
  let q = db
    .from("crew_tasks")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (only?.email) q = q.eq("email", only.email);
  if (only?.status) q = q.eq("status", only.status);
  if (only?.unverified) q = q.is("verified_at", null);
  const { data, error } = await q.select("*");
  if (error) fail("crew_tasks update", error.message);
  const row = (data as TaskRow[] | null)?.[0];
  return row ? toTask(row) : null;
}

/** A task the bot already made for this person with this title is not made twice. */
export async function taskExists(email: string, title: string): Promise<boolean> {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("crew_tasks").select("id").eq("email", email).eq("title", title).in("status", ["open", "doing", "blocked"]).limit(1);
  if (error) fail("crew_tasks check", error.message);
  return !!data?.length;
}

// ---- pickups ------------------------------------------------------------------

type PickupRow = {
  id: number;
  day: string;
  job_id: string;
  job_name: string;
  supplier: string;
  place: string;
  order_ref: string;
  items: string;
  note: string;
  email: string;
  status: string;
  runner_note: string;
  files: unknown;
  picked_by: string;
  picked_at: string | null;
  delivered_at: string | null;
  created_by: string;
  created_at: string;
};

const PICKUP_STATUSES: CrewPickupStatus[] = ["staged", "picked", "delivered", "problem", "cancelled"];

function toPickup(r: PickupRow): CrewPickup {
  return {
    id: r.id,
    day: r.day,
    jobId: r.job_id,
    jobName: r.job_name,
    supplier: r.supplier,
    place: r.place,
    orderRef: r.order_ref,
    items: r.items,
    note: r.note,
    email: r.email,
    status: PICKUP_STATUSES.find((s) => s === r.status) ?? "staged",
    runnerNote: r.runner_note,
    files: asFiles(r.files),
    pickedBy: r.picked_by,
    pickedAt: r.picked_at,
    deliveredAt: r.delivered_at,
    createdBy: r.created_by,
    createdAt: r.created_at,
  };
}

/** Everything not finished, plus what was finished or cancelled on or after `fromDay`. */
export async function listPickups(filter: { fromDay: string; email?: string }): Promise<CrewPickup[]> {
  const db = getSupabaseAdmin();
  let open = db.from("crew_pickups").select("*").in("status", ["staged", "picked", "problem"]);
  let recent = db.from("crew_pickups").select("*").in("status", ["delivered", "cancelled"]).gte("day", filter.fromDay);
  if (filter.email !== undefined) {
    // A runner sees what names them and what names nobody.
    open = open.in("email", [filter.email, ""]);
    recent = recent.in("email", [filter.email, ""]);
  }
  const [a, b] = await Promise.all([open.order("day", { ascending: true }).order("id").limit(300), recent.order("id", { ascending: false }).limit(200)]);
  if (a.error) fail("crew_pickups list", a.error.message);
  if (b.error) fail("crew_pickups list", b.error.message);
  return [...((a.data ?? []) as PickupRow[]), ...((b.data ?? []) as PickupRow[])].map(toPickup);
}

export async function getPickup(id: number): Promise<CrewPickup | null> {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("crew_pickups").select("*").eq("id", id).maybeSingle();
  if (error) fail("crew_pickups read", error.message);
  return data ? toPickup(data as PickupRow) : null;
}

export type NewPickup = {
  day: string;
  jobId: string;
  jobName: string;
  supplier: string;
  place: string;
  orderRef: string;
  items: string;
  note: string;
  email: string;
  createdBy: string;
};

export async function insertPickup(p: NewPickup): Promise<CrewPickup> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("crew_pickups")
    .insert({
      day: p.day,
      job_id: p.jobId,
      job_name: p.jobName,
      supplier: p.supplier,
      place: p.place,
      order_ref: p.orderRef,
      items: p.items,
      note: p.note,
      email: p.email,
      created_by: p.createdBy,
    })
    .select("*")
    .single();
  if (error) fail("crew_pickups insert", error.message);
  return toPickup(data as PickupRow);
}

export async function patchPickup(
  id: number,
  patch: Partial<{
    day: string;
    status: CrewPickupStatus;
    email: string;
    note: string;
    runner_note: string;
    files: BotFileRef[];
    picked_by: string;
    picked_at: string | null;
    delivered_at: string | null;
  }>,
  only?: { statusIn?: CrewPickupStatus[] },
): Promise<CrewPickup | null> {
  const db = getSupabaseAdmin();
  let q = db
    .from("crew_pickups")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (only?.statusIn) q = q.in("status", only.statusIn);
  const { data, error } = await q.select("*");
  if (error) fail("crew_pickups update", error.message);
  const row = (data as PickupRow[] | null)?.[0];
  return row ? toPickup(row) : null;
}

// ---- the nightly plan ---------------------------------------------------------

type ReportRow = { id: number; day: string; sent_by: string; sent_name: string; body: string; created_at: string; data?: Record<string, unknown> | null };

const REPORT_COLS = "id, day, sent_by, sent_name, body, created_at, data";

function toAnswer(v: unknown): CrewReportAnswer | null {
  if (!v || typeof v !== "object") return null;
  const a = v as Record<string, unknown>;
  return typeof a.text === "string" && typeof a.at === "string"
    ? { text: a.text, by: String(a.by ?? ""), name: String(a.name ?? ""), at: a.at }
    : null;
}

function toReport(r: ReportRow): CrewReport {
  return { id: r.id, day: r.day, sentBy: r.sent_by, sentName: r.sent_name, body: r.body, createdAt: r.created_at, answer: toAnswer(r.data?.answer) };
}

export async function listReports(fromDay: string): Promise<CrewReport[]> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("crew_reports")
    .select(REPORT_COLS)
    .gte("day", fromDay)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) fail("crew_reports list", error.message);
  return ((data ?? []) as ReportRow[]).map(toReport);
}

export async function insertReport(r: { day: string; sentBy: string; sentName: string; body: string; data: Record<string, unknown> }): Promise<CrewReport> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("crew_reports")
    .insert({ day: r.day, sent_by: r.sentBy, sent_name: r.sentName, body: r.body, data: r.data })
    .select(REPORT_COLS)
    .single();
  if (error) fail("crew_reports insert", error.message);
  return toReport(data as ReportRow);
}

export async function getReport(id: number): Promise<(CrewReport & { data: Record<string, unknown> }) | null> {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("crew_reports").select(REPORT_COLS).eq("id", id).maybeSingle();
  if (error) fail("crew_reports get", error.message);
  if (!data) return null;
  const row = data as ReportRow;
  return { ...toReport(row), data: row.data ?? {} };
}

/** Records an owner's answer, only if nobody answered first. Null when someone did. */
export async function answerReport(report: { id: number; data: Record<string, unknown> }, answer: CrewReportAnswer): Promise<CrewReport | null> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("crew_reports")
    .update({ data: { ...report.data, answer } })
    .eq("id", report.id)
    .is("data->answer", null)
    .select(REPORT_COLS)
    .maybeSingle();
  if (error) fail("crew_reports answer", error.message);
  return data ? toReport(data as ReportRow) : null;
}

// ---- questions ----------------------------------------------------------------

type QuestionRow = {
  id: number;
  email: string;
  body: string;
  body_es: string;
  options: unknown;
  kind: string;
  ref: unknown;
  asked_by: string;
  status: string;
  answer: string;
  answered_at: string | null;
  bot_seen_at: string | null;
  created_at: string;
};

function asOptions(v: unknown): CrewOption[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((o) => {
    const r = asRecord(o);
    return typeof r.v === "string" && typeof r.en === "string" ? [{ v: r.v, en: r.en, es: typeof r.es === "string" ? r.es : "" }] : [];
  });
}

function toQuestion(r: QuestionRow): CrewQuestion {
  return {
    id: r.id,
    email: r.email,
    body: r.body,
    bodyEs: r.body_es,
    options: asOptions(r.options),
    kind: (["ask", "clockout", "amount", "eod", "late"] as const).find((k) => k === r.kind) ?? "ask",
    ref: asRecord(r.ref),
    askedBy: r.asked_by,
    status: (["open", "answered", "cancelled"] as const).find((s) => s === r.status) ?? "open",
    answer: r.answer,
    answeredAt: r.answered_at,
    botSeenAt: r.bot_seen_at,
    createdAt: r.created_at,
  };
}

/** Open questions, plus everything asked since `since`. */
export async function listQuestions(filter: { email?: string; since: string }): Promise<CrewQuestion[]> {
  const db = getSupabaseAdmin();
  let open = db.from("crew_questions").select("*").eq("status", "open");
  let recent = db.from("crew_questions").select("*").neq("status", "open").gte("created_at", filter.since);
  if (filter.email) {
    open = open.eq("email", filter.email);
    recent = recent.eq("email", filter.email);
  }
  const [a, b] = await Promise.all([open.order("id", { ascending: true }).limit(300), recent.order("id", { ascending: false }).limit(300)]);
  if (a.error) fail("crew_questions list", a.error.message);
  if (b.error) fail("crew_questions list", b.error.message);
  return [...((a.data ?? []) as QuestionRow[]), ...((b.data ?? []) as QuestionRow[])].map(toQuestion);
}

/** Answers the Mac has not read yet. */
export async function listUnseenAnswers(): Promise<CrewQuestion[]> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("crew_questions")
    .select("*")
    .eq("status", "answered")
    .is("bot_seen_at", null)
    .order("id", { ascending: true })
    .limit(200);
  if (error) fail("crew_questions unseen list", error.message);
  return ((data ?? []) as QuestionRow[]).map(toQuestion);
}

export async function getQuestion(id: number): Promise<CrewQuestion | null> {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("crew_questions").select("*").eq("id", id).maybeSingle();
  if (error) fail("crew_questions read", error.message);
  return data ? toQuestion(data as QuestionRow) : null;
}

export type NewQuestion = {
  email: string;
  body: string;
  bodyEs: string;
  options: CrewOption[];
  kind: CrewQuestionKind;
  ref: Record<string, unknown>;
  askedBy: string;
  dedupe: string | null;
};

/** -> null when a question with the same dedupe key was already asked. */
export async function insertQuestion(q: NewQuestion): Promise<CrewQuestion | null> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("crew_questions")
    .insert({ email: q.email, body: q.body, body_es: q.bodyEs, options: q.options, kind: q.kind, ref: q.ref, asked_by: q.askedBy, dedupe: q.dedupe })
    .select("*")
    .single();
  if (error) {
    if (error.code === UNIQUE_VIOLATION) return null;
    fail("crew_questions insert", error.message);
  }
  return toQuestion(data as QuestionRow);
}

/** Record an answer on a question that is still open. -> null when it is not. */
export async function answerQuestion(id: number, email: string, answer: string): Promise<CrewQuestion | null> {
  const db = getSupabaseAdmin();
  const now = new Date().toISOString();
  const { data, error } = await db
    .from("crew_questions")
    .update({ status: "answered", answer, answered_at: now, updated_at: now })
    .eq("id", id)
    .eq("email", email)
    .eq("status", "open")
    .select("*");
  if (error) fail("crew_questions answer", error.message);
  const row = (data as QuestionRow[] | null)?.[0];
  return row ? toQuestion(row) : null;
}

/** Close the open questions of one kind for a person (an end-of-day form answers the "eod" ask). */
export async function closeQuestions(email: string, kind: CrewQuestionKind, answer: string, refDay?: string): Promise<number> {
  const db = getSupabaseAdmin();
  const now = new Date().toISOString();
  let q = db
    .from("crew_questions")
    .update({ status: "answered", answer, answered_at: now, updated_at: now, bot_seen_at: now })
    .eq("email", email)
    .eq("kind", kind)
    .eq("status", "open");
  if (refDay) q = q.eq("ref->>day", refDay);
  const { data, error } = await q.select("id");
  if (error) fail("crew_questions close", error.message);
  return data?.length ?? 0;
}

export async function cancelQuestion(id: number): Promise<boolean> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("crew_questions")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "open")
    .select("id");
  if (error) fail("crew_questions cancel", error.message);
  return !!data?.length;
}

export async function markAnswersSeen(ids: number[]): Promise<number> {
  if (!ids.length) return 0;
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("crew_questions")
    .update({ bot_seen_at: new Date().toISOString() })
    .in("id", ids)
    .eq("status", "answered")
    .is("bot_seen_at", null)
    .select("id");
  if (error) fail("crew_questions seen", error.message);
  return data?.length ?? 0;
}

// ---- the owners' Home screen --------------------------------------------------

export type CrewSummary = {
  people: number;
  onClock: number;
  needs: number;
  /** Seats that check the others' work (tasks.verify): an owner can hand them a task from Home. */
  supervisors: { email: string; name: string }[];
};

/** Four counts, no rows: how many have a seat, how many are on the clock, how many things wait on an owner. */
export async function crewSummary(): Promise<CrewSummary> {
  const db = getSupabaseAdmin();
  const head = { count: "exact" as const, head: true };
  const [people, onClock, fixes, review, blocked] = await Promise.all([
    // Not a HEAD request, on purpose. A HEAD against a table that does not
    // exist comes back with no body, which reads as "no error, no count": the
    // summary would say "0 people" and the Crew tab would show before the
    // crew tables are there (migration 0011). A GET says what is wrong.
    db.from("crew_people").select("email", { count: "exact" }).eq("active", true).limit(1),
    db.from("crew_shifts").select("id", head).eq("status", "ok").is("ended_at", null),
    db.from("crew_entries").select("id", head).eq("kind", "timefix").eq("status", "new"),
    db.from("crew_shifts").select("id", head).eq("status", "ok").neq("review", ""),
    db.from("crew_tasks").select("id", head).eq("status", "blocked"),
  ]);
  for (const r of [people, onClock, fixes, review, blocked]) if (r.error) fail("crew summary", r.error.message);
  const supervisors = (await listPeople())
    .filter((p) => p.active && p.perms.includes("tasks.verify"))
    .map((p) => ({ email: p.email, name: p.name }));
  if (people.count === null) fail("crew summary", "no count came back for crew_people");
  return {
    people: people.count ?? 0,
    onClock: onClock.count ?? 0,
    needs: (fixes.count ?? 0) + (review.count ?? 0) + (blocked.count ?? 0),
    supervisors,
  };
}
