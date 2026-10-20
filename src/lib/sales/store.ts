import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createDraft, DocumentError, issueDocument, listEvents, recordEvent } from "@/lib/billing/documents";
import { summarizeProof } from "@/lib/billing/proof";
import type { BillingDocument, DocumentEvent, DocumentLine, DocumentSnapshot } from "@/lib/billing/types";
import { priceEstimate } from "./calc";
import type { OpportunityRow } from "./pipeline";
import { acceptedTotal, buildProposal, type ProposalSnapshot } from "./presentation";
import { isExecuted, signaturesOf, snapshotHash, type Signature, type SignatureInput, type SignatureRecord } from "./signing";
import type { SalesSettings } from "./settings";
import { readBody as readEstimateBody } from "./validate";
import {
  stageInfo,
  type Contact,
  type EstimateBody,
  type IssuedProposal,
  type Opportunity,
  type SalesEstimate,
  type SalesEvent,
  type SalesEventKind,
  type Stage,
} from "./types";

// Every read and write of the sales tables (0025). Service-role client only,
// after the route has decided who is asking. The proposal a client is sent is
// a documents row (kind "estimate") made through the billing layer, so it is
// frozen and its viewing record kept exactly as an invoice's is.

function fail(what: string, message: string): never {
  throw new Error(`${what} failed: ${message}`);
}

export class SalesError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409,
  ) {
    super(message);
    this.name = "SalesError";
  }
}

// ---- rows ---------------------------------------------------------------------

type OpportunityDb = {
  id: string;
  number: string;
  title: string;
  stage: Stage;
  kind: Opportunity["kind"];
  source: Opportunity["source"];
  contact: Contact | null;
  address: string;
  client_id: string | null;
  job_id: string | null;
  value_cents: number | string;
  probability: number | null;
  owner: string;
  next_step: string;
  next_step_on: string | null;
  bid_due: string | null;
  lost_reason: string;
  notes: string;
  tags: string[] | null;
  external_ref: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  stage_at: string;
  closed_at: string | null;
};

function toOpportunity(r: OpportunityDb): Opportunity {
  return {
    id: r.id,
    number: r.number,
    title: r.title,
    stage: r.stage,
    kind: r.kind,
    source: r.source,
    contact: { name: "", ...(r.contact ?? {}) },
    address: r.address,
    clientId: r.client_id,
    jobId: r.job_id,
    valueCents: Number(r.value_cents) || 0,
    probability: r.probability,
    owner: r.owner,
    nextStep: r.next_step,
    nextStepOn: r.next_step_on,
    bidDue: r.bid_due,
    lostReason: r.lost_reason,
    notes: r.notes,
    tags: r.tags ?? [],
    externalRef: r.external_ref,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    stageAt: r.stage_at,
    closedAt: r.closed_at,
  };
}

type EventDb = { id: number; opportunity_id: string; kind: SalesEventKind; at: string; actor: string; text: string; detail: Record<string, unknown> | null };

function toEvent(r: EventDb): SalesEvent {
  return { id: r.id, opportunityId: r.opportunity_id, kind: r.kind, at: r.at, actor: r.actor, text: r.text, detail: r.detail ?? {} };
}

type EstimateDb = {
  id: string;
  opportunity_id: string;
  version: number;
  name: string;
  status: SalesEstimate["status"];
  body: EstimateBody;
  sell_cents: number | string;
  cost_cents: number | string;
  document_id: string | null;
  source_estimate_id: string | null;
  created_by: string;
  created_at: string;
  updated_by: string;
  updated_at: string;
};

function toEstimate(r: EstimateDb): SalesEstimate {
  return {
    id: r.id,
    opportunityId: r.opportunity_id,
    version: r.version,
    name: r.name,
    status: r.status,
    body: r.body,
    sellCents: Number(r.sell_cents) || 0,
    costCents: Number(r.cost_cents) || 0,
    documentId: r.document_id,
    sourceEstimateId: r.source_estimate_id,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedBy: r.updated_by,
    updatedAt: r.updated_at,
  };
}

// ---- proposals (documents of kind "estimate") ---------------------------------------

export function proposalNumber(o: Pick<Opportunity, "number">): string {
  return `EST-${o.number}`;
}

type DocLite = {
  id: string;
  number: string;
  revision: number;
  total_cents: number | string;
  issued_at: string | null;
  status: "draft" | "issued" | "void";
  token: string | null;
  snapshot: DocumentSnapshot | null;
};

type EventLite = { id: number; document_id: string; kind: DocumentEvent["kind"]; at: string; actor: string; automatic: boolean; detail: Record<string, unknown> | null; email_id: string | null; dedupe: string | null };

function proposalOf(d: DocLite, events: DocumentEvent[]): IssuedProposal {
  const proof = summarizeProof(events);
  const acc = events.find((e) => e.kind === "accepted");
  const est = (d.snapshot as (DocumentSnapshot & { estimateId?: string }) | null)?.estimateId ?? null;
  const signing = (d.snapshot as Partial<EstimateSnapshot> | null)?.proposal?.sign?.mode ?? "none";
  const sigs = signaturesOf(events);
  return {
    signatures: sigs.map((x) => ({ role: x.role, name: x.name, at: x.at, method: x.method })),
    signing,
    executed: isExecuted(signing, sigs),
    documentId: d.id,
    estimateId: typeof est === "string" ? est : null,
    number: d.number,
    revision: d.revision,
    totalCents: Number(d.total_cents) || 0,
    issuedAt: d.issued_at ?? "",
    status: d.status === "void" ? "void" : "issued",
    token: d.token ?? "",
    views: proof.viewCount,
    lastViewedAt: proof.lastViewedAt,
    accepted: acc
      ? {
          at: acc.at,
          name: String(acc.detail.name ?? ""),
          packageName: String(acc.detail.packageName ?? ""),
          totalCents: Number(acc.detail.totalCents) || 0,
        }
      : null,
  };
}

function toDocEvent(e: EventLite): DocumentEvent {
  return {
    id: e.id,
    documentId: e.document_id,
    kind: e.kind,
    at: e.at,
    actor: e.actor,
    automatic: e.automatic,
    emailId: e.email_id,
    dedupe: e.dedupe,
    detail: e.detail ?? {},
  } as DocumentEvent;
}

/** Every issued proposal for these numbers, newest revision first, with how each stands. */
async function proposalsFor(numbers: string[]): Promise<Map<string, IssuedProposal[]>> {
  const out = new Map<string, IssuedProposal[]>();
  if (numbers.length === 0) return out;
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("documents")
    .select("id, number, revision, total_cents, issued_at, status, token, snapshot")
    .eq("kind", "estimate")
    .in("number", numbers)
    .neq("status", "draft")
    .order("revision", { ascending: false });
  if (error) fail("list proposals", error.message);
  const docs = (data ?? []) as DocLite[];
  if (docs.length === 0) return out;
  const { data: ev, error: evErr } = await db
    .from("document_events")
    .select("id, document_id, kind, at, actor, automatic, detail, email_id, dedupe")
    .in(
      "document_id",
      docs.map((d) => d.id),
    );
  if (evErr) fail("list proposal events", evErr.message);
  const byDoc = new Map<string, DocumentEvent[]>();
  for (const e of (ev ?? []) as EventLite[]) byDoc.set(e.document_id, [...(byDoc.get(e.document_id) ?? []), toDocEvent(e)]);
  for (const d of docs) out.set(d.number, [...(out.get(d.number) ?? []), proposalOf(d, byDoc.get(d.id) ?? [])]);
  return out;
}

// ---- opportunities ---------------------------------------------------------------

export async function listOpportunities(): Promise<OpportunityRow[]> {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("sales_opportunities").select("*").order("updated_at", { ascending: false }).limit(1000);
  if (error) fail("list opportunities", error.message);
  const opps = ((data ?? []) as OpportunityDb[]).map(toOpportunity);
  if (opps.length === 0) return [];
  const ids = opps.map((o) => o.id);

  const [{ data: est, error: estErr }, { data: last, error: lastErr }, proposals] = await Promise.all([
    db.from("sales_estimates").select("opportunity_id, version, sell_cents, status").in("opportunity_id", ids).neq("status", "archived").order("version", { ascending: false }),
    db.from("sales_events").select("opportunity_id, at").in("opportunity_id", ids).order("at", { ascending: false }).limit(5000),
    proposalsFor(opps.map(proposalNumber)),
  ]);
  if (estErr) fail("list estimates", estErr.message);
  if (lastErr) fail("list activity", lastErr.message);
  const estimateCents = new Map<string, number>();
  for (const e of (est ?? []) as { opportunity_id: string; sell_cents: number | string }[]) {
    if (!estimateCents.has(e.opportunity_id)) estimateCents.set(e.opportunity_id, Number(e.sell_cents) || 0);
  }
  const lastAt = new Map<string, string>();
  for (const e of (last ?? []) as { opportunity_id: string; at: string }[]) if (!lastAt.has(e.opportunity_id)) lastAt.set(e.opportunity_id, e.at);

  return opps.map((o) => {
    const props = proposals.get(proposalNumber(o)) ?? [];
    const current = props.find((p) => p.status === "issued") ?? props[0] ?? null;
    // Our own activity only: a client opening the proposal is not us following up,
    // and the "viewed, quiet" rule is about our silence.
    const candidates = [o.updatedAt, lastAt.get(o.id) ?? o.createdAt];
    return {
      ...o,
      estimateCents: estimateCents.get(o.id) ?? null,
      proposal: current,
      lastActivityAt: candidates.sort().at(-1)!,
    };
  });
}

export async function getOpportunity(id: string): Promise<Opportunity | null> {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("sales_opportunities").select("*").eq("id", id).maybeSingle();
  if (error) fail("get opportunity", error.message);
  return data ? toOpportunity(data as OpportunityDb) : null;
}

export async function findByExternalRef(ref: string): Promise<Opportunity | null> {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("sales_opportunities").select("*").eq("external_ref", ref).maybeSingle();
  if (error) fail("find opportunity", error.message);
  return data ? toOpportunity(data as OpportunityDb) : null;
}

export type OpportunityDetail = {
  opportunity: Opportunity;
  events: SalesEvent[];
  estimates: Omit<SalesEstimate, "body">[];
  proposals: IssuedProposal[];
};

export async function getOpportunityDetail(id: string): Promise<OpportunityDetail | null> {
  const o = await getOpportunity(id);
  if (!o) return null;
  const db = getSupabaseAdmin();
  const [{ data: ev, error: evErr }, { data: est, error: estErr }, proposals] = await Promise.all([
    db.from("sales_events").select("*").eq("opportunity_id", id).order("at", { ascending: false }).limit(300),
    db
      .from("sales_estimates")
      .select("id, opportunity_id, version, name, status, sell_cents, cost_cents, document_id, source_estimate_id, created_by, created_at, updated_by, updated_at")
      .eq("opportunity_id", id)
      .order("version", { ascending: false }),
    proposalsFor([proposalNumber(o)]),
  ]);
  if (evErr) fail("list events", evErr.message);
  if (estErr) fail("list estimates", estErr.message);
  return {
    opportunity: o,
    events: ((ev ?? []) as EventDb[]).map(toEvent),
    estimates: ((est ?? []) as Omit<EstimateDb, "body">[]).map((r) => {
      const { body: _b, ...rest } = toEstimate({ ...r, body: {} as EstimateBody });
      void _b;
      return rest;
    }),
    proposals: proposals.get(proposalNumber(o)) ?? [],
  };
}

export type NewOpportunity = {
  title: string;
  kind: Opportunity["kind"];
  source: Opportunity["source"];
  contact: Contact;
  address?: string;
  valueCents?: number;
  owner?: string;
  nextStep?: string;
  nextStepOn?: string | null;
  bidDue?: string | null;
  notes?: string;
  stage?: Stage;
  externalRef?: string | null;
  clientId?: string | null;
};

export async function createOpportunity(input: NewOpportunity, actor: string, firstNote?: { kind: SalesEventKind; text: string; detail?: Record<string, unknown> }): Promise<Opportunity> {
  const db = getSupabaseAdmin();
  if (input.externalRef) {
    const existing = await findByExternalRef(input.externalRef);
    if (existing) throw new SalesError(`already tracked as ${existing.number}`, 409);
  }
  const { data: num, error: numErr } = await db.rpc("next_sales_number");
  if (numErr || typeof num !== "string") fail("number opportunity", numErr?.message ?? "no number");
  const { data, error } = await db
    .from("sales_opportunities")
    .insert({
      number: num,
      title: input.title.trim(),
      stage: input.stage ?? "lead",
      kind: input.kind,
      source: input.source,
      contact: input.contact,
      address: input.address?.trim() ?? "",
      value_cents: Math.max(0, Math.round(input.valueCents ?? 0)),
      owner: input.owner ?? "",
      next_step: input.nextStep?.trim() ?? "",
      next_step_on: input.nextStepOn ?? null,
      bid_due: input.bidDue ?? null,
      notes: input.notes?.trim() ?? "",
      external_ref: input.externalRef ?? null,
      client_id: input.clientId ?? null,
      created_by: actor,
    })
    .select("*")
    .single();
  if (error) {
    if (error.code === "23505") throw new SalesError("this one is already being tracked", 409);
    fail("create opportunity", error.message);
  }
  const o = toOpportunity(data as OpportunityDb);
  await addEvent(o.id, "created", actor, "", { source: o.source });
  if (firstNote && firstNote.text.trim()) await addEvent(o.id, firstNote.kind, actor, firstNote.text, firstNote.detail ?? {});
  return o;
}

export type OpportunityPatch = Partial<
  Pick<Opportunity, "title" | "stage" | "kind" | "source" | "contact" | "address" | "valueCents" | "probability" | "owner" | "nextStep" | "nextStepOn" | "bidDue" | "lostReason" | "notes" | "tags" | "clientId">
>;

const PATCH_COLUMNS: Record<keyof OpportunityPatch, string> = {
  title: "title",
  stage: "stage",
  kind: "kind",
  source: "source",
  contact: "contact",
  address: "address",
  valueCents: "value_cents",
  probability: "probability",
  owner: "owner",
  nextStep: "next_step",
  nextStepOn: "next_step_on",
  bidDue: "bid_due",
  lostReason: "lost_reason",
  notes: "notes",
  tags: "tags",
  clientId: "client_id",
};

export async function updateOpportunity(id: string, patch: OpportunityPatch, actor: string, why = ""): Promise<Opportunity> {
  const before = await getOpportunity(id);
  if (!before) throw new SalesError("not found", 404);
  const row: Record<string, unknown> = {};
  for (const [k, col] of Object.entries(PATCH_COLUMNS) as [keyof OpportunityPatch, string][]) {
    if (patch[k] !== undefined) row[col] = patch[k];
  }
  const stageChanged = patch.stage !== undefined && patch.stage !== before.stage;
  if (stageChanged) {
    const now = new Date().toISOString();
    row.stage_at = now;
    row.closed_at = stageInfo(patch.stage!).open ? null : now;
    if (patch.stage === "lost" && !patch.lostReason && !before.lostReason) throw new SalesError("say why it was lost", 400);
  }
  if (Object.keys(row).length === 0) return before;
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("sales_opportunities").update(row).eq("id", id).select("*").single();
  if (error) fail("update opportunity", error.message);
  const after = toOpportunity(data as OpportunityDb);
  if (stageChanged) {
    await addEvent(id, "stage", actor, why, { from: before.stage, to: after.stage, ...(after.stage === "lost" ? { reason: after.lostReason } : {}) });
  }
  return after;
}

export async function addEvent(opportunityId: string, kind: SalesEventKind, actor: string, text = "", detail: Record<string, unknown> = {}): Promise<SalesEvent> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("sales_events")
    .insert({ opportunity_id: opportunityId, kind, actor, text: text.slice(0, 4000), detail })
    .select("*")
    .single();
  if (error) {
    if (error.code === "23503") throw new SalesError("not found", 404);
    fail("add event", error.message);
  }
  // Activity moves it up the list.
  await db.from("sales_opportunities").update({ updated_at: new Date().toISOString() }).eq("id", opportunityId);
  return toEvent(data as EventDb);
}

// ---- estimates -------------------------------------------------------------------

export async function getEstimate(id: string): Promise<SalesEstimate | null> {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("sales_estimates").select("*").eq("id", id).maybeSingle();
  if (error) fail("get estimate", error.message);
  return data ? toEstimate(data as EstimateDb) : null;
}

function totalsOf(body: EstimateBody): { sell_cents: number; cost_cents: number } {
  const p = priceEstimate(body).primary;
  return { sell_cents: p?.sell ?? 0, cost_cents: p?.cost ?? 0 };
}

export async function createEstimate(
  opportunityId: string,
  body: EstimateBody,
  actor: string,
  opts: { name?: string; sourceEstimateId?: string | null } = {},
): Promise<SalesEstimate> {
  const db = getSupabaseAdmin();
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: top, error: topErr } = await db.from("sales_estimates").select("version").eq("opportunity_id", opportunityId).order("version", { ascending: false }).limit(1);
    if (topErr) fail("number estimate", topErr.message);
    const version = ((top?.[0] as { version: number } | undefined)?.version ?? 0) + 1;
    const { data, error } = await db
      .from("sales_estimates")
      .insert({
        opportunity_id: opportunityId,
        version,
        name: opts.name ?? `Version ${version}`,
        body,
        ...totalsOf(body),
        source_estimate_id: opts.sourceEstimateId ?? null,
        created_by: actor,
        updated_by: actor,
      })
      .select("*")
      .single();
    if (!error) {
      const e = toEstimate(data as EstimateDb);
      await addEvent(opportunityId, "estimate", actor, "", { estimateId: e.id, version, name: e.name });
      // Starting an estimate moves an early lead along.
      const o = await getOpportunity(opportunityId);
      if (o && ["lead", "qualified", "site_visit"].includes(o.stage)) await updateOpportunity(opportunityId, { stage: "estimating" }, actor);
      return e;
    }
    if (error.code === "23503") throw new SalesError("not found", 404);
    if (error.code !== "23505") fail("create estimate", error.message);
  }
  throw new SalesError("someone else just started an estimate here; try again", 409);
}

/**
 * Save the builder's work. `expected` is the updated_at the editor loaded, so
 * two people editing the same estimate do not silently overwrite each other.
 */
export async function saveEstimate(id: string, body: EstimateBody, expected: string | null, actor: string, name?: string): Promise<SalesEstimate> {
  const db = getSupabaseAdmin();
  const row: Record<string, unknown> = { body, ...totalsOf(body), updated_by: actor };
  if (name !== undefined) row.name = name.slice(0, 80);
  let q = db.from("sales_estimates").update(row).eq("id", id).neq("status", "archived");
  if (expected) q = q.eq("updated_at", expected);
  const { data, error } = await q.select("*").maybeSingle();
  if (error) fail("save estimate", error.message);
  if (!data) {
    const now = await getEstimate(id);
    if (!now) throw new SalesError("not found", 404);
    if (now.status === "archived") throw new SalesError("this version was archived", 409);
    throw new SalesError(`${now.updatedBy || "someone"} saved this estimate after you opened it; reload to see their changes`, 409);
  }
  return toEstimate(data as EstimateDb);
}

export async function archiveEstimate(id: string, actor: string): Promise<void> {
  const db = getSupabaseAdmin();
  const { error } = await db.from("sales_estimates").update({ status: "archived", updated_by: actor }).eq("id", id);
  if (error) fail("archive estimate", error.message);
}

/** A pipeline estimate (Mac /estimate-auto, estimates table) as a builder body. */
export async function importPipelineEstimate(estimateId: string): Promise<{ body: EstimateBody; title: string } | null> {
  const db = getSupabaseAdmin();
  const { data: est, error } = await db
    .from("estimates")
    .select("id, overhead_pct, profit_pct, contingency_pct, gc_sub_markup_pct, jobs(name, address), estimate_trades(id, trade_name, trade_status, sort_order, estimate_line_items(*))")
    .eq("id", estimateId)
    .maybeSingle();
  if (error) fail("read pipeline estimate", error.message);
  if (!est) return null;
  const { fromPipeline } = await import("./importer");
  return fromPipeline(est as unknown as Parameters<typeof fromPipeline>[0]);
}

export async function listPipelineEstimates(): Promise<{ id: string; job: string; version: number; status: string; createdAt: string }[]> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("estimates")
    .select("id, version, review_status, created_at, jobs(name)")
    .neq("review_status", "archived")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) fail("list pipeline estimates", error.message);
  return ((data ?? []) as unknown as { id: string; version: number; review_status: string; created_at: string; jobs: { name: string } | null }[]).map((r) => ({
    id: r.id,
    job: r.jobs?.name ?? "",
    version: r.version,
    status: r.review_status,
    createdAt: r.created_at,
  }));
}

// ---- issuing and accepting ---------------------------------------------------------

export type EstimateSnapshot = DocumentSnapshot & { proposal: ProposalSnapshot; estimateId: string; opportunityId: string };

export function proposalFromDocument(doc: BillingDocument): ProposalSnapshot | null {
  const p = (doc.snapshot as Partial<EstimateSnapshot>).proposal;
  return doc.kind === "estimate" && p && p.v === 1 ? p : null;
}

/**
 * Freeze an estimate as the proposal the client gets: a documents row of kind
 * "estimate", numbered EST-<opportunity>, one revision past the last one sent,
 * issued at once so it has its link. The estimate stays editable; sending it
 * again makes the next revision.
 */
export async function issueProposal(
  estimateId: string,
  actor: string,
  today: string,
  signing?: SalesSettings["signing"],
): Promise<{ document: BillingDocument; proposal: ProposalSnapshot }> {
  const est = await getEstimate(estimateId);
  if (!est) throw new SalesError("not found", 404);
  if (est.status === "archived") throw new SalesError("this version was archived", 409);
  const o = await getOpportunity(est.opportunityId);
  if (!o) throw new SalesError("not found", 404);
  const body = readEstimateBody(est.body);
  if (!body.ok) throw new SalesError(body.error, 400);

  const priced = priceEstimate(body.value);
  const proposal = buildProposal(body.value, today, priced, signing);
  const lead = proposal.packages.find((p) => p.recommended) ?? proposal.packages[0];
  // The plain lines every document carries: one per section at the lead
  // package's price, then any line shown after them ("Overhead and profit").
  const lines: DocumentLine[] = [
    ...proposal.sections
      .filter((s) => s.pkgs.includes(lead.id))
      .map((s) => ({
        description: s.name,
        amountCents: s.amounts?.[lead.id] ?? 0,
      })),
    ...proposal.adjustments.filter((a) => a.amounts[lead.id] !== undefined).map((a) => ({ description: a.label, amountCents: a.amounts[lead.id] })),
  ];
  if (proposal.layout === "total") {
    // A one-price proposal shows no section prices, so the plain copy has one line too.
    lines.splice(0, lines.length, { description: proposal.title || o.title, amountCents: lead.totalCents });
  }
  const snapshot: EstimateSnapshot = {
    billTo: {
      name: o.contact.company?.trim() || o.contact.name || o.title,
      attention: o.contact.company?.trim() ? o.contact.name : undefined,
      address: undefined,
    },
    job: { name: proposal.title || o.title, address: o.address || undefined },
    date: today,
    lines,
    notIncluded: proposal.exclusions.map((description) => ({ description })),
    terms: proposal.terms,
    proposal,
    estimateId: est.id,
    opportunityId: o.id,
  };

  const number = proposalNumber(o);
  const prior = (await proposalsFor([number])).get(number) ?? [];
  const db = getSupabaseAdmin();
  // The newest revision of any state (a draft left by a failed send included).
  const { data: top, error: topErr } = await db
    .from("documents")
    .select("id, revision, status")
    .eq("kind", "estimate")
    .eq("number", number)
    .order("revision", { ascending: false })
    .limit(1);
  if (topErr) fail("find last proposal", topErr.message);
  const last = (top?.[0] as { id: string; revision: number; status: string } | undefined) ?? null;
  if (last && last.status === "draft") {
    throw new SalesError("a proposal for this job is half-issued; ask Lando to clear it", 409);
  }

  const draft = await createDraft({
    kind: "estimate",
    jobId: o.jobId,
    clientId: o.clientId,
    number,
    title: proposal.title || o.title,
    snapshot,
    supersedes: last ? { id: last.id, revision: last.revision } : null,
    createdBy: actor,
  });
  let document: BillingDocument;
  try {
    document = await issueDocument(draft.id, actor);
  } catch (err) {
    if (err instanceof DocumentError) throw new SalesError(err.message, err.status === 404 ? 404 : 409);
    throw err;
  }

  await db.from("sales_estimates").update({ status: "issued", document_id: document.id, updated_by: actor }).eq("id", est.id);
  await addEvent(o.id, "issued", actor, "", {
    documentId: document.id,
    estimateId: est.id,
    version: est.version,
    revision: document.revision,
    totalCents: document.totalCents,
    packages: proposal.packages.map((p) => ({ name: p.name, totalCents: p.totalCents })),
    layout: proposal.layout,
    replaces: prior[0]?.number ? `${prior[0].number} rev ${prior[0].revision}` : null,
  });
  if (OPEN_BEFORE_SENT.includes(o.stage)) await updateOpportunity(o.id, { stage: "proposal_sent" }, actor);
  return { document, proposal };
}

const OPEN_BEFORE_SENT: Stage[] = ["lead", "qualified", "site_visit", "estimating"];

/** Is there a newer revision than this one? A client must accept the proposal that stands. */
export async function newerRevisionExists(doc: BillingDocument): Promise<boolean> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("documents")
    .select("id")
    .eq("kind", "estimate")
    .eq("number", doc.number)
    .gt("revision", doc.revision)
    .neq("status", "draft")
    .limit(1);
  if (error) fail("check revisions", error.message);
  return (data ?? []).length > 0;
}

export type Acceptance = { name: string; packageId: string; optionIds: string[]; note?: string; signature?: SignatureInput };

export type SignMeta = { ip: string; ua: string; today: string };

export type AcceptResult = {
  totalCents: number;
  packageName: string;
  opportunityId: string | null;
  signed: boolean;
  executed: boolean;
};

function signatureRecord(
  role: SignatureRecord["role"],
  sig: SignatureInput,
  doc: BillingDocument,
  consent: string,
  meta: SignMeta,
  extra: Partial<SignatureRecord> = {},
): SignatureRecord {
  return {
    role,
    name: sig.name.trim().replace(/\s+/g, " "),
    email: sig.email ?? "",
    title: "",
    method: sig.method,
    typed: sig.method === "type" ? (sig.typed ?? "") : "",
    font: sig.method === "type" ? (sig.font ?? "") : "",
    image: sig.image,
    consent,
    snapshotSha256: snapshotHash(doc.snapshot),
    ip: meta.ip.slice(0, 64),
    ua: meta.ua.slice(0, 300),
    ...extra,
  };
}

/**
 * The client accepts on their link, and signs when the proposal asks for it.
 * The price is worked out again from the frozen proposal, never taken from
 * the browser. One acceptance and one client signature per proposal: the
 * database's dedupe keys refuse a second.
 */
export async function acceptProposal(doc: BillingDocument, input: Acceptance, meta: SignMeta): Promise<AcceptResult> {
  if (doc.status !== "issued") throw new SalesError("this proposal is no longer open", 409);
  const proposal = proposalFromDocument(doc);
  if (!proposal) throw new SalesError("not found", 404);
  if (!proposal.allowAccept) throw new SalesError("this proposal is accepted by signing the contract we send", 409);
  if (proposal.validUntil < meta.today) throw new SalesError(`this proposal was valid until ${proposal.validUntil}; ask us for a current one`, 409);
  if (await newerRevisionExists(doc)) throw new SalesError("a newer proposal replaced this one; open the latest link we sent", 409);
  const mode = proposal.sign?.mode ?? "none";
  if (mode !== "none" && !input.signature) throw new SalesError("sign to accept", 400);
  const name = (input.signature?.name ?? input.name).trim().replace(/\s+/g, " ");
  if (name.length < 3 || name.length > 120) throw new SalesError("type your full name to accept", 400);
  const total = acceptedTotal(proposal, input.packageId, input.optionIds);
  if (!total) throw new SalesError("that choice is not on this proposal", 400);

  const events = await listEvents(doc.id);
  if (events.some((e) => e.kind === "accepted")) throw new SalesError("this proposal was already accepted", 409);
  const recorded = await recordEvent({
    documentId: doc.id,
    kind: "accepted",
    actor: "client link",
    dedupe: `accepted:${doc.id}`,
    detail: {
      name,
      email: input.signature?.email ?? "",
      packageId: input.packageId,
      packageName: total.packageName,
      options: total.options,
      totalCents: total.totalCents,
      note: (input.note ?? "").slice(0, 1000),
      ip: meta.ip.slice(0, 64),
      ua: meta.ua.slice(0, 300),
    },
  });
  if (!recorded) throw new SalesError("this proposal was already accepted", 409);

  let signed = false;
  if (input.signature) {
    signed = await recordEvent({
      documentId: doc.id,
      kind: "signed",
      actor: "client link",
      dedupe: `signed:client:${doc.id}`,
      detail: signatureRecord("client", input.signature, doc, proposal.sign?.consent ?? "", meta, {
        packageName: total.packageName,
        totalCents: total.totalCents,
      }),
    });
  }
  const sigs = signed ? signaturesOf(await listEvents(doc.id)) : [];

  const oppId = (doc.snapshot as Partial<EstimateSnapshot>).opportunityId ?? null;
  if (oppId) {
    await addEvent(oppId, "accepted", `client: ${name}`, input.note ?? "", {
      documentId: doc.id,
      revision: doc.revision,
      packageName: total.packageName,
      options: total.options.map((o) => o.description),
      totalCents: total.totalCents,
    });
    if (signed) await addEvent(oppId, "signed", `client: ${name}`, "", { documentId: doc.id, role: "client", name, method: input.signature!.method });
    await updateOpportunity(oppId, { stage: "won" }, "client link", `Accepted on the link by ${name}`);
  }
  return { totalCents: total.totalCents, packageName: total.packageName, opportunityId: oppId, signed, executed: isExecuted(mode, sigs) };
}

/**
 * Saddlewood's signature on a proposal that asks for both. Any time after it
 * is issued (before or after the client); once. Who may is the route's call
 * (Sales settings, signing.companySigners).
 */
export async function signAsCompany(
  documentId: string,
  sig: SignatureInput,
  signer: { actor: string; title: string },
  meta: SignMeta,
): Promise<{ executed: boolean; doc: BillingDocument; signatures: Signature[] }> {
  const { getDocument } = await import("@/lib/billing/documents");
  const doc = await getDocument(documentId);
  if (!doc || doc.kind !== "estimate") throw new SalesError("not found", 404);
  const proposal = proposalFromDocument(doc);
  if (!proposal) throw new SalesError("not found", 404);
  if (doc.status !== "issued") throw new SalesError("this proposal was withdrawn", 409);
  const mode = proposal.sign?.mode ?? "none";
  if (mode !== "both") throw new SalesError("this proposal does not ask for our signature", 409);
  const ok = await recordEvent({
    documentId: doc.id,
    kind: "signed",
    actor: signer.actor,
    dedupe: `signed:company:${doc.id}`,
    detail: signatureRecord("company", sig, doc, proposal.sign?.consent ?? "", meta, { title: signer.title }),
  });
  if (!ok) throw new SalesError("Saddlewood already signed this proposal", 409);
  const signatures = signaturesOf(await listEvents(doc.id));
  const oppId = (doc.snapshot as Partial<EstimateSnapshot>).opportunityId ?? null;
  if (oppId) await addEvent(oppId, "signed", signer.actor, "", { documentId: doc.id, role: "company", name: sig.name, method: sig.method });
  return { executed: isExecuted(mode, signatures), doc, signatures };
}

/** An issued proposal with everything the PDF, the mail and the sign sheet need. */
export async function proposalRecord(documentId: string) {
  const { getDocument } = await import("@/lib/billing/documents");
  const doc = await getDocument(documentId);
  if (!doc || doc.kind !== "estimate" || doc.status === "draft") return null;
  const proposal = proposalFromDocument(doc);
  if (!proposal) return null;
  const events = await listEvents(doc.id);
  return { doc, proposal, events, signatures: signaturesOf(events) };
}

/** Won: the job it becomes (public.jobs), linked both ways. */
export async function openJob(opportunityId: string, actor: string): Promise<{ jobId: string; created: boolean }> {
  const o = await getOpportunity(opportunityId);
  if (!o) throw new SalesError("not found", 404);
  if (o.jobId) return { jobId: o.jobId, created: false };
  if (o.stage !== "won") throw new SalesError("mark it won first", 409);
  const db = getSupabaseAdmin();
  const { data: same, error: findErr } = await db.from("jobs").select("id").eq("name", o.title).eq("address", o.address || "").maybeSingle();
  if (findErr) fail("find job", findErr.message);
  let jobId = (same as { id: string } | null)?.id ?? null;
  const created = !jobId;
  if (!jobId) {
    const { data, error } = await db
      .from("jobs")
      .insert({
        name: o.title,
        address: o.address || null,
        client_name: o.contact.company?.trim() || o.contact.name || null,
        client_email: o.contact.email || null,
        client_phone: o.contact.phone || null,
        project_type: o.kind,
        client_id: o.clientId,
        status: "active",
      })
      .select("id")
      .single();
    if (error) fail("create job", error.message);
    jobId = (data as { id: string }).id;
  }
  const { error } = await db.from("sales_opportunities").update({ job_id: jobId }).eq("id", o.id);
  if (error) fail("link job", error.message);
  await addEvent(o.id, "job", actor, "", { jobId, created });
  return { jobId: jobId!, created };
}
