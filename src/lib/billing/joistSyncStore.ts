import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { coEventsAfter } from "./coEvents";
import { getDocument } from "./documents";
import { addLinkExhibit, listExhibits } from "./exhibits";
import { siteUrl } from "./http";
import { CLAIM_MINUTES, joistPayload, MAX_ATTEMPTS, MAX_CLAIM, type JoistPayload, type JoistReason, type JoistReport } from "./joistSync";

// The Joist queue (0060, docs/JOIST-SYNC.md). The app queues; the Mac claims,
// writes into Joist through its browser, and reports. Queuing never fails the
// step that asked for it: Joist is a copy, the app is the record.

export class JoistSyncError extends Error {
  constructor(
    message: string,
    readonly status: 404 | 409,
  ) {
    super(message);
  }
}

type Job = { id: number; change_order_id: number; reason: JoistReason; status: string; attempts: number; claimed_at: string | null };

/** Queue a change order for Joist; a job already waiting takes the newer reason. Never throws. */
export async function queueJoist(changeOrderId: number, reason: JoistReason): Promise<void> {
  try {
    const db = getSupabaseAdmin();
    // One with neither a document nor a billing job has no client to put it under in Joist.
    const { data: co, error: coErr } = await db.from("change_orders").select("document_id,job_id").eq("id", changeOrderId).maybeSingle();
    if (coErr) throw new Error(coErr.message);
    const c = co as { document_id: string | null; job_id: string | null } | null;
    if (!c || (!c.document_id && !c.job_id)) return;
    const now = new Date().toISOString();
    const { data, error } = await db.from("joist_jobs").update({ reason, updated_at: now }).eq("change_order_id", changeOrderId).eq("status", "queued").select("id");
    if (error) throw new Error(error.message);
    if ((data ?? []).length) return;
    const ins = await db.from("joist_jobs").insert({ change_order_id: changeOrderId, reason });
    // Another request queued it a moment ago: the same thing.
    if (ins.error && ins.error.code !== "23505") throw new Error(ins.error.message);
  } catch (err) {
    console.error(`joist queue (${changeOrderId}, ${reason}):`, err);
  }
}

/**
 * Hand the Mac up to `limit` jobs: the oldest waiting, and any claimed so long
 * ago the Mac must have died on it. Each is claimed with a guarded update, so
 * two Macs (or two runs) never get the same job.
 */
export async function claimJoistJobs(by: string, limit = MAX_CLAIM, now = new Date()): Promise<JoistPayload[]> {
  const db = getSupabaseAdmin();
  const stale = new Date(now.getTime() - CLAIM_MINUTES * 60_000).toISOString();
  const { data, error } = await db
    .from("joist_jobs")
    .select("id,change_order_id,reason,status,attempts,claimed_at")
    .or(`status.eq.queued,and(status.eq.claimed,claimed_at.lt.${stale})`)
    .order("created_at", { ascending: true })
    .limit(Math.max(1, Math.min(limit, MAX_CLAIM)) * 2);
  if (error) throw new Error(`joist_jobs read: ${error.message}`);
  const out: JoistPayload[] = [];
  for (const j of (data ?? []) as Job[]) {
    if (out.length >= limit) break;
    const guard = db
      .from("joist_jobs")
      .update({ status: "claimed", claimed_at: now.toISOString(), claimed_by: by, attempts: j.attempts + 1, updated_at: now.toISOString() })
      .eq("id", j.id)
      .eq("status", j.status);
    const { data: won, error: upErr } = await (j.status === "claimed" ? guard.eq("claimed_at", j.claimed_at!) : guard).select("id");
    if (upErr) throw new Error(`joist_jobs claim: ${upErr.message}`);
    if (!(won ?? []).length) continue;
    const payload = await payloadFor({ ...j, attempts: j.attempts + 1 });
    if (payload) out.push(payload);
    else await finish(j.id, { status: "failed", error: "the change order, its document or its job is gone" });
  }
  return out;
}

async function payloadFor(j: Job): Promise<JoistPayload | null> {
  const db = getSupabaseAdmin();
  const { data } = await db.from("change_orders").select("id,number,title,detail,status,amount_cents,requested_on,job_id,document_id,joist_id").eq("id", j.change_order_id).maybeSingle();
  const co = data as CoRow | null;
  if (!co) return null;
  if (!co.document_id) return rowPayload(j, co);
  const doc = await getDocument(co.document_id);
  if (!doc) return null;
  const site = siteUrl().replace(/\/+$/, "");
  const attachments = (await listExhibits(doc.id))
    // Not the Joist link itself (added after the first write).
    .filter((e) => !e.removedAt && !(e.kind === "link" && /^https:\/\/([a-z0-9-]+\.)*joistapp\.com\//i.test(e.url ?? "")))
    .map((e) => ({ label: e.label, url: e.kind === "link" ? e.url! : `${site}/api/bot/joist-sync/${j.id}/files/${e.id}` }));
  return joistPayload({
    jobId: j.id,
    changeOrderId: co.id,
    reason: j.reason,
    attempt: j.attempts,
    joistId: co.joist_id === null ? null : Number(co.joist_id),
    number: co.number || doc.number,
    title: doc.title || co.title,
    status: co.status,
    snapshot: doc.snapshot,
    attachments,
  });
}

type CoRow = {
  id: number;
  number: string;
  title: string;
  detail: string | null;
  status: string;
  amount_cents: number | null;
  requested_on: string | null;
  job_id: string | null;
  document_id: string | null;
  joist_id: number | string | null;
};

/**
 * A change order priced or signed on the register by hand has no document:
 * Joist gets it from the row itself, one line at its price, under the job's
 * client. (Drafting one here would put a $0 line in Joist.)
 */
async function rowPayload(j: Job, co: CoRow): Promise<JoistPayload | null> {
  if (!co.job_id) return null;
  const db = getSupabaseAdmin();
  const { data: job } = await db.from("jobs").select("name,address,client_id").eq("id", co.job_id).maybeSingle();
  const jr = (job ?? {}) as { name?: string; address?: string | null; client_id?: string | null };
  const { data: client } = jr.client_id ? await db.from("clients").select("name").eq("id", jr.client_id).maybeSingle() : { data: null };
  const clientName = (client as { name?: string } | null)?.name ?? "";
  return joistPayload({
    jobId: j.id,
    changeOrderId: co.id,
    reason: j.reason,
    attempt: j.attempts,
    joistId: co.joist_id === null ? null : Number(co.joist_id),
    number: co.number,
    title: co.title,
    status: co.status,
    snapshot: {
      ...(clientName ? { billTo: { name: clientName } } : {}),
      job: { name: jr.name ?? "", ...(jr.address ? { address: jr.address } : {}) },
      ...(co.requested_on ? { date: co.requested_on } : {}),
      lines: [{ description: co.title, amountCents: co.amount_cents ?? 0, ...(co.detail ? { note: co.detail } : {}) }],
    },
    attachments: [],
  });
}

async function finish(id: number, patch: Record<string, unknown>): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await getSupabaseAdmin().from("joist_jobs").update({ ...patch, finished_at: now, updated_at: now }).eq("id", id);
  if (error) throw new Error(`joist_jobs finish: ${error.message}`);
}

/** The exhibit a claimed job may hand the Mac (a file on the change order's own document). */
export async function jobExhibit(jobId: number, exhibitId: string): Promise<{ storagePath: string; contentType: string | null; label: string } | null> {
  const db = getSupabaseAdmin();
  const { data: job } = await db.from("joist_jobs").select("change_order_id,status").eq("id", jobId).maybeSingle();
  if (!job || (job as { status: string }).status !== "claimed") return null;
  const { data: co } = await db.from("change_orders").select("document_id").eq("id", (job as { change_order_id: number }).change_order_id).maybeSingle();
  const docId = (co as { document_id: string | null } | null)?.document_id;
  if (!docId) return null;
  const ex = (await listExhibits(docId)).find((e) => e.id === exhibitId && e.kind === "file" && !e.removedAt);
  return ex?.storagePath ? { storagePath: ex.storagePath, contentType: ex.contentType, label: ex.label } : null;
}

/**
 * The Mac's report on a claimed job. Written: the Joist id and link on the
 * change order, the link as an exhibit while the document is still a draft
 * (an issued one is never changed), and a line on its timeline. A failure is
 * queued again until MAX_ATTEMPTS, then flagged on the change order.
 */
export async function reportJoistJob(jobId: number, report: JoistReport, by: string): Promise<{ status: "done" | "queued" | "failed" }> {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("joist_jobs").select("id,change_order_id,reason,status,attempts,claimed_at").eq("id", jobId).maybeSingle();
  if (error) throw new Error(`joist_jobs read: ${error.message}`);
  const job = data as Job | null;
  if (!job) throw new JoistSyncError("No such job.", 404);
  if (job.status !== "claimed") throw new JoistSyncError(`This job is ${job.status}, not claimed.`, 409);
  const now = new Date().toISOString();

  if (!report.ok) {
    if (job.attempts < MAX_ATTEMPTS) {
      // Back in line, unless a newer change already queued one.
      const { error: e } = await db.from("joist_jobs").update({ status: "queued", error: report.error, claimed_at: null, updated_at: now }).eq("id", jobId);
      if (!e) return { status: "queued" };
      if (e.code !== "23505") throw new Error(`joist_jobs requeue: ${e.message}`);
      // A newer change is already waiting: that job writes the latest anyway.
      await finish(jobId, { status: "failed", error: `${report.error} (a newer job retries)` });
      return { status: "queued" };
    }
    await finish(jobId, { status: "failed", error: report.error });
    await db.from("change_orders").update({ joist_error: report.error }).eq("id", job.change_order_id);
    await coEventsAfter([job.change_order_id], "note", by, { joist: "failed", note: `Joist copy failed: ${report.error}` });
    return { status: "failed" };
  }

  await finish(jobId, { status: "done", error: "", joist_id: report.joistId, joist_url: report.joistUrl });
  const { data: co, error: coErr } = await db
    .from("change_orders")
    .update({ joist_id: report.joistId, ...(report.joistUrl ? { joist_url: report.joistUrl } : {}), joist_synced_at: now, joist_error: "" })
    .eq("id", job.change_order_id)
    .select("document_id")
    .maybeSingle();
  if (coErr) throw new Error(`change_orders joist: ${coErr.message}`);
  const docId = (co as { document_id: string | null } | null)?.document_id;
  if (docId && report.joistUrl) {
    const doc = await getDocument(docId);
    const has = doc ? (await listExhibits(docId)).some((e) => e.kind === "link" && e.url === report.joistUrl && !e.removedAt) : true;
    if (doc?.status === "draft" && !has) await addLinkExhibit({ documentId: docId, lineIndex: null, label: "Joist estimate", url: report.joistUrl, addedBy: by });
  }
  await coEventsAfter([job.change_order_id], "note", by, { joist: "saved", joistId: report.joistId, note: `Copied to Joist (estimate ${report.joistId})` });
  return { status: "done" };
}

/** The queue as it stands, newest first, for the Mac's dashboard and the e2e. */
export async function listJoistJobs(limit = 50): Promise<Record<string, unknown>[]> {
  const { data, error } = await getSupabaseAdmin().from("joist_jobs").select("*").order("id", { ascending: false }).limit(Math.min(limit, 200));
  if (error) throw new Error(`joist_jobs read: ${error.message}`);
  return (data ?? []) as Record<string, unknown>[];
}
