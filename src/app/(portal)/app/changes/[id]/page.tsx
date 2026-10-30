import { notFound, redirect } from "next/navigation";

import PriceItScreen from "@/components/billing/PriceItScreen";
import { loadPriceIt, PriceError } from "@/lib/billing/coPriceStore";
import { getViewer, viewerIsOwner } from "@/lib/crew/auth";
import { jobKeyOf, listJobRefs } from "@/lib/jobs/hub";
import { seesJob, workSeat } from "@/lib/jobs/access";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// One change order, to price and send: opened from the push, Waiting on you,
// Tasks and the job's Changes tab. Owners only (SOP-002: the PM records the
// change, never the price); the APIs behind it check again.

export default async function ChangeOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer();
  const id = Number((await params).id);
  if (!(await viewerIsOwner(viewer))) redirect(await notOwners(id));
  if (!Number.isInteger(id) || id <= 0) notFound();
  let data;
  try {
    data = await loadPriceIt(id, viewer.kind === "staff" ? viewer.email : "owner");
  } catch (err) {
    if (err instanceof PriceError && err.status === 404) notFound();
    if (err instanceof PriceError) redirect(await changesTab(id));
    throw err;
  }
  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-32 pt-5">
      <PriceItScreen data={data} />
    </main>
  );
}

/** A PM or field lead who follows a link here sees the change on their job's Changes tab; anyone else goes home. */
async function notOwners(id: number): Promise<string> {
  const seat = Number.isInteger(id) && id > 0 ? await workSeat() : null;
  if (!seat) return "/app";
  const to = await changesTab(id);
  const key = to.startsWith("/app/jobs/") ? decodeURIComponent(to.slice("/app/jobs/".length).split("?")[0]) : null;
  const refs = key ? await listJobRefs() : [];
  const ref = key ? refs.find((r) => r.key === key) : null;
  return ref && seesJob(seat, ref) ? to : "/app";
}

/** The job's Changes tab for this change order, or Billing's list when it has no job. */
async function changesTab(id: number): Promise<string> {
  const { data } = await getSupabaseAdmin().from("change_orders").select("job_id,crew_job_id").eq("id", id).maybeSingle();
  const row = data as { job_id: string | null; crew_job_id: string | null } | null;
  if (!row) return "/app";
  const key = jobKeyOf({ billingId: row.job_id, crewId: row.crew_job_id }, await listJobRefs());
  return key ? `/app/jobs/${encodeURIComponent(key)}?tab=changes` : "/app/accounting/billing#changes";
}
