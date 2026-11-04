// The client's link to their job (0062). Owners make it and pick its sections;
// everything the page shows is read here, column by column, so a new column on
// a table never reaches a client by accident. Server only.

import { approvalBlock } from "@/lib/billing/coApprove";
import { newToken } from "@/lib/billing/documents";
import { logComplaint } from "@/lib/complaints/store";
import { getJobRef, type JobRef } from "@/lib/jobs/hub";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { cleanSections, clientDocuments, clientLogText, COMPLAINTS_PER_DAY, LOG_DAYS, type PortalDoc, type PortalDocRow, type PortalSection } from "./rules";

const UNIQUE_VIOLATION = "23505";
/** How the app shows who logged a complaint that came in on a link. */
export const PORTAL_AUTHOR = "client portal";

export type Portal = { id: string; jobId: string; token: string; sections: PortalSection[]; createdBy: string; createdAt: string };

type Row = { id: string; job_id: string; token: string; sections: string[]; created_by: string; created_at: string };
const COLS = "id,job_id,token,sections,created_by,created_at";
const toPortal = (r: Row): Portal => ({ id: r.id, jobId: r.job_id, token: r.token, sections: cleanSections(r.sections), createdBy: r.created_by, createdAt: r.created_at });

/** The job's live link, or null. */
export async function livePortal(jobId: string): Promise<Portal | null> {
  const { data, error } = await getSupabaseAdmin().from("client_portals").select(COLS).eq("job_id", jobId).is("revoked_at", null).maybeSingle();
  if (error) throw new Error(`client_portals read: ${error.message}`);
  return data ? toPortal(data as Row) : null;
}

/** A new link shares nothing until an owner turns a section on. Two clicks land on the one row. */
export async function createPortal(jobId: string, by: string): Promise<Portal> {
  const live = await livePortal(jobId);
  if (live) return live;
  const { data, error } = await getSupabaseAdmin().from("client_portals").insert({ job_id: jobId, token: newToken(), created_by: by }).select(COLS).single();
  if (error?.code === UNIQUE_VIOLATION) {
    const raced = await livePortal(jobId);
    if (raced) return raced;
  }
  if (error) throw new Error(`client_portals insert: ${error.message}`);
  return toPortal(data as Row);
}

/** Null when the job has no live link. */
export async function setPortalSections(jobId: string, sections: readonly string[]): Promise<Portal | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("client_portals")
    .update({ sections: cleanSections(sections), updated_at: new Date().toISOString() })
    .eq("job_id", jobId)
    .is("revoked_at", null)
    .select(COLS)
    .maybeSingle();
  if (error) throw new Error(`client_portals update: ${error.message}`);
  return data ? toPortal(data as Row) : null;
}

/** The link stops working now, for good. A second click changes nothing. */
export async function revokePortal(jobId: string, by: string): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await getSupabaseAdmin().from("client_portals").update({ revoked_at: now, revoked_by: by, updated_at: now }).eq("job_id", jobId).is("revoked_at", null);
  if (error) throw new Error(`client_portals revoke: ${error.message}`);
}

/** A live link and its job. Null for anything else: unknown, turned off, or a job that's gone. */
export async function portalByToken(token: string): Promise<{ portal: Portal; ref: JobRef } | null> {
  if (!/^[0-9a-f]{32,}$/.test(token)) return null;
  const { data, error } = await getSupabaseAdmin().from("client_portals").select(COLS).eq("token", token).is("revoked_at", null).maybeSingle();
  if (error) throw new Error(`client_portals read: ${error.message}`);
  if (!data) return null;
  const portal = toPortal(data as Row);
  const ref = await getJobRef(portal.jobId);
  return ref ? { portal, ref } : null;
}

export type ClientDoc = PortalDoc & { needsApproval: boolean };

/** What we issued on the job, with the change orders still waiting on the client's approval marked. */
export async function portalDocuments(jobId: string): Promise<ClientDoc[]> {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("documents").select("id,kind,number,title,status,total_cents,token,issued_at,supersedes").eq("job_id", jobId).eq("status", "issued");
  if (error) throw new Error(`portal documents: ${error.message}`);
  const docs = clientDocuments((data ?? []) as PortalDocRow[]);
  const cos = docs.filter((d) => d.kind === "change_order").map((d) => d.id);
  const { data: open, error: coError } = cos.length ? await db.from("change_orders").select("document_id,status").in("document_id", cos) : { data: [], error: null };
  if (coError) throw new Error(`portal change orders: ${coError.message}`);
  const coStatus = new Map(((open ?? []) as { document_id: string; status: string }[]).map((c) => [c.document_id, c.status]));
  return docs.map((d) => {
    const status = coStatus.get(d.id);
    return { ...d, needsApproval: d.kind === "change_order" && status !== undefined && approvalBlock({ status: "issued" }, { status }) === null };
  });
}

export type ClientLog = { id: number; day: string; weather: string; text: string };

/** End-of-day logs only: the day, the weather and the work done. Not who wrote it, the crew count, or what they asked the office. */
export async function portalLog(ref: Pick<JobRef, "crewId">): Promise<ClientLog[]> {
  if (!ref.crewId) return [];
  const { data, error } = await getSupabaseAdmin()
    .from("crew_entries")
    .select("id,day,body,weather:data->>weather")
    .eq("job_id", ref.crewId)
    .eq("kind", "eod")
    .order("day", { ascending: false })
    .order("id", { ascending: false })
    .limit(LOG_DAYS);
  if (error) throw new Error(`portal log: ${error.message}`);
  return ((data ?? []) as unknown as { id: number; day: string; body: string; weather: string | null }[])
    .map((e) => ({ id: e.id, day: e.day, weather: e.weather ?? "", text: clientLogText(e.body) }))
    .filter((e) => e.text);
}

export class PortalLimit extends Error {}

/** The same record the office logs (0061): the job's PM, on the Policies clock. The client gets the day, never the seat. */
export async function submitComplaint(ref: JobRef, input: { name: string; title: string; detail: string }): Promise<{ replyBy: string }> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const db = getSupabaseAdmin();
  const q = db.from("work_items").select("id", { count: "exact", head: true }).eq("kind", "complaint").eq("created_by", PORTAL_AUTHOR).gte("created_at", since);
  const { count, error } = await (ref.billingId ? q.eq("job_id", ref.billingId) : q.eq("crew_job_id", ref.crewId ?? ""));
  if (error) throw new Error(`portal complaints: ${error.message}`);
  if ((count ?? 0) >= COMPLAINTS_PER_DAY) throw new PortalLimit();
  const detail = [`From ${input.name}, on their client link.`, input.detail].filter(Boolean).join("\n\n");
  const { dueOn } = await logComplaint(ref, { title: input.title, detail, by: PORTAL_AUTHOR });
  return { replyBy: dueOn };
}
