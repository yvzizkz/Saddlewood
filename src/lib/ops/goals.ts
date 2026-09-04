import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  GOAL_HORIZONS,
  GOAL_KINDS,
  GOAL_OWNERS,
  slugFromTitle,
  type CreateGoalInput,
  type GoalHorizon,
  type GoalKind,
  type GoalOwner,
  type OpsGoal,
  type PatchGoalInput,
} from "./types";

type Row = {
  id: string;
  title: string;
  kind: string;
  owner: string;
  due_date: string | null;
  recur_weekday: number | null;
  recur_monthday: number | null;
  horizon: string | null;
  status: string;
  notes: string | null;
  card_id: string | null;
  doc_slug: string | null;
  done_at: string | null;
  updated_by: string | null;
  updated_at: string;
};

function pick<T extends string>(allowed: readonly T[], v: unknown, fallback: T): T {
  return (allowed as readonly string[]).includes(String(v)) ? (v as T) : fallback;
}

function toGoal(r: Row): OpsGoal {
  return {
    id: r.id,
    title: r.title,
    kind: pick<GoalKind>(GOAL_KINDS, r.kind, "goal"),
    owner: pick<GoalOwner>(GOAL_OWNERS, r.owner, "Team"),
    dueDate: r.due_date,
    recurWeekday: r.recur_weekday,
    recurMonthday: r.recur_monthday,
    horizon: r.horizon ? pick<GoalHorizon>(GOAL_HORIZONS, r.horizon, "quarter") : null,
    status: r.status === "done" ? "done" : "open",
    notes: r.notes ?? "",
    cardId: r.card_id,
    docSlug: r.doc_slug,
    doneAt: r.done_at,
    updatedBy: r.updated_by ?? "",
    updatedAt: r.updated_at,
  };
}

export async function listGoals(): Promise<OpsGoal[]> {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("ops_goals").select("*").order("due_date", { ascending: true, nullsFirst: false }).order("id");
  if (error) throw new Error(`ops_goals list failed: ${error.message}`);
  return (data as Row[]).map(toGoal);
}

export async function getGoal(id: string): Promise<OpsGoal | null> {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("ops_goals").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`ops_goals get failed: ${error.message}`);
  return data ? toGoal(data as Row) : null;
}

export async function createGoal(input: CreateGoalInput, actor: string): Promise<OpsGoal> {
  const db = getSupabaseAdmin();
  const id = input.id ?? slugFromTitle(input.title);
  const row = {
    id,
    title: input.title,
    kind: input.kind,
    owner: input.owner,
    due_date: input.dueDate ?? null,
    recur_weekday: input.recurWeekday ?? null,
    recur_monthday: input.recurMonthday ?? null,
    horizon: input.horizon ?? null,
    notes: input.notes ?? "",
    card_id: input.cardId ?? null,
    doc_slug: input.docSlug ?? null,
    updated_by: actor,
  };
  const { data, error } = await db.from("ops_goals").upsert(row, { onConflict: "id" }).select("*").single();
  if (error) throw new Error(`ops_goals upsert failed: ${error.message}`);
  return toGoal(data as Row);
}

export async function patchGoal(id: string, input: PatchGoalInput, actor: string): Promise<OpsGoal | null> {
  const db = getSupabaseAdmin();
  const existing = await getGoal(id);
  if (!existing) return null;
  const patch: Record<string, unknown> = { updated_by: actor };
  if (input.title !== undefined) patch.title = input.title;
  if (input.kind !== undefined) patch.kind = input.kind;
  if (input.owner !== undefined) patch.owner = input.owner;
  if (input.dueDate !== undefined) patch.due_date = input.dueDate;
  if (input.recurWeekday !== undefined) patch.recur_weekday = input.recurWeekday;
  if (input.recurMonthday !== undefined) patch.recur_monthday = input.recurMonthday;
  if (input.horizon !== undefined) patch.horizon = input.horizon;
  if (input.notes !== undefined) patch.notes = input.notes;
  if (input.cardId !== undefined) patch.card_id = input.cardId;
  if (input.docSlug !== undefined) patch.doc_slug = input.docSlug;
  if (input.status !== undefined) {
    patch.status = input.status;
    patch.done_at = input.status === "done" ? new Date().toISOString() : null;
  }
  const { data, error } = await db.from("ops_goals").update(patch).eq("id", id).select("*").single();
  if (error) throw new Error(`ops_goals update failed: ${error.message}`);
  return toGoal(data as Row);
}

export async function deleteGoal(id: string): Promise<boolean> {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("ops_goals").delete().eq("id", id).select("id");
  if (error) throw new Error(`ops_goals delete failed: ${error.message}`);
  return Array.isArray(data) && data.length > 0;
}
