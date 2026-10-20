import { NextRequest, NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { subsError, subsGate } from "@/lib/subs/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// What a new package can be for: an awarded job, or an opportunity still
// being priced (SOP-008 stage 0: "an estimate is awarded, or a bid needs sub
// pricing"). Names only; a seat with the subs switch need not have Sales.

export async function GET(request: NextRequest) {
  const gate = await subsGate(request, "manage");
  if (gate.response) return gate.response;
  try {
    const db = getSupabaseAdmin();
    const [{ data: opps, error }, { data: jobs, error: jErr }] = await Promise.all([
      db.from("sales_opportunities").select("id, number, title, address, stage, job_id").in("stage", ["lead", "qualified", "site_visit", "estimating", "proposal_sent", "negotiating", "won"]).order("updated_at", { ascending: false }).limit(300),
      db.from("jobs").select("id, name, address, billing, status").eq("status", "active").order("updated_at", { ascending: false }).limit(300),
    ]);
    if (error || jErr) throw new Error((error ?? jErr)!.message);
    const awarded = ((jobs ?? []) as { id: string; name: string; address: string | null; billing: Record<string, unknown> | null }[]).filter((j) => j.billing && "award" in j.billing);
    const oppByJob = new Map(((opps ?? []) as { id: string; job_id: string | null }[]).filter((o) => o.job_id).map((o) => [o.job_id!, o.id]));
    return NextResponse.json({
      ok: true,
      jobs: awarded.map((j) => ({ jobId: j.id, opportunityId: oppByJob.get(j.id) ?? null, name: j.name, address: j.address ?? "" })),
      opportunities: ((opps ?? []) as { id: string; number: string; title: string; address: string; stage: string; job_id: string | null }[])
        .filter((o) => !o.job_id)
        .map((o) => ({ opportunityId: o.id, number: o.number, title: o.title, address: o.address, stage: o.stage })),
    });
  } catch (err) {
    return subsError(err, "list the jobs");
  }
}
