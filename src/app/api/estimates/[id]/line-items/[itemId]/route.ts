import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const PatchSchema = z
  .object({
    quantity: z.number().nonnegative().optional(),
    material_unit_cost: z.number().nonnegative().optional(),
    labor_unit_cost: z.number().nonnegative().optional(),
    description: z.string().max(500).optional(),
    area_location: z.string().max(200).nullable().optional(),
  })
  .refine(
    (v) =>
      v.quantity !== undefined ||
      v.material_unit_cost !== undefined ||
      v.labor_unit_cost !== undefined ||
      v.description !== undefined ||
      v.area_location !== undefined,
    {
      message:
        "At least one editable field is required",
    },
  );

// Order matters for the audit log only insofar as multiple-changed-fields-at-once
// will sort by this array order in the resulting rows.
const NUMERIC_FIELDS = [
  "quantity",
  "material_unit_cost",
  "labor_unit_cost",
] as const;
const TEXT_FIELDS = ["description", "area_location"] as const;

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
    .select(
      "id, quantity, material_unit_cost, labor_unit_cost, description, area_location, trade_id",
    )
    .eq("id", itemId)
    .single();
  if (beforeErr || !before) {
    return NextResponse.json({ error: "Line item not found" }, { status: 404 });
  }

  // Sanity check: the URL's estimate id must match the trade's estimate_id.
  // NOT a tenancy boundary — RLS is wide-open today (using true / with check
  // true on every table), so this only catches typo'd URLs and refactoring
  // bugs, not malicious cross-estimate access. Tighten RLS when multi-user
  // support lands in a later phase.
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
      "id, quantity, material_unit_cost, labor_unit_cost, description, area_location, total, is_manual_override",
    )
    .single();
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  // Append-only audit log — one row per *actually changed* field.
  // Supabase returns numeric columns as strings, hence Number() coercion.
  // Round to 4 decimals (numeric(14,4)) before compare AND write so input
  // like 5.00001 isn't flagged as a change against stored "5.0000".
  const round4 = (n: number): number => Math.round(n * 10000) / 10000;
  const overrideRows: Array<Record<string, unknown>> = [];

  for (const k of NUMERIC_FIELDS) {
    const next = parsed.data[k];
    if (next === undefined) continue;
    if (round4(next) === Number(before[k])) continue;
    overrideRows.push({
      estimate_id: id,
      trade_id: before.trade_id,
      line_item_id: itemId,
      field_name: k,
      old_value: String(before[k]),
      new_value: String(round4(next)),
      changed_by: user.email ?? user.id,
    });
  }
  for (const k of TEXT_FIELDS) {
    const next = parsed.data[k];
    if (next === undefined) continue;
    // null vs '' on area_location should match the DB shape — Supabase
    // returns null as the JS value `null`, so a direct compare is safe.
    if (next === before[k]) continue;
    overrideRows.push({
      estimate_id: id,
      trade_id: before.trade_id,
      line_item_id: itemId,
      field_name: k,
      old_value: before[k] === null ? null : String(before[k]),
      new_value: next === null ? null : String(next),
      changed_by: user.email ?? user.id,
    });
  }

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

// Soft delete. Returns 200 + { ok: true } on success. Idempotent — re-DELETE
// of an already-deleted item is a no-op, returns 200.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const { id, itemId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Cross-estimate sanity check via the trade.
  const { data: before, error: beforeErr } = await supabase
    .from("estimate_line_items")
    .select("id, trade_id, is_deleted")
    .eq("id", itemId)
    .single();
  if (beforeErr || !before) {
    return NextResponse.json({ error: "Line item not found" }, { status: 404 });
  }

  const { data: trade, error: tradeErr } = await supabase
    .from("estimate_trades")
    .select("estimate_id")
    .eq("id", before.trade_id)
    .single();
  if (tradeErr || !trade || trade.estimate_id !== id) {
    return NextResponse.json({ error: "Estimate mismatch" }, { status: 400 });
  }

  if (before.is_deleted) {
    // Idempotent: caller can retry without seeing 4xx.
    return NextResponse.json({ ok: true });
  }

  const { error: updErr } = await supabase
    .from("estimate_line_items")
    .update({ is_deleted: true })
    .eq("id", itemId);
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  // Single audit row for the deletion.
  const { error: auditErr } = await supabase.from("estimate_overrides").insert({
    estimate_id: id,
    trade_id: before.trade_id,
    line_item_id: itemId,
    field_name: "is_deleted",
    old_value: "false",
    new_value: "true",
    changed_by: user.email ?? user.id,
  });
  if (auditErr) {
    console.error(
      "[line-items DELETE] estimate_overrides insert failed:",
      auditErr,
    );
  }

  return NextResponse.json({ ok: true });
}
