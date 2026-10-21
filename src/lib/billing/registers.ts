// The billing registers (0040): every change order from request to invoice,
// and every lien waiver owed or held, both directions. Server only.

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { localDay } from "@/lib/crew/time";
import { loadPayables } from "@/lib/accounting/payables";
import type { BillingProfile } from "@/lib/billing/types";
import { jobKeyOf, type JobRef } from "@/lib/jobs/hub";

export const CO_STATUS = ["requested", "priced", "sent", "signed", "billed", "rejected", "void"] as const;
export type CoStatus = (typeof CO_STATUS)[number];
export const CO_LABEL: Record<CoStatus, string> = {
  requested: "Awaiting price",
  priced: "Priced, not sent",
  sent: "Sent, not signed",
  signed: "Signed, not billed",
  billed: "Billed",
  rejected: "Rejected",
  void: "Void",
};

export type CoRow = {
  id: string;
  /** A register row (0040) or an issued change-order document with no register row yet. */
  registerId: number | null;
  number: string;
  title: string;
  jobKey: string | null;
  job: string;
  status: CoStatus;
  amountCents: number | null;
  requestedOn: string | null;
  ageDays: number | null;
  documentId: string | null;
  billedDocumentId: string | null;
  source: string;
};

function age(from: string | null, today: string): number | null {
  if (!from) return null;
  return Math.max(0, Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000));
}

export async function loadChangeOrders(refs: JobRef[], today = localDay()): Promise<CoRow[]> {
  const db = getSupabaseAdmin();
  const [reg, docs] = await Promise.all([
    db.from("change_orders").select("*").neq("status", "void").order("requested_on", { ascending: false }),
    db.from("documents").select("id,number,title,job_id,status,total_cents,issued_at").eq("kind", "change_order").neq("status", "void"),
  ]);
  const name = (k: string | null) => (k ? (refs.find((r) => r.key === k)?.name ?? k) : "No job");
  type R = { id: number; job_id: string | null; crew_job_id: string | null; number: string; title: string; status: CoStatus; amount_cents: number | null; requested_on: string; document_id: string | null; billed_document_id: string | null; source: string };
  const rows = reg.error ? [] : ((reg.data ?? []) as R[]);
  const out: CoRow[] = rows.map((r) => {
    const jobKey = jobKeyOf({ billingId: r.job_id, crewId: r.crew_job_id }, refs);
    return {
      id: `r${r.id}`,
      registerId: r.id,
      number: r.number || `Request ${r.id}`,
      title: r.title,
      jobKey,
      job: name(jobKey),
      status: r.status,
      amountCents: r.amount_cents === null ? null : Number(r.amount_cents),
      requestedOn: r.requested_on,
      ageDays: ["requested", "priced", "sent", "signed"].includes(r.status) ? age(r.requested_on, today) : null,
      documentId: r.document_id,
      billedDocumentId: r.billed_document_id,
      source: r.source,
    };
  });
  // Change orders issued before the register existed still belong in it.
  const known = new Set(rows.map((r) => r.document_id).filter(Boolean));
  type D = { id: string; number: string; title: string; job_id: string | null; status: string; total_cents: number; issued_at: string | null };
  for (const d of (docs.data ?? []) as D[]) {
    if (known.has(d.id)) continue;
    const jobKey = d.job_id ? jobKeyOf({ billingId: d.job_id }, refs) : null;
    out.push({
      id: `d${d.id}`,
      registerId: null,
      number: d.number || "(draft)",
      title: d.title,
      jobKey,
      job: name(jobKey),
      status: d.status === "issued" ? "sent" : "priced",
      amountCents: Number(d.total_cents),
      requestedOn: d.issued_at ? localDay(d.issued_at) : null,
      ageDays: null,
      documentId: d.id,
      billedDocumentId: null,
      source: "document",
    });
  }
  return out;
}

export type WaiverRow = {
  id: string;
  direction: "out" | "in";
  kind: string;
  party: string;
  jobKey: string | null;
  job: string;
  covers: string;
  coversHref: string;
  amountCents: number;
  status: "missing" | "required" | "prepared" | "sent" | "received" | "not_required";
  statusLabel: string;
};

const W_STATUS: Record<WaiverRow["status"], string> = {
  missing: "Missing",
  required: "Required",
  prepared: "Prepared",
  sent: "Sent",
  received: "Received",
  not_required: "Not required",
};

/**
 * Waivers owed and held. Out: every issued invoice of a client whose billing
 * profile asks for a waiver (conditional with each, final with the last),
 * against the register. In: every sub bill, from its waiver status (0031)
 * and the register.
 */
export async function loadWaivers(refs: JobRef[]): Promise<WaiverRow[]> {
  const db = getSupabaseAdmin();
  const [docs, clients, reg, payables] = await Promise.all([
    db.from("documents").select("id,number,title,client_id,job_id,total_cents,kind").eq("status", "issued").in("kind", ["invoice", "statement"]),
    db.from("clients").select("id,name,billing"),
    db.from("lien_waivers").select("*").neq("status", "void"),
    loadPayables().catch(() => ({ rows: [] as Awaited<ReturnType<typeof loadPayables>>["rows"] })),
  ]);
  const clientBy = new Map(((clients.data ?? []) as { id: string; name: string; billing: BillingProfile | null }[]).map((c) => [c.id, c]));
  type L = { id: number; direction: "out" | "in"; kind: string; document_id: string | null; bill_id: string | null; status: WaiverRow["status"]; amount_cents: number; party: string };
  const register = reg.error ? [] : ((reg.data ?? []) as L[]);
  const name = (k: string | null) => (k ? (refs.find((r) => r.key === k)?.name ?? k) : "No job");
  const out: WaiverRow[] = [];

  type D = { id: string; number: string; title: string; client_id: string | null; job_id: string | null; total_cents: number };
  for (const d of (docs.data ?? []) as D[]) {
    const c = d.client_id ? clientBy.get(d.client_id) : undefined;
    const wants = (c?.billing?.attachments ?? []).filter((a) => a === "conditional_waiver" || a === "final_waiver");
    if (!wants.length) continue;
    const held = register.filter((w) => w.direction === "out" && w.document_id === d.id);
    const jobKey = d.job_id ? jobKeyOf({ billingId: d.job_id }, refs) : null;
    const best = held.find((w) => w.status === "received") ?? held.find((w) => w.status === "sent") ?? held[0];
    const status: WaiverRow["status"] = best ? best.status : "missing";
    out.push({
      id: `o${d.id}`,
      direction: "out",
      kind: best?.kind ?? (wants.includes("conditional_waiver") ? "conditional_progress" : "conditional_final"),
      party: c?.name ?? "",
      jobKey,
      job: name(jobKey),
      covers: d.number,
      coversHref: `/app/money/${d.id}`,
      amountCents: best ? Number(best.amount_cents) : Number(d.total_cents),
      status,
      statusLabel: W_STATUS[status],
    });
  }

  for (const b of payables.rows) {
    if (b.vendorKind !== "sub") continue;
    const held = register.filter((w) => w.direction === "in" && w.bill_id === b.id);
    const fromBill: WaiverRow["status"] = b.waiverStatus === "conditional_received" || b.waiverStatus === "final_received" ? "received" : b.waiverStatus === "not_required" ? "not_required" : "missing";
    const status = held.find((w) => w.status === "received") ? "received" : fromBill;
    const jobKey = jobKeyOf({ billingId: b.billingJobId, crewId: b.rawCrewJobId }, refs);
    out.push({
      id: `i${b.id}`,
      direction: "in",
      kind: b.waiverStatus === "final_received" ? "conditional_final" : "conditional_progress",
      party: b.vendorName,
      jobKey,
      job: name(jobKey),
      covers: b.billNumber,
      coversHref: `/app/accounting/payables/bill/${b.id}`,
      amountCents: b.amountCents,
      status,
      statusLabel: W_STATUS[status],
    });
  }
  return out;
}
