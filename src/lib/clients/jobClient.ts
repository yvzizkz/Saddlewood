import { findContact } from "@/lib/clients/contacts";
import type { JobRef } from "@/lib/jobs/hub";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

// Who a job is for, set on the job itself. The job points at a client and at
// one of that client's contacts; the database mirrors their name, email and
// phone onto the job (one client record, 0056), so this only ever writes
// client_id and contact_id. A job's client is set once: moving a job between
// clients moves its money, so that stays out of here.

export const CLIENT_KINDS = ["gc", "homeowner", "other"] as const;
export type ClientKind = (typeof CLIENT_KINDS)[number];
export const CONTACT_ROLES = ["ap", "pm", "principal", "other"] as const;
export type ContactRole = (typeof CONTACT_ROLES)[number];

const UNIQUE_VIOLATION = "23505";

export class JobClientError extends Error {
  constructor(
    message: string,
    readonly status = 409,
  ) {
    super(message);
  }
}

export type JobContact = { id: string; name: string; email: string; phone: string; role: string };

export type JobClient = {
  clientId: string | null;
  client: string;
  /** The name typed on a job with no client record. */
  typedName: string;
  contactId: string | null;
  email: string;
  phone: string;
  contacts: JobContact[];
  /** Clients a job with none can be linked to; only filled for a seat that can link one. */
  clients: { id: string; name: string }[];
};

type JobRow = { id: string; client_id: string | null; contact_id: string | null; client_name: string | null; client_email: string | null; client_phone: string | null };
const JOB_COLS = "id, client_id, contact_id, client_name, client_email, client_phone";

/**
 * What a first contact would wipe off the job. Linking copies the record's
 * email and phone, empty ones too (jobs_client_mirror), so a job with no
 * contact yet keeps what it has unless the record has it (0056's rule). A job
 * moving from one contact to another drops the last person's on purpose. Pure.
 */
export function dropsDetail(job: Pick<JobRow, "contact_id" | "client_email" | "client_phone">, contact: { email: string; phone: string }): "email" | "phone" | null {
  if (job.contact_id) return null;
  if (!contact.email.trim() && (job.client_email ?? "").trim()) return "email";
  if (!contact.phone.trim() && (job.client_phone ?? "").trim()) return "phone";
  return null;
}

function refuseDrop(job: JobRow, contact: { email: string; phone: string }) {
  const lost = dropsDetail(job, contact);
  if (lost) throw new JobClientError(`This job has a client ${lost} and that contact doesn't. Add a contact with it instead.`);
}

async function readJob(ref: JobRef): Promise<JobRow> {
  if (!ref.billingId) throw new JobClientError("This job has no billing record yet.");
  const { data, error } = await getSupabaseAdmin().from("jobs").select(JOB_COLS).eq("id", ref.billingId).maybeSingle();
  if (error) throw new Error(`job client: read job failed: ${error.message}`);
  if (!data) throw new JobClientError("No such job.", 404);
  return data as JobRow;
}

/** The job's client and contacts, or null for a job with no billing record. Only reads. */
export async function loadJobClient(ref: JobRef, opts: { clients: boolean }): Promise<JobClient | null> {
  if (!ref.billingId) return null;
  const db = getSupabaseAdmin();
  const job = await readJob(ref);
  const [client, contacts, clients] = await Promise.all([
    job.client_id ? db.from("clients").select("name").eq("id", job.client_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    job.client_id ? db.from("client_contacts").select("id, name, email, phone, role, active").eq("client_id", job.client_id).order("name") : Promise.resolve({ data: [], error: null }),
    opts.clients && !job.client_id ? db.from("clients").select("id, name").eq("active", true).order("name") : Promise.resolve({ data: [], error: null }),
  ]);
  const failed = client.error ?? contacts.error ?? clients.error;
  if (failed) throw new Error(`job client: read failed: ${failed.message}`);
  const rows = (contacts.data ?? []) as (JobContact & { active: boolean })[];
  return {
    clientId: job.client_id,
    client: (client.data as { name: string } | null)?.name ?? "",
    typedName: job.client_id ? "" : (job.client_name ?? "").trim(),
    contactId: job.contact_id,
    email: job.client_email ?? "",
    phone: job.client_phone ?? "",
    contacts: rows.filter((r) => r.active || r.id === job.contact_id).map(({ id, name, email, phone, role }) => ({ id, name, email, phone, role })),
    clients: (clients.data ?? []) as { id: string; name: string }[],
  };
}

async function pointAt(job: JobRow, contactId: string) {
  const { error } = await getSupabaseAdmin().from("jobs").update({ contact_id: contactId }).eq("id", job.id);
  if (error) throw new Error(`job client: set contact failed: ${error.message}`);
}

/** Make one of the client's active contacts the job's. */
export async function setJobContact(ref: JobRef, contactId: string): Promise<void> {
  const job = await readJob(ref);
  if (!job.client_id) throw new JobClientError("Give the job a client first.");
  const { data, error } = await getSupabaseAdmin().from("client_contacts").select("email, phone, active").eq("id", contactId).eq("client_id", job.client_id).maybeSingle();
  if (error) throw new Error(`job client: read contact failed: ${error.message}`);
  const contact = data as { email: string; phone: string; active: boolean } | null;
  if (!contact?.active) throw new JobClientError("That contact isn't on this job's client.", 404);
  refuseDrop(job, contact);
  await pointAt(job, contactId);
}

/** Add a person to the job's client and make them the job's contact. Someone already on the client is used, never edited. */
export async function addJobContact(ref: JobRef, input: { name: string; email: string; phone: string; role: ContactRole }): Promise<void> {
  const job = await readJob(ref);
  if (!job.client_id) throw new JobClientError("Give the job a client first.");
  const found = await findContact(job.client_id, input.name, input.email);
  if (found) return setJobContact(ref, found);
  refuseDrop(job, input);
  const { data, error } = await getSupabaseAdmin().from("client_contacts").insert({ client_id: job.client_id, ...input }).select("id").single();
  if (error) throw new Error(`job client: add contact failed: ${error.message}`);
  await pointAt(job, (data as { id: string }).id);
}

/** Link a job with no client to a client on file. The database gives the job the client's name. */
export async function setJobClient(ref: JobRef, clientId: string): Promise<void> {
  const job = await readJob(ref);
  if (job.client_id) throw new JobClientError("This job already has a client.");
  const db = getSupabaseAdmin();
  const { data: client, error: readErr } = await db.from("clients").select("active").eq("id", clientId).maybeSingle();
  if (readErr) throw new Error(`job client: read client failed: ${readErr.message}`);
  if (!(client as { active: boolean } | null)?.active) throw new JobClientError("No such client.", 404);
  const { data, error } = await db.from("jobs").update({ client_id: clientId }).eq("id", job.id).is("client_id", null).select("id");
  if (error) throw new Error(`job client: link client failed: ${error.message}`);
  if (!data?.length) throw new JobClientError("This job already has a client.");
}

/** Make the client record for a job with only a name, and link it. A client of that name already on file is the one. */
export async function createJobClient(ref: JobRef, input: { name: string; kind: ClientKind }, actor: string): Promise<void> {
  const job = await readJob(ref);
  if (job.client_id) throw new JobClientError("This job already has a client.");
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("clients").insert({ name: input.name, kind: input.kind, created_by: actor }).select("id").single();
  if (error && error.code !== UNIQUE_VIOLATION) throw new Error(`job client: create client failed: ${error.message}`);
  let id = (data as { id: string } | null)?.id ?? null;
  if (!id) {
    const { data: same, error: findErr } = await db.from("clients").select("id").ilike("name", input.name.replace(/[%_\\]/g, "\\$&")).limit(1).maybeSingle();
    if (findErr) throw new Error(`job client: find client failed: ${findErr.message}`);
    id = (same as { id: string } | null)?.id ?? null;
  }
  if (!id) throw new Error("job client: client not found after insert");
  await setJobClient(ref, id);
}
