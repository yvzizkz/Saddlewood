// Client complaints: a work item (0061) on a job. Who it goes to and when it is
// due are worked out here, never by the caller, so a complaint can't be parked
// on a quiet seat or a far date. Server only.

import { sendPush } from "@/lib/bot/push";
import { notifyOwners } from "@/lib/crew/notify";
import { listJobPeople } from "@/lib/crew/queries";
import { addDays, localDay } from "@/lib/crew/time";
import type { CrewJobPerson } from "@/lib/crew/types";
import { jobHref, type JobRef } from "@/lib/jobs/hub";
import { POLICY_DEFAULTS } from "@/lib/policies/rules";
import { loadPolicies } from "@/lib/policies/store";
import type { Role } from "@/lib/roles/seats";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type Complaint = {
  id: number;
  title: string;
  detail: string;
  role: Role;
  assignee: string;
  dueOn: string | null;
  status: "open" | "done" | "dropped";
  resolution: string;
  loggedBy: string;
  loggedOn: string;
  closedBy: string;
  closedOn: string | null;
};

/** The job's PM (the first by address, for a job with two), or Owner decisions when it has none. */
export function routeComplaint(crewJobId: string | null, jobPeople: readonly CrewJobPerson[]): { role: Role; assignee: string } {
  const pm = jobPeople
    .filter((p) => p.jobId === crewJobId && p.role === "pm")
    .map((p) => p.email)
    .sort()[0];
  return pm ? { role: "pm", assignee: pm } : { role: "decisions", assignee: "" };
}

/** Logs it on the job and tells whoever has it. Late by one day, it moves up a role. */
export async function logComplaint(ref: JobRef, input: { title: string; detail: string; by: string }): Promise<{ id: number; role: Role; assignee: string; dueOn: string }> {
  const [people, policies] = await Promise.all([ref.crewId ? listJobPeople() : Promise.resolve([]), loadPolicies().then((r) => r.values).catch(() => POLICY_DEFAULTS)]);
  const { role, assignee } = routeComplaint(ref.crewId, people);
  const dueOn = addDays(localDay(), Number(policies["policy.complaint.replyWithinDays"]));
  const href = `${jobHref(ref.key, "tasks")}#complaints`;
  const { data, error } = await getSupabaseAdmin()
    .from("work_items")
    .insert({ kind: "complaint", title: input.title, detail: input.detail, role, assignee, job_id: ref.billingId, crew_job_id: ref.crewId, due_on: dueOn, escalate_days: 0, href, created_by: input.by })
    .select("id")
    .single();
  if (error) throw new Error(`work_items insert: ${error.message}`);
  const id = (data as { id: number }).id;
  const note = { title: `Complaint · ${ref.name}`, body: input.title, tag: `complaint-${id}` };
  try {
    if (!assignee) await notifyOwners(note, "decisions");
    else if (assignee !== input.by) await sendPush([assignee], { ...note, title: note.title.slice(0, 80), body: note.body.slice(0, 240), url: href });
  } catch (e) {
    console.error("[complaints] push:", (e as Error).message);
  }
  return { id, role, assignee, dueOn };
}

type Row = { id: number; title: string; detail: string; role: Role; assignee: string; due_on: string | null; status: Complaint["status"]; resolution: string; created_by: string; created_at: string; done_by: string; done_at: string | null };

/** Every complaint on the job, newest first: the open ones and how the closed ones ended. */
export async function loadJobComplaints(ref: Pick<JobRef, "billingId" | "crewId">): Promise<Complaint[]> {
  const ids = [ref.billingId ? `job_id.eq.${ref.billingId}` : "", ref.crewId ? `crew_job_id.eq.${ref.crewId}` : ""].filter(Boolean);
  if (!ids.length) return [];
  const { data, error } = await getSupabaseAdmin()
    .from("work_items")
    .select("id,title,detail,role,assignee,due_on,status,resolution,created_by,created_at,done_by,done_at")
    .eq("kind", "complaint")
    .or(ids.join(","))
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(`work_items complaints: ${error.message}`);
  return ((data ?? []) as Row[]).map((r) => ({
    id: r.id,
    title: r.title,
    detail: r.detail,
    role: r.role,
    assignee: r.assignee,
    dueOn: r.due_on,
    status: r.status,
    resolution: r.resolution,
    loggedBy: r.created_by,
    loggedOn: localDay(r.created_at),
    closedBy: r.done_by,
    closedOn: r.done_at ? localDay(r.done_at) : null,
  }));
}
