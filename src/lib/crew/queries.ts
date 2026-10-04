import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { BotFileRef } from "@/lib/bot/types";
import type {
  CrewEntry,
  CrewEntryKind,
  CrewEntryStatus,
  CrewJob,
  CrewLang,
  CrewOption,
  CrewPerson,
  CrewQuestion,
  CrewQuestionKind,
  CrewScheduleItem,
  CrewShift,
  CrewTask,
  CrewTaskStatus,
  Geo,
  ShiftEdit,
} from "./types";

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
  active: boolean;
  added_by: string;
  created_at: string;
  last_seen_at: string | null;
};

export type CrewPersonRow = CrewPerson & { authId: string | null };

function toPerson(r: PersonRow): CrewPersonRow {
  return {
    email: r.email,
    name: r.name,
    lang: (r.lang === "es" ? "es" : "en") as CrewLang,
    phone: r.phone,
    trade: r.trade,
    active: r.active,
    addedBy: r.added_by,
    createdAt: r.created_at,
    lastSeenAt: r.last_seen_at,
    authId: r.auth_id,
  };
}

export async function getPerson(email: string): Promise<CrewPersonRow | null> {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("crew_people").select("*").eq("email", email).maybeSingle();
  if (error) fail("crew_people read", error.message);
  return data ? toPerson(data as PersonRow) : null;
}

export async function listPeople(): Promise<CrewPersonRow[]> {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("crew_people").select("*").order("name", { ascending: true });
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
        active: true,
        added_by: p.addedBy,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "email" },
    )
    .select("*")
    .single();
  if (error) fail("crew_people save", error.message);
  return toPerson(data as PersonRow);
}

export async function patchPerson(
  email: string,
  patch: Partial<{ name: string; lang: CrewLang; phone: string; trade: string; active: boolean; auth_id: string | null }>,
): Promise<CrewPersonRow | null> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("crew_people")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("email", email)
    .select("*");
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

// ---- jobs ---------------------------------------------------------------------

type JobRow = { id: string; name: string; address: string; note: string; active: boolean };

function toJob(r: JobRow): CrewJob {
  return { id: r.id, name: r.name, address: r.address, note: r.note, active: r.active };
}

export async function listJobs(): Promise<CrewJob[]> {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("crew_jobs").select("id, name, address, note, active").order("name", { ascending: true });
  if (error) fail("crew_jobs list", error.message);
  return ((data ?? []) as JobRow[]).map(toJob);
}

export async function getJob(id: string): Promise<CrewJob | null> {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("crew_jobs").select("id, name, address, note, active").eq("id", id).maybeSingle();
  if (error) fail("crew_jobs read", error.message);
  return data ? toJob(data as JobRow) : null;
}

/** -> null when a job with that id already exists. */
export async function insertJob(job: { id: string; name: string; address: string; note: string; createdBy: string }): Promise<CrewJob | null> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("crew_jobs")
    .insert({ id: job.id, name: job.name, address: job.address, note: job.note, created_by: job.createdBy })
    .select("id, name, address, note, active")
    .single();
  if (error) {
    if (error.code === UNIQUE_VIOLATION) return null;
    fail("crew_jobs insert", error.message);
  }
  return toJob(data as JobRow);
}

export async function patchJob(id: string, patch: Partial<{ name: string; address: string; note: string; active: boolean }>): Promise<CrewJob | null> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("crew_jobs")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id, name, address, note, active");
  if (error) fail("crew_jobs update", error.message);
  const row = (data as JobRow[] | null)?.[0];
  return row ? toJob(row) : null;
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
    clientIn: r.client_in,
    clientOut: r.client_out,
  };
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

export type NewSchedule = { day: string; email: string; jobId: string; jobName: string; startTime: string; note: string; createdBy: string };

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
      .insert({ day: r.day, email: r.email, job_id: r.jobId, job_name: r.jobName, start_time: r.startTime, note: r.note, created_by: r.createdBy })
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
    status: (["open", "done", "blocked", "dropped"] as const).find((s) => s === r.status) ?? "open",
    doneNote: r.done_note,
    files: asFiles(r.files),
    closedAt: r.closed_at,
    createdBy: r.created_by,
    createdAt: r.created_at,
  };
}

/** Open and blocked tasks, plus the ones closed since `closedSince`. */
export async function listTasks(filter: { email?: string; closedSince: string }): Promise<CrewTask[]> {
  const db = getSupabaseAdmin();
  let live = db.from("crew_tasks").select("*").in("status", ["open", "blocked"]);
  let closed = db.from("crew_tasks").select("*").in("status", ["done", "dropped"]).gte("closed_at", filter.closedSince);
  if (filter.email) {
    live = live.eq("email", filter.email);
    closed = closed.eq("email", filter.email);
  }
  const [a, b] = await Promise.all([live.order("id", { ascending: true }).limit(500), closed.order("closed_at", { ascending: false }).limit(200)]);
  if (a.error) fail("crew_tasks list", a.error.message);
  if (b.error) fail("crew_tasks list", b.error.message);
  return [...((a.data ?? []) as TaskRow[]), ...((b.data ?? []) as TaskRow[])].map(toTask);
}

export async function getTask(id: number): Promise<CrewTask | null> {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("crew_tasks").select("*").eq("id", id).maybeSingle();
  if (error) fail("crew_tasks read", error.message);
  return data ? toTask(data as TaskRow) : null;
}

export type NewTask = { email: string; title: string; detail: string; jobId: string; jobName: string; due: string | null; createdBy: string };

export async function insertTasks(rows: NewTask[]): Promise<CrewTask[]> {
  if (!rows.length) return [];
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("crew_tasks")
    .insert(rows.map((r) => ({ email: r.email, title: r.title, detail: r.detail, job_id: r.jobId, job_name: r.jobName, due: r.due, created_by: r.createdBy })))
    .select("*");
  if (error) fail("crew_tasks insert", error.message);
  return ((data ?? []) as TaskRow[]).map(toTask);
}

export async function patchTask(
  id: number,
  patch: Partial<{ status: CrewTaskStatus; title: string; detail: string; due: string | null; done_note: string; files: BotFileRef[]; closed_at: string | null }>,
  only?: { email?: string },
): Promise<CrewTask | null> {
  const db = getSupabaseAdmin();
  let q = db
    .from("crew_tasks")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (only?.email) q = q.eq("email", only.email);
  const { data, error } = await q.select("*");
  if (error) fail("crew_tasks update", error.message);
  const row = (data as TaskRow[] | null)?.[0];
  return row ? toTask(row) : null;
}

/** A task the bot already made for this person with this title is not made twice. */
export async function taskExists(email: string, title: string): Promise<boolean> {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("crew_tasks").select("id").eq("email", email).eq("title", title).in("status", ["open", "blocked"]).limit(1);
  if (error) fail("crew_tasks check", error.message);
  return !!data?.length;
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

export type CrewSummary = { people: number; onClock: number; needs: number };

/** Four counts, no rows: how many have a seat, how many are on the clock, how many things wait on an owner. */
export async function crewSummary(): Promise<CrewSummary> {
  const db = getSupabaseAdmin();
  const head = { count: "exact" as const, head: true };
  const [people, onClock, fixes, review, blocked] = await Promise.all([
    db.from("crew_people").select("email", head).eq("active", true),
    db.from("crew_shifts").select("id", head).eq("status", "ok").is("ended_at", null),
    db.from("crew_entries").select("id", head).eq("kind", "timefix").eq("status", "new"),
    db.from("crew_shifts").select("id", head).eq("status", "ok").neq("review", ""),
    db.from("crew_tasks").select("id", head).eq("status", "blocked"),
  ]);
  for (const r of [people, onClock, fixes, review, blocked]) if (r.error) fail("crew summary", r.error.message);
  return {
    people: people.count ?? 0,
    onClock: onClock.count ?? 0,
    needs: (fixes.count ?? 0) + (review.count ?? 0) + (blocked.count ?? 0),
  };
}
