import { NextRequest, NextResponse } from "next/server";

import { listTrades } from "@/lib/accounting/trades";
import { getViewer, viewerIsOwner } from "@/lib/crew/auth";
import { relinkPurchases, upsertAlias } from "@/lib/crew/purchaseQueries";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest) {
  const viewer = await getViewer();
  if (!(await viewerIsOwner(viewer))) {
    return NextResponse.json({ ok: false, error: "owner access required" }, { status: 403 });
  }
  const actor = "email" in viewer && typeof viewer.email === "string" ? viewer.email : "owner";

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const action = String(body.action ?? "");
  const db = getSupabaseAdmin();

  if (action === "set_trade") {
    const trade = String(body.trade ?? "").trim();
    const trades = await listTrades();
    if (!trades.some((t) => t.slug === trade)) {
      return NextResponse.json({ ok: false, error: "unknown trade" }, { status: 400 });
    }
    const sourceKeys = Array.isArray(body.sourceKeys) ? body.sourceKeys.map(String).filter(Boolean) : [];
    const tripKey = typeof body.tripKey === "string" ? body.tripKey.trim() : "";
    if (!sourceKeys.length && !tripKey) {
      return NextResponse.json({ ok: false, error: "sourceKeys or tripKey required" }, { status: 400 });
    }

    let q = db.from("purchases").update({ trade, trade_manual: true, updated_at: new Date().toISOString() });
    if (sourceKeys.length) q = q.in("source_key", sourceKeys);
    else q = q.eq("trip_key", tripKey);

    const { error } = await q;
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, trade });
  }

  if (action === "assign_job") {
    const jobIdRaw = body.jobId;
    const jobId = typeof jobIdRaw === "string" && jobIdRaw.trim() !== "" ? jobIdRaw.trim() : null;
    const jobKey = typeof body.jobKey === "string" ? body.jobKey.trim() : "";
    const tripKey = typeof body.tripKey === "string" ? body.tripKey.trim() : "";
    const sourceKeys = Array.isArray(body.sourceKeys) ? body.sourceKeys.map(String).filter(Boolean) : [];
    const clearAlias = body.clearAlias === true;

    let moved = 0;
    if (jobKey) {
      if (clearAlias) {
        await db.from("job_aliases").delete().eq("alias", jobKey);
        await db.from("purchases").update({ job_id: null, meta: {}, updated_at: new Date().toISOString() }).eq("job_key", jobKey);
      } else {
        await upsertAlias(jobKey, jobId, actor);
        moved += await relinkPurchases(jobKey, jobId);
      }
    }
    if (tripKey || sourceKeys.length) {
      let q = db.from("purchases").update({ job_id: jobId, updated_at: new Date().toISOString() });
      if (sourceKeys.length) q = q.in("source_key", sourceKeys);
      else q = q.eq("trip_key", tripKey);
      const { error } = await q;
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, jobId, moved });
  }

  return NextResponse.json({ ok: false, error: "unsupported action" }, { status: 400 });
}
