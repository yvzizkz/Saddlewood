import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const PatchSchema = z
  .object({
    quantity: z.number().nonnegative().optional(),
    material_unit_cost: z.number().nonnegative().optional(),
    labor_unit_cost: z.number().nonnegative().optional(),
  })
  .refine(
    (v) =>
      v.quantity !== undefined ||
      v.material_unit_cost !== undefined ||
      v.labor_unit_cost !== undefined,
    {
      message:
        "At least one of quantity, material_unit_cost, labor_unit_cost is required",
    },
  );

const EDITABLE_FIELDS = [
  "quantity",
  "material_unit_cost",
  "labor_unit_cost",
] as const;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const { id, itemId } = await params;
  const supabase = await createClient();

  // Auth check — must run before any DB read.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Wrap body read so malformed JSON → 400, not 500.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // Read current row for audit-log old_value + cross-tenant guard.
  const { data: before, error: beforeErr } = await supabase
    .from("estimate_line_items")
    .select("id, quantity, material_unit_cost, labor_unit_cost, trade_id")
    .eq("id", itemId)
    .single();
  if (beforeErr || !before) {
    return NextResponse.json({ error: "Line item not found" }, { status: 404 });
  }

  // Cross-tenant guard: confirm this line item lives under the URL's estimate.
  const { data: trade, error: tradeErr } = await supabase
    .from("estimate_trades")
    .select("estimate_id")
    .eq("id", before.trade_id)
    .single();
  if (tradeErr || !trade || trade.estimate_id !== id) {
    return NextResponse.json({ error: "Estimate mismatch" }, { status: 400 });
  }

  const patch = { ...parsed.data, is_manual_override: true };
  const { data: after, error: updErr } = await supabase
    .from("estimate_line_items")
    .update(patch)
    .eq("id", itemId)
    .select(
      "id, quantity, material_unit_cost, labor_unit_cost, total, is_manual_override",
    )
    .single();
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  // Append-only audit log — one row per *actually changed* field.
  // Supabase returns numeric columns as strings, hence Number() coercion.
  const overrideRows = EDITABLE_FIELDS.filter((k) => {
    const next = parsed.data[k];
    if (next === undefined) return false;
    return next !== Number(before[k]);
  }).map((k) => ({
    estimate_id: id,
    trade_id: before.trade_id,
    line_item_id: itemId,
    field_name: k,
    old_value: String(before[k]),
    new_value: String(parsed.data[k]),
    changed_by: user.email ?? user.id,
  }));

  if (overrideRows.length > 0) {
    const { error: auditErr } = await supabase
      .from("estimate_overrides")
      .insert(overrideRows);
    if (auditErr) {
      console.error(
        "[line-items PATCH] estimate_overrides insert failed:",
        auditErr,
      );
    }
  }

  return NextResponse.json({ item: after });
}
