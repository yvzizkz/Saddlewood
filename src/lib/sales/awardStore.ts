import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createDraft, getDocument, listEvents, usedNumbers } from "@/lib/billing/documents";
import { nextNumber } from "@/lib/billing/numbering";
import { placeJob } from "@/lib/crew/admin";
import { templatePhases } from "@/lib/crew/phases";
import { firstShiftDays, getJob, insertJob, insertJobPhases, listJobPeople, listJobPhases, listPeople, setJobPeople } from "@/lib/crew/queries";
import { localDay } from "@/lib/crew/time";
import { jobSlug } from "@/lib/crew/types";
import { loadPolicies } from "@/lib/policies/store";
import {
  defaultChoices,
  planAward,
  WATCH_KINDS,
  type Accepted,
  type AwardChoices,
  type AwardPlan,
  type AwardRecord,
  type JobWatch,
  type WatchKind,
} from "./award";
import type { ProposalSnapshot } from "./presentation";
import { addEvent, getOpportunity, getOpportunityDetail, proposalFromDocument, proposalNumber, SalesError } from "./store";
import type { Opportunity } from "./types";

// Award, carried out (the plan is award.ts). Owners only (the route's gate).
// Each step finds what an earlier, interrupted run already made before it
// makes anything, so pressing Award again after a failure finishes the job
// instead of doubling it. The award record on the billing job is written
// last: it is what says the job is awarded.

const UNIQUE_VIOLATION = "23505";

function fail(what: string, message: string): never {
  throw new Error(`award: ${what} failed: ${message}`);
}

type Basis = {
  opportunity: Opportunity;
  proposal: ProposalSnapshot | null;
  documentId: string | null;
  revision: number;
  /** What was accepted on the link; null when it was marked won another way. */
  accepted: Accepted | null;
};

/** The proposal it was won on: the accepted one, else the latest still standing. */
async function basisFor(opportunityId: string): Promise<Basis> {
  const detail = await getOpportunityDetail(opportunityId);
  if (!detail) throw new SalesError("not found", 404);
  const o = detail.opportunity;
  const chosen = detail.proposals.find((p) => p.accepted) ?? detail.proposals.find((p) => p.status === "issued") ?? null;
  if (!chosen) return { opportunity: o, proposal: null, documentId: null, revision: 0, accepted: null };
  const doc = await getDocument(chosen.documentId);
  const proposal = doc ? proposalFromDocument(doc) : null;
  if (!doc || !proposal) return { opportunity: o, proposal: null, documentId: null, revision: 0, accepted: null };
  let accepted: Accepted | null = null;
  if (chosen.accepted) {
    const ev = (await listEvents(doc.id)).find((e) => e.kind === "accepted");
    const d = (ev?.detail ?? {}) as Record<string, unknown>;
    accepted = {
      packageId: String(d.packageId ?? ""),
      packageName: String(d.packageName ?? chosen.accepted.packageName),
      options: Array.isArray(d.options) ? (d.options as Accepted["options"]) : [],
      totalCents: Number(d.totalCents ?? chosen.accepted.totalCents),
      name: String(d.name ?? chosen.accepted.name),
      email: String(d.email ?? ""),
      at: ev?.at ?? chosen.accepted.at,
    };
  }
  return { opportunity: o, proposal, documentId: doc.id, revision: doc.revision, accepted };
}

/** Accepted on the link, or the package the owner picks when it was won on other paper. */
function acceptedFor(b: Basis, choices: AwardChoices, now: Date): Accepted {
  if (b.accepted) return b.accepted;
  if (b.proposal) {
    const pkg = b.proposal.packages.find((p) => p.id === choices.packageId) ?? b.proposal.packages.find((p) => p.recommended) ?? b.proposal.packages[0];
    return { packageId: pkg.id, packageName: pkg.name, options: [], totalCents: pkg.totalCents, name: "", email: "", at: now.toISOString() };
  }
  return { packageId: "", packageName: "", options: [], totalCents: b.opportunity.valueCents, name: "", email: "", at: now.toISOString() };
}

export type AwardPreview = {
  opportunity: Pick<Opportunity, "id" | "number" | "title" | "kind" | "address" | "contact" | "stage">;
  proposal: { documentId: string; number: string; revision: number; packages: { id: string; name: string; totalCents: number }[] } | null;
  accepted: Accepted | null;
  choices: AwardChoices;
  plan: AwardPlan;
  people: { email: string; name: string; group: string }[];
  /** What already exists and will be used instead of made again. */
  existing: { clientId: string | null; jobId: string | null; crewJobId: string | null; awarded: boolean };
  /** Why it cannot be built as it stands (another awarded job already has this name and address). */
  conflict: string;
  /** Other jobs already using this number prefix (Money matches bills to jobs by it). */
  prefixUsedBy: string[];
};

type JobRow = { id: string; name: string; address: string | null; client_id: string | null; crew_job_id: string | null; number_prefix: string | null; billing: Record<string, unknown> | null };
const JOB_COLS = "id, name, address, client_id, crew_job_id, number_prefix, billing";

async function findClient(name: string): Promise<string | null> {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("clients").select("id").ilike("name", name.replace(/[%_\\]/g, "\\$&")).limit(1).maybeSingle();
  if (error) fail("find client", error.message);
  return (data as { id: string } | null)?.id ?? null;
}

/** The billing job already tied to this opportunity, else one with the same name and address (the estimate pipeline makes those). */
async function findJob(o: Opportunity, name: string): Promise<JobRow | null> {
  const db = getSupabaseAdmin();
  if (o.jobId) {
    const { data, error } = await db.from("jobs").select(JOB_COLS).eq("id", o.jobId).maybeSingle();
    if (error) fail("read job", error.message);
    if (data) return data as JobRow;
  }
  const { data, error } = await db.from("jobs").select(JOB_COLS).eq("name", name).eq("address", o.address.trim()).limit(1).maybeSingle();
  if (error) fail("find job", error.message);
  return (data as JobRow | null) ?? null;
}

function isAwarded(job: JobRow | null): boolean {
  return !!(job?.billing && typeof job.billing === "object" && "award" in job.billing && job.billing.award);
}

/** An active field job with the same name, not tied to another billing job: the crew may have made it already. */
async function findCrewJob(name: string, billingJobId: string | null): Promise<string | null> {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("crew_jobs").select("id").ilike("name", name.replace(/[%_\\]/g, "\\$&")).eq("active", true).limit(1).maybeSingle();
  if (error) fail("find field job", error.message);
  const id = (data as { id: string } | null)?.id ?? null;
  if (!id) return null;
  const { data: owner, error: oErr } = await db.from("jobs").select("id").eq("crew_job_id", id).maybeSingle();
  if (oErr) fail("check field job", oErr.message);
  const by = (owner as { id: string } | null)?.id ?? null;
  return by && by !== billingJobId ? null : id;
}

export async function awardPreview(opportunityId: string, asked: Partial<AwardChoices> = {}, now: Date = new Date()): Promise<AwardPreview> {
  const b = await basisFor(opportunityId);
  const o = b.opportunity;
  if (o.stage !== "won") throw new SalesError("mark it won first", 409);
  const choices: AwardChoices = { ...defaultChoices(o), ...stripUndefined(asked) };
  if (b.proposal && !b.accepted && !choices.packageId) {
    choices.packageId = (b.proposal.packages.find((p) => p.recommended) ?? b.proposal.packages[0]).id;
  }
  const accepted = acceptedFor(b, choices, now);
  const { values: policies } = await loadPolicies();
  const plan = planAward({ opportunity: o, proposal: b.proposal, proposalNumber: proposalNumber(o), accepted, policies, choices, today: localDay(now) });
  const [people, clientId, found] = await Promise.all([listPeople(), findClient(plan.client.name), findJob(o, plan.job.name)]);
  // A job of the same name and address awarded from another opportunity is not this one: a second
  // project at the same house needs its own name ("4821 E Test Dr, phase 2").
  const other = found && found.id !== o.jobId && isAwarded(found);
  const job = other ? null : found;
  const crewJobId = job?.crew_job_id ?? (await findCrewJob(plan.crew.name, job?.id ?? null));
  // The deposit takes the next free number on a job that already has invoices.
  if (plan.deposit && job) plan.deposit.number = nextNumber(plan.job.prefix, await usedNumbers("invoice", job.id));
  const prefixUsedBy = plan.job.prefix ? await jobsWithPrefix(plan.job.prefix, job?.id ?? null) : [];
  return {
    opportunity: { id: o.id, number: o.number, title: o.title, kind: o.kind, address: o.address, contact: o.contact, stage: o.stage },
    proposal: b.proposal && b.documentId
      ? { documentId: b.documentId, number: proposalNumber(o), revision: b.revision, packages: b.proposal.packages.map((p) => ({ id: p.id, name: p.name, totalCents: p.totalCents })) }
      : null,
    accepted: b.accepted,
    choices,
    plan,
    people: people.filter((p) => p.active).map((p) => ({ email: p.email, name: p.name, group: p.groupName })),
    existing: { clientId: job?.client_id ?? clientId, jobId: job?.id ?? null, crewJobId, awarded: isAwarded(job) },
    conflict: other ? `${plan.job.name} at this address was already awarded from another opportunity. Give this job its own name.` : "",
    prefixUsedBy,
  };
}

async function jobsWithPrefix(prefix: string, notJob: string | null): Promise<string[]> {
  const db = getSupabaseAdmin();
  let q = db.from("jobs").select("id, name").eq("number_prefix", prefix).limit(5);
  if (notJob) q = q.neq("id", notJob);
  const { data, error } = await q;
  if (error) fail("check prefix", error.message);
  return ((data ?? []) as { name: string }[]).map((j) => j.name);
}

/** The deposit Award drafted on a job: the one its award record names, else the invoice titled Deposit. */
async function findDeposit(jobId: string, award: AwardRecord | null): Promise<string | null> {
  if (award?.depositId) return award.depositId;
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("documents").select("id").eq("job_id", jobId).eq("kind", "invoice").eq("title", "Deposit").order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (error) fail("find deposit", error.message);
  return (data as { id: string } | null)?.id ?? null;
}

function stripUndefined<T extends object>(v: T): Partial<T> {
  return Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined)) as Partial<T>;
}

export type AwardResult = { jobId: string; crewJobId: string; clientId: string; depositId: string | null; watches: number; placed: boolean };

export async function awardJob(opportunityId: string, asked: Partial<AwardChoices>, actor: string, now: Date = new Date()): Promise<AwardResult> {
  const preview = await awardPreview(opportunityId, asked, now);
  if (preview.existing.awarded) throw new SalesError("this job was already awarded", 409);
  if (preview.conflict) throw new SalesError(preview.conflict, 409);
  const o = (await getOpportunity(opportunityId))!;
  const { plan, choices } = preview;
  if (!plan.job.name) throw new SalesError("name the job (its street address)", 400);
  if (plan.job.contractCents <= 0) throw new SalesError("the contract needs an amount", 400);
  if (choices.deposit && !plan.job.prefix) throw new SalesError("the deposit invoice needs a number prefix (the street number)", 400);
  if (plan.crew.pmEmail && !preview.people.some((p) => p.email === plan.crew.pmEmail)) throw new SalesError("that project manager is not on the crew list", 400);
  const db = getSupabaseAdmin();

  // 1. The client, and the person we dealt with.
  let clientId = preview.existing.clientId;
  if (!clientId) {
    const { data, error } = await db.from("clients").insert({ name: plan.client.name, kind: plan.client.kind, created_by: actor }).select("id").single();
    if (error && error.code !== UNIQUE_VIOLATION) fail("create client", error.message);
    clientId = (data as { id: string } | null)?.id ?? (await findClient(plan.client.name));
    if (!clientId) fail("create client", "not found after insert");
  }
  const c = plan.client.contact;
  if (c && (c.email || c.name)) {
    const { data: have, error } = await db.from("client_contacts").select("id, name, email").eq("client_id", clientId);
    if (error) fail("read contacts", error.message);
    const known = ((have ?? []) as { name: string; email: string }[]).some(
      (x) => (c.email && x.email.toLowerCase() === c.email) || (!c.email && x.name.toLowerCase() === c.name.toLowerCase()),
    );
    if (!known) {
      const { error: insErr } = await db.from("client_contacts").insert({ client_id: clientId, name: c.name, email: c.email, phone: c.phone, role: c.role });
      if (insErr) fail("add contact", insErr.message);
    }
  }

  // 2. The billing job: found, or made; tied to the opportunity at once so a retry finds it.
  let jobId = preview.existing.jobId;
  const jobFields = {
    name: plan.job.name,
    address: plan.job.address || null,
    client_id: clientId,
    client_name: plan.client.name,
    client_email: c?.email || null,
    client_phone: c?.phone || null,
    project_type: o.kind,
    number_prefix: plan.job.prefix || null,
    status: "active",
  };
  if (!jobId) {
    const { data, error } = await db.from("jobs").insert(jobFields).select("id").single();
    if (error) {
      if (error.code === UNIQUE_VIOLATION) throw new SalesError(`a job named ${plan.job.name} at that address already exists; open it from Money or rename this one`, 409);
      fail("create job", error.message);
    }
    jobId = (data as { id: string }).id;
  } else {
    const { error } = await db.from("jobs").update(jobFields).eq("id", jobId);
    if (error) {
      if (error.code === UNIQUE_VIOLATION) throw new SalesError(`another job is already named ${plan.job.name} at that address`, 409);
      fail("update job", error.message);
    }
  }
  if (o.jobId !== jobId) {
    const { error } = await db.from("sales_opportunities").update({ job_id: jobId }).eq("id", o.id);
    if (error) fail("link job", error.message);
  }

  // 3. The field job, placed on the map, linked, with its PM and phases.
  let crewJobId = preview.existing.crewJobId;
  let placed = false;
  if (!crewJobId) {
    const base = jobSlug(plan.crew.name);
    for (const id of [base, `${base}-2`, `${base}-3`, `${base}-4`, `${base}-${o.number.replace(/\D/g, "")}`]) {
      const made = await insertJob({ id, name: plan.crew.name, address: plan.crew.address, note: `Awarded from ${o.number}`, promised: null, promiseNote: "", createdBy: actor });
      if (made) {
        crewJobId = made.id;
        break;
      }
    }
    if (!crewJobId) throw new SalesError("a field job with a name that close already exists; rename this job", 409);
    if (plan.crew.address) placed = await placeJob(crewJobId, plan.crew.address, now);
  } else {
    const fj = await getJob(crewJobId);
    if (fj && !fj.geo && plan.crew.address) placed = await placeJob(crewJobId, plan.crew.address, now);
  }
  {
    const { error } = await db.from("jobs").update({ crew_job_id: crewJobId }).eq("id", jobId);
    if (error) {
      if (error.code === UNIQUE_VIOLATION) throw new SalesError("that field job is already tied to another billing job", 409);
      fail("link field job", error.message);
    }
  }
  if (plan.crew.pmEmail) {
    const on = (await listJobPeople()).filter((p) => p.jobId === crewJobId);
    if (!on.some((p) => p.email === plan.crew.pmEmail && p.role === "pm")) {
      await setJobPeople(crewJobId, [...on.filter((p) => p.email !== plan.crew.pmEmail).map((p) => ({ email: p.email, role: p.role })), { email: plan.crew.pmEmail, role: "pm" }], actor);
    }
  }
  if (plan.crew.template !== "none" && (await listJobPhases({ jobId: crewJobId })).length === 0) {
    const specs = templatePhases(plan.crew.template);
    await insertJobPhases(specs.map((s, i) => ({ jobId: crewJobId!, ord: i + 1, ...s, createdBy: actor })));
  }

  // 4. The deposit invoice, a draft for an owner to look over and send from Money.
  let depositId: string | null = null;
  if (plan.deposit) {
    const planned = plan.deposit.number;
    depositId = await findDeposit(jobId, null);
    if (depositId) {
      plan.deposit.number = (await getDocument(depositId))?.number ?? planned;
    } else {
      const draft = await createDraft({
        kind: "invoice",
        jobId,
        clientId,
        number: nextNumber(plan.job.prefix, await usedNumbers("invoice", jobId)),
        title: "Deposit",
        snapshot: plan.deposit.snapshot,
        dueDate: localDay(now),
        createdBy: actor,
      });
      depositId = draft.id;
      plan.deposit.number = draft.number;
    }
    // The log line and the deposit watch name the number it really got.
    for (const w of plan.watches) if (w.kind === "deposit") w.note = w.note.replace(planned, plan.deposit.number);
  }

  // 5. The paperwork the job owes.
  let watches = 0;
  for (const w of plan.watches) {
    const { error } = await db
      .from("job_watches")
      .insert({ job_id: jobId, kind: w.kind, title: w.title, due_on: w.dueOn, note: w.note, created_by: actor });
    if (error && error.code !== UNIQUE_VIOLATION) fail("add watch", error.message);
    if (!error) watches++;
  }

  // 6. The award record, last: from here on the job is awarded.
  const accepted = preview.accepted ?? acceptedFor({ opportunity: o, proposal: null, documentId: null, revision: 0, accepted: null }, choices, now);
  const award: AwardRecord = {
    documentId: preview.proposal?.documentId ?? "",
    number: preview.proposal?.number ?? "",
    revision: preview.proposal?.revision ?? 0,
    packageId: preview.accepted?.packageId ?? choices.packageId,
    packageName: preview.accepted?.packageName ?? preview.proposal?.packages.find((p) => p.id === choices.packageId)?.name ?? "",
    options: (preview.accepted?.options ?? []).map((x) => x.description),
    totalCents: plan.job.contractCents,
    acceptedAt: accepted.at,
    acceptedBy: preview.accepted?.name ? `${preview.accepted.name} (on the link)` : `marked won by ${actor}`,
    awardedAt: now.toISOString(),
    awardedBy: actor,
    depositId,
  };
  const { data: cur, error: curErr } = await db.from("jobs").select("billing").eq("id", jobId).single();
  if (curErr) fail("read job billing", curErr.message);
  const billing = { ...((cur as { billing: Record<string, unknown> | null }).billing ?? {}), contractCents: plan.job.contractCents, sov: plan.job.sov, award };
  const { error: bErr } = await db.from("jobs").update({ billing }).eq("id", jobId);
  if (bErr) fail("save award", bErr.message);

  const parts = [
    `contract $${(plan.job.contractCents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
    plan.deposit ? `deposit invoice ${plan.deposit.number} drafted` : "",
    plan.agreementNeeded ? "full agreement needed" : "",
  ].filter(Boolean);
  await addEvent(o.id, "job", actor, `Awarded: ${plan.job.name}. ${parts.join("; ")}.`, { award: true, jobId, crewJobId, clientId, depositId });

  if (plan.crew.pmEmail) {
    const { notifyCrew } = await import("@/lib/crew/notify");
    const pm = (await listPeople()).find((p) => p.email === plan.crew.pmEmail);
    if (pm) {
      await notifyCrew(
        pm,
        { title: { en: `New job: ${plan.job.name}`, es: `Trabajo nuevo: ${plan.job.name}` }, body: { en: "You are the project manager. It is on your list.", es: "Usted es el gerente del proyecto. Ya está en su lista." } },
        `award-${jobId}`,
        "/app/crew",
      );
    }
  }
  return { jobId, crewJobId, clientId, depositId, watches, placed };
}

// ---- watches ------------------------------------------------------------------

type WatchRow = { id: number; job_id: string; kind: WatchKind; title: string; due_on: string | null; note: string; done_at: string | null; done_by: string; created_by: string; created_at: string };

function toWatch(r: WatchRow): JobWatch {
  return { id: r.id, jobId: r.job_id, kind: r.kind, title: r.title, dueOn: r.due_on, note: r.note, doneAt: r.done_at, doneBy: r.done_by, createdBy: r.created_by, createdAt: r.created_at };
}

export async function listWatches(filter: { jobId?: string; open?: boolean } = {}): Promise<JobWatch[]> {
  const db = getSupabaseAdmin();
  let q = db.from("job_watches").select("*").order("created_at", { ascending: true }).limit(2000);
  if (filter.jobId) q = q.eq("job_id", filter.jobId);
  if (filter.open) q = q.is("done_at", null);
  const { data, error } = await q;
  if (error) fail("list watches", error.message);
  return ((data ?? []) as WatchRow[]).map(toWatch);
}

/** An owner marks a watch done, or opens it again; who and when are kept. */
export async function setWatchDone(jobId: string, id: number, done: boolean, actor: string, now: Date = new Date()): Promise<JobWatch> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("job_watches")
    .update(done ? { done_at: now.toISOString(), done_by: actor } : { done_at: null, done_by: "" })
    .eq("id", id)
    .eq("job_id", jobId)
    .select("*")
    .maybeSingle();
  if (error) fail("update watch", error.message);
  if (!data) throw new SalesError("not found", 404);
  return toWatch(data as WatchRow);
}

export async function addWatch(jobId: string, w: { kind: "permit" | "custom"; title: string; dueOn: string | null }, actor: string): Promise<JobWatch> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("job_watches")
    .insert({ job_id: jobId, kind: w.kind, title: w.title.trim().slice(0, 200), due_on: w.dueOn, created_by: actor })
    .select("*")
    .single();
  if (error) fail("add watch", error.message);
  return toWatch(data as WatchRow);
}

export type AwardedJob = {
  jobId: string;
  name: string;
  contractCents: number | null;
  crewJobId: string | null;
  award: AwardRecord | null;
  depositId: string | null;
  watches: JobWatch[];
  /** The first day anyone clocked in there, for the 20-day notice. */
  firstDay: string | null;
};

/** The job a won opportunity became, as the Sales screen shows it. */
export async function awardedJob(jobId: string): Promise<AwardedJob | null> {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("jobs").select(JOB_COLS).eq("id", jobId).maybeSingle();
  if (error) fail("read job", error.message);
  if (!data) return null;
  const job = data as JobRow;
  const billing = (job.billing ?? {}) as { contractCents?: number; award?: AwardRecord };
  const [watches, depositId, first] = await Promise.all([
    listWatches({ jobId }),
    findDeposit(jobId, billing.award ?? null),
    job.crew_job_id ? firstShiftDays([job.crew_job_id]) : Promise.resolve({} as Record<string, string>),
  ]);
  return {
    jobId: job.id,
    name: job.name,
    contractCents: typeof billing.contractCents === "number" ? billing.contractCents : null,
    crewJobId: job.crew_job_id,
    award: billing.award ?? null,
    depositId,
    watches,
    firstDay: job.crew_job_id ? (first[job.crew_job_id] ?? null) : null,
  };
}

/** Every open watch with what "Waiting on you" shows beside it. */
export async function openWatches(): Promise<{ watch: JobWatch; jobName: string; opportunityId: string | null; firstDay: string | null }[]> {
  const watches = await listWatches({ open: true });
  if (!watches.length) return [];
  const db = getSupabaseAdmin();
  const jobIds = [...new Set(watches.map((w) => w.jobId))];
  const [{ data: jobs, error }, { data: opps, error: oErr }] = await Promise.all([
    db.from("jobs").select("id, name, crew_job_id").in("id", jobIds),
    db.from("sales_opportunities").select("id, job_id").in("job_id", jobIds),
  ]);
  if (error || oErr) fail("read watch jobs", (error ?? oErr)!.message);
  const jobRows = (jobs ?? []) as { id: string; name: string; crew_job_id: string | null }[];
  const crewIds = jobRows.map((j) => j.crew_job_id).filter((x): x is string => !!x);
  const first = crewIds.length ? await firstShiftDays(crewIds) : {};
  const byJob = new Map(jobRows.map((j) => [j.id, j]));
  const oppOf = new Map(((opps ?? []) as { id: string; job_id: string }[]).map((o) => [o.job_id, o.id]));
  return watches.map((w) => {
    const j = byJob.get(w.jobId);
    return { watch: w, jobName: j?.name ?? "a job", opportunityId: oppOf.get(w.jobId) ?? null, firstDay: j?.crew_job_id ? (first[j.crew_job_id] ?? null) : null };
  });
}

export function isWatchKind(v: unknown): v is WatchKind {
  return typeof v === "string" && (WATCH_KINDS as readonly string[]).includes(v);
}
