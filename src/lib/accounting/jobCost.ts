// Job costing: every cost line for a range (labor, materials, sub and vendor
// bills) and every job's contract, billed and collected, keyed to one job.
// Server only.
//
// Labor and purchases sit on the field job (crew_jobs, text id); billing sits
// on the billing job (jobs, uuid). jobs.crew_job_id joins them, and a job is
// keyed by its billing id when it has one, else by its field id, so both
// halves of the same job land on one row.

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { contractOf } from "@/lib/billing/jobMoney";
import { loadLabor } from "./labor";
import { loadPayables } from "./payables";
import { loadPurchases } from "./purchases";

export type CostLine = {
  id: string;
  day: string;
  jobKey: string;
  job: string;
  category: "labor" | "materials" | "subs";
  trade: string;
  tradeLabel: string;
  cents: number;
  /** Where the line comes from, for the drill-down to the record. */
  href: string;
  label: string;
};

export type JobTotals = {
  jobKey: string;
  job: string;
  contractCents: number | null;
  billedCents: number;
  collectedCents: number;
  laborCents: number;
  materialsCents: number;
  subsCents: number;
};

export const CATEGORY_LABEL: Record<CostLine["category"], string> = { labor: "Labor", materials: "Materials", subs: "Subs and vendors" };

export async function loadJobCost(fromDay: string, toDay: string): Promise<{ lines: CostLine[]; jobs: JobTotals[]; laborWithoutRate: number }> {
  const db = getSupabaseAdmin();
  const [jobsRes, crewRes, labor, purchases, payables, docs] = await Promise.all([
    db.from("jobs").select("id,name,crew_job_id,billing"),
    db.from("crew_jobs").select("id,name"),
    loadLabor(fromDay, toDay, { withPay: true }),
    loadPurchases(fromDay, toDay),
    loadPayables(),
    db.from("documents").select("id,job_id,kind,status,total_cents,issued_at").eq("status", "issued").in("kind", ["invoice", "change_order"]),
  ]);
  if (jobsRes.error) throw new Error(`jobs: ${jobsRes.error.message}`);
  type J = { id: string; name: string; crew_job_id: string | null; billing: unknown };
  const billingJobs = (jobsRes.data ?? []) as J[];
  const byCrew = new Map(billingJobs.filter((j) => j.crew_job_id).map((j) => [j.crew_job_id as string, j]));
  const crewName = new Map(((crewRes.data ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]));

  const keyOf = (billingId: string | null, crewId: string | null): { key: string; name: string } => {
    if (billingId) {
      const j = billingJobs.find((b) => b.id === billingId);
      return { key: billingId, name: (j?.crew_job_id && crewName.get(j.crew_job_id)) || j?.name || billingId };
    }
    if (crewId) {
      const j = byCrew.get(crewId);
      if (j) return { key: j.id, name: crewName.get(crewId) || j.name };
      return { key: `crew:${crewId}`, name: crewName.get(crewId) || crewId };
    }
    return { key: "", name: "No job" };
  };

  const lines: CostLine[] = [];
  for (const r of labor.rows) {
    if (r.costCents === null) continue;
    const k = keyOf(null, r.jobId);
    lines.push({ id: `l${r.id}`, day: r.day, jobKey: k.key, job: k.name, category: "labor", trade: r.trade, tradeLabel: r.tradeLabel, cents: r.costCents, href: `/app/accounting/payroll/entry/${r.id}`, label: `${r.person}, ${r.day}` });
  }
  for (const r of purchases.rows) {
    if (r.ignored) continue;
    const k = keyOf(r.billingJobId, r.rawJobId);
    lines.push({ id: `p${r.id}`, day: r.purchasedOn, jobKey: k.key, job: k.name, category: "materials", trade: r.trade, tradeLabel: r.tradeLabel, cents: r.lineTotalCents, href: `/app/accounting/purchases/trip/${encodeURIComponent(r.tripKey)}`, label: `${r.vendor}: ${r.description}` });
  }
  for (const b of payables.rows) {
    if (b.issuedOn < fromDay || b.issuedOn > toDay) continue;
    // A bill for a Home Depot trip is already counted as materials.
    if (b.purchaseTripKey) continue;
    const k = keyOf(b.billingJobId, b.rawCrewJobId);
    lines.push({ id: `b${b.id}`, day: b.issuedOn, jobKey: k.key, job: k.name, category: "subs", trade: b.trade, tradeLabel: b.tradeLabel, cents: b.amountCents, href: `/app/accounting/payables/bill/${b.id}`, label: `${b.vendorName} ${b.billNumber}` });
  }

  // Billed and collected in the range, per billing job.
  const docRows = ((docs.data ?? []) as { id: string; job_id: string | null; total_cents: number; issued_at: string | null }[]).filter(
    (d) => d.job_id && d.issued_at && d.issued_at.slice(0, 10) >= fromDay && d.issued_at.slice(0, 10) <= toDay,
  );
  const docIds = docRows.map((d) => d.id);
  const alloc = docIds.length ? await db.from("payment_allocations").select("document_id,amount_cents,payments!inner(voided_at)").in("document_id", docIds) : { data: [] };
  const paid = new Map<string, number>();
  for (const a of (alloc.data ?? []) as { document_id: string; amount_cents: number; payments: { voided_at: string | null } | { voided_at: string | null }[] }[]) {
    const p = Array.isArray(a.payments) ? a.payments[0] : a.payments;
    if (p?.voided_at) continue;
    paid.set(a.document_id, (paid.get(a.document_id) ?? 0) + Number(a.amount_cents));
  }

  const totals = new Map<string, JobTotals>();
  const get = (key: string, name: string) => {
    let t = totals.get(key);
    if (!t) {
      const bj = billingJobs.find((b) => b.id === key);
      t = { jobKey: key, job: name, contractCents: bj ? contractOf(bj.billing) : null, billedCents: 0, collectedCents: 0, laborCents: 0, materialsCents: 0, subsCents: 0 };
      totals.set(key, t);
    }
    return t;
  };
  for (const l of lines) {
    const t = get(l.jobKey, l.job);
    if (l.category === "labor") t.laborCents += l.cents;
    else if (l.category === "materials") t.materialsCents += l.cents;
    else t.subsCents += l.cents;
  }
  for (const d of docRows) {
    const k = keyOf(d.job_id, null);
    const t = get(k.key, k.name);
    t.billedCents += Number(d.total_cents);
    t.collectedCents += paid.get(d.id) ?? 0;
  }
  return { lines, jobs: [...totals.values()], laborWithoutRate: labor.ratesMissing };
}
