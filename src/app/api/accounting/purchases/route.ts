import { NextRequest, NextResponse } from "next/server";

import { listTrades } from "@/lib/accounting/trades";
import { getViewer, viewerIsOwner } from "@/lib/crew/auth";
import { assignPurchases, relinkPurchases, upsertAlias } from "@/lib/crew/purchaseQueries";
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

  // A register alias rule (the "Which job is this?" banner): every line under the name, now and on later syncs.
  if (action === "alias_rule") {
    const jobKey = typeof body.jobKey === "string" ? body.jobKey.trim() : "";
    if (!jobKey) return NextResponse.json({ ok: false, error: "jobKey is required" }, { status: 400 });
    const jobId = typeof body.jobId === "string" && body.jobId.trim() !== "" ? body.jobId.trim() : null;
    // clearAlias: forget the rule; the name's lines go back to unanswered (not set aside), except lines placed by hand.
    if (body.clearAlias === true) {
      const { error: delErr } = await db.from("job_aliases").delete().eq("alias", jobKey);
      if (delErr) return NextResponse.json({ ok: false, error: delErr.message }, { status: 500 });
      const { error: upErr } = await db.from("purchases").update({ job_id: null, meta: {}, updated_at: new Date().toISOString() }).eq("job_key", jobKey).eq("job_manual", false);
      if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
      return NextResponse.json({ ok: true, jobId: null, moved: 0 });
    }
    await upsertAlias(jobKey, jobId, actor);
    const moved = await relinkPurchases(jobKey, jobId);
    return NextResponse.json({ ok: true, jobId, moved });
  }

  // One trip or some lines, by hand: no alias rule, no "set aside", and a re-sync keeps it (0042).
  if (action === "assign_job") {
    const jobId = typeof body.jobId === "string" && body.jobId.trim() !== "" ? body.jobId.trim() : null;
    const tripKey = typeof body.tripKey === "string" ? body.tripKey.trim() : "";
    const sourceKeys = Array.isArray(body.sourceKeys) ? body.sourceKeys.map(String).filter(Boolean) : [];
    if (!tripKey && !sourceKeys.length) {
      return NextResponse.json({ ok: false, error: "tripKey or sourceKeys required (a register name's rule is alias_rule)" }, { status: 400 });
    }
    const moved = await assignPurchases({ tripKey, sourceKeys }, jobId);
    return NextResponse.json({ ok: true, jobId, moved });
  }

  return NextResponse.json({ ok: false, error: "unsupported action" }, { status: 400 });
}
