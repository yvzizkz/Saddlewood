import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { inPackage, itemDollars, primaryPackageId } from "@/lib/sales/calc";
import { proposalFromDocument, getEstimate, getOpportunity } from "@/lib/sales/store";
import { getDocument } from "@/lib/billing/documents";
import type { EstimateBody } from "@/lib/sales/types";
import { ourCostCents } from "./rules";
import type { PackageLine } from "./types";

// Where a bid package's scope starts: the estimate the job was won on (or the
// latest one, while it is still a prospect), one section per trade, each line
// with its quantity and our own cost. Our cost is the leveling plug and stays
// inside the app.

export type ScopeSource = {
  opportunityId: string | null;
  jobId: string | null;
  title: string;
  address: string;
  estimate: { id: string; version: number; name: string } | null;
  sections: { id: string; name: string; lines: PackageLine[]; ourCents: number }[];
};

/** The lines of a section in the package the job was won on (or the one the office leads with). */
export function sectionLines(body: EstimateBody, packageId: string | null): ScopeSource["sections"] {
  const pkg = packageId ?? primaryPackageId(body);
  return body.sections
    .map((s) => {
      const lines: PackageLine[] = s.items
        .filter((i) => inPackage(i, pkg) && i.description.trim())
        .map((i) => ({
          id: i.id,
          description: i.description.trim(),
          qty: Number.isFinite(i.qty) ? i.qty : null,
          unit: i.unit ?? "",
          note: i.note ?? "",
          ourCents: ourCostCents(itemDollars(i, body.pricing)),
        }));
      return { id: s.id, name: s.name, lines, ourCents: lines.reduce((a, l) => a + (l.ourCents ?? 0), 0) };
    })
    .filter((s) => s.lines.length);
}

export async function scopeSource(ref: { opportunityId?: string | null; jobId?: string | null }): Promise<ScopeSource | null> {
  const db = getSupabaseAdmin();
  let oppId = ref.opportunityId ?? null;
  let jobId = ref.jobId ?? null;
  if (!oppId && jobId) {
    const { data } = await db.from("sales_opportunities").select("id").eq("job_id", jobId).limit(1).maybeSingle();
    oppId = (data as { id: string } | null)?.id ?? null;
  }
  const o = oppId ? await getOpportunity(oppId) : null;
  if (o && !jobId) jobId = o.jobId;
  let title = o?.title ?? "";
  let address = o?.address ?? "";
  if (!o && jobId) {
    const { data } = await db.from("jobs").select("name, address").eq("id", jobId).maybeSingle();
    if (!data) return null;
    title = (data as { name: string }).name;
    address = (data as { address: string | null }).address ?? "";
  }
  if (!o && !jobId) return null;

  // The estimate it was won on: the accepted proposal's, else the latest one standing.
  let estimateId: string | null = null;
  let packageId: string | null = null;
  if (o) {
    const { data: docs } = await db.from("documents").select("id").eq("kind", "estimate").eq("number", `EST-${o.number}`).neq("status", "draft").order("revision", { ascending: false });
    for (const d of (docs ?? []) as { id: string }[]) {
      const doc = await getDocument(d.id);
      if (!doc) continue;
      const { data: acc } = await db.from("document_events").select("detail").eq("document_id", d.id).eq("kind", "accepted").maybeSingle();
      const snap = doc.snapshot as { estimateId?: string };
      if (acc) {
        estimateId = snap.estimateId ?? null;
        packageId = String((acc as { detail: { packageId?: string } }).detail.packageId ?? "") || null;
        break;
      }
      if (!estimateId && proposalFromDocument(doc)) estimateId = snap.estimateId ?? null;
    }
    if (!estimateId) {
      const { data: latest } = await db.from("sales_estimates").select("id").eq("opportunity_id", o.id).neq("status", "archived").order("version", { ascending: false }).limit(1).maybeSingle();
      estimateId = (latest as { id: string } | null)?.id ?? null;
    }
  }
  const est = estimateId ? await getEstimate(estimateId) : null;
  return {
    opportunityId: o?.id ?? null,
    jobId,
    title,
    address,
    estimate: est ? { id: est.id, version: est.version, name: est.name } : null,
    sections: est ? sectionLines(est.body, packageId) : [],
  };
}
