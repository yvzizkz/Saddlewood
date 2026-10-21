// Everything one job page shows, read through the same loaders as the
// Accounting sections and narrowed to the job. Server only.

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { localDay } from "@/lib/crew/time";
import { loadLabor } from "@/lib/accounting/labor";
import { loadPurchases } from "@/lib/accounting/purchases";
import { loadPayables } from "@/lib/accounting/payables";
import { loadCollected, loadIssued, loadOpenReceivables } from "@/lib/accounting/receivables";
import { listWatches } from "@/lib/sales/awardStore";
import { watchDue } from "@/lib/sales/award";
import { listPackages } from "@/lib/subs/store";
import type { JobRef } from "./hub";

const EPOCH = "2020-01-01";

export async function jobMoney(ref: JobRef, today = localDay()) {
  const [open, issued, collected] = await Promise.all([loadOpenReceivables(today), loadIssued(EPOCH, today), loadCollected(EPOCH, today)]);
  const mine = <T extends { jobId: string }>(rows: T[]) => (ref.billingId ? rows.filter((r) => r.jobId === ref.billingId) : []);
  return { open: mine(open.rows), issued: mine(issued), collected: mine(collected) };
}

export async function jobLabor(ref: JobRef, from: string, to: string) {
  if (!ref.crewId) return [];
  const { rows } = await loadLabor(from, to, { withPay: true });
  return rows.filter((r) => r.jobId === ref.crewId);
}

export async function jobPurchases(ref: JobRef, from: string, to: string) {
  const { rows } = await loadPurchases(from, to);
  return rows.filter((r) => !r.ignored && ((ref.crewId && r.rawJobId === ref.crewId) || (ref.billingId && r.billingJobId === ref.billingId)));
}

export async function jobBills(ref: JobRef) {
  const { rows } = await loadPayables();
  return rows.filter((b) => (ref.crewId && b.rawCrewJobId === ref.crewId) || (ref.billingId && b.billingJobId === ref.billingId));
}

export async function jobPackages(ref: JobRef) {
  return ref.billingId ? listPackages({ jobId: ref.billingId }) : [];
}

export async function jobWatches(ref: JobRef) {
  if (!ref.billingId) return [];
  const watches = await listWatches({ jobId: ref.billingId });
  let first: string | null = null;
  if (ref.crewId) {
    const { data } = await getSupabaseAdmin().from("crew_shifts").select("day").eq("job_id", ref.crewId).eq("status", "ok").order("day").limit(1);
    first = (data?.[0] as { day: string } | undefined)?.day ?? null;
  }
  return watches.map((w) => ({ ...w, due: watchDue(w, first) }));
}

export async function jobCrew(ref: JobRef) {
  if (!ref.crewId) return { people: [], phases: [] };
  const db = getSupabaseAdmin();
  const [people, persons, phases] = await Promise.all([
    db.from("crew_job_people").select("email,role").eq("job_id", ref.crewId),
    db.from("crew_people").select("email,name,trade,phone"),
    db.from("crew_job_phases").select("id,ord,name,trade,planned_from,planned_to,verified_at").eq("job_id", ref.crewId).order("ord"),
  ]);
  const byEmail = new Map(((persons.data ?? []) as { email: string; name: string | null; trade: string | null }[]).map((p) => [p.email, p]));
  return {
    people: ((people.data ?? []) as { email: string; role: string }[]).map((p) => ({ ...p, name: byEmail.get(p.email)?.name || p.email, trade: byEmail.get(p.email)?.trade ?? "" })),
    phases: (phases.data ?? []) as { id: number; ord: number; name: string; trade: string; planned_from: string | null; planned_to: string | null; verified_at: string | null }[],
  };
}
