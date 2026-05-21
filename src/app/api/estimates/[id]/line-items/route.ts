import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const PostSchema = z.object({
  trade_id: z.string().uuid(),
  description: z.string().max(500).optional().default(""),
  area_location: z.string().max(200).nullable().optional().default(null),
});

// POST: create a new MANUAL line item under the given trade. Server is the
// source of truth for sort_order (appended at end of trade) and for the
// MANUAL source_sheet flag, so the client doesn't get to override them.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // Cross-estimate sanity check: the trade must belong to the URL's estimate.
  const { data: trade, error: tradeErr } = await supabase
    .from("estimate_trades")
    .select("estimate_id")
    .eq("id", parsed.data.trade_id)
    .single();
  if (tradeErr || !trade) {
    return NextResponse.json({ error: "Trade not found" }, { status: 404 });
  }
  if (trade.estimate_id !== id) {
    return NextResponse.json({ error: "Estimate mismatch" }, { status: 400 });
  }

  // Compute next sort_order — max + 1 within this trade. We accept races
  // (two simultaneous adds may collide) because sort_order isn't unique and
  // the resulting tie sorts deterministically by created_at fallback.
  const { data: maxRow, error: maxErr } = await supabase
    .from("estimate_line_items")
    .select("sort_order")
    .eq("trade_id", parsed.data.trade_id)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (maxErr) {
    return NextResponse.json({ error: maxErr.message }, { status: 500 });
  }
  const nextSortOrder = (maxRow?.sort_order ?? -1) + 1;

  const insertRow = {
    trade_id: parsed.data.trade_id,
    description: parsed.data.description,
    area_location: parsed.data.area_location,
    quantity: 0,
    material_unit_cost: 0,
    labor_unit_cost: 0,
    source_sheet: "MANUAL",
    is_manual_override: true,
    is_deleted: false,
    sort_order: nextSortOrder,
  };

  const { data: row, error: insErr } = await supabase
    .from("estimate_line_items")
    .insert(insertRow)
    .select(
      "id, trade_id, description, area_location, quantity, unit, material_unit_cost, labor_unit_cost, labor_hours_per_unit, total, source_sheet, source_grid, dimension_type, confidence, flags, is_allowance, is_deleted, is_manual_override, sort_order",
    )
    .single();
  if (insErr || !row) {
    return NextResponse.json(
      { error: insErr?.message ?? "Insert failed" },
      { status: 500 },
    );
  }

  // Audit row so the dashboard can show "Marco added 1 item" without a
  // separate event log table.
  const { error: auditErr } = await supabase.from("estimate_overrides").insert({
    estimate_id: id,
    trade_id: parsed.data.trade_id,
    line_item_id: row.id,
    field_name: "added",
    old_value: null,
    new_value: "MANUAL",
    changed_by: user.email ?? user.id,
  });
  if (auditErr) {
    console.error(
      "[line-items POST] estimate_overrides insert failed:",
      auditErr,
    );
  }

  return NextResponse.json({ item: row }, { status: 201 });
}
