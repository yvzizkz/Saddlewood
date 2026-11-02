import { NextRequest, NextResponse } from "next/server";

import { authorizeBillingWrite } from "@/lib/billing/access";
import { queueJoist } from "@/lib/billing/joistSyncStore";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// An owner asks for the Joist copy again (after it was flagged as failed).

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await authorizeBillingWrite(request, { allowToken: false });
  if (gate.response) return gate.response;
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  const { data } = await getSupabaseAdmin().from("change_orders").select("id").eq("id", id).maybeSingle();
  if (!data) return NextResponse.json({ ok: false, error: "No such change order." }, { status: 404 });
  await getSupabaseAdmin().from("change_orders").update({ joist_error: "" }).eq("id", id);
  await queueJoist(id, "retry");
  return NextResponse.json({ ok: true });
}
