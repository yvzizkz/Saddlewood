import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  OPS_COLUMNS,
  OPS_OWNERS,
  type CreateCardInput,
  type OpsCard,
  type OpsComment,
  type OpsColumn,
  type OpsEvent,
  type OpsOwner,
  type PatchCardInput,
  slugFromTitle,
} from "./types";

// All reads and writes go through the service-role client after the route has
// authorized the actor (see ./auth). The tables carry RLS with no policies,
// so nothing reaches them from the anon key by accident.

type Row = {
  id: string;
  title: string;
  owner: string;
  col: string;
  note: string | null;
  next_step: string | null;
  doc_slug: string | null;
  due_date: string | null;
  sort: number | null;
  updated_at: string;
  updated_by: string | null;
  archived_at: string | null;
};

function asCol(v: unknown): OpsColumn {
  return (OPS_COLUMNS as readonly string[]).includes(String(v)) ? (v as OpsColumn) : "backlog";
}
function asOwner(v: unknown): OpsOwner {
  return (OPS_OWNERS as readonly string[]).includes(String(v)) ? (v as OpsOwner) : "Lando";
}

function toCard(r: Row): OpsCard {
  return {
    id: r.id,
    title: r.title,
    owner: asOwner(r.owner),
    col: asCol(r.col),
    note: r.note ?? "",
    nextStep: r.next_step ?? "",
    docSlug: r.doc_slug ?? null,
    dueDate: r.due_date ?? null,
    sort: r.sort ?? 0,
    updatedAt: r.updated_at,
    updatedBy: r.updated_by ?? "",
    archivedAt: r.archived_at,
  };
}

export async function listCards(opts: { includeArchived?: boolean } = {}): Promise<OpsCard[]> {
  const db = getSupabaseAdmin();
  let q = db.from("ops_cards").select("*").order("sort", { ascending: true }).order("id", { ascending: true });
  if (!opts.includeArchived) q = q.is("archived_at", null);
  const { data, error } = await q;
  if (error) throw new Error(`ops_cards list failed: ${error.message}`);
  return (data as Row[]).map(toCard);
}

export async function getCard(id: string): Promise<OpsCard | null> {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("ops_cards").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`ops_cards get failed: ${error.message}`);
  return data ? toCard(data as Row) : null;
}

export async function createCard(input: CreateCardInput, actor: string): Promise<OpsCard> {
  const db = getSupabaseAdmin();
  const id = input.id ?? slugFromTitle(input.title);
  const existing = await getCard(id);
  const row = {
    id,
    title: input.title,
    owner: input.owner,
    col: input.col,
    note: input.note ?? "",
    next_step: input.nextStep ?? existing?.nextStep ?? "",
    doc_slug: input.docSlug === undefined ? (existing?.docSlug ?? null) : input.docSlug,
    due_date: input.dueDate === undefined ? (existing?.dueDate ?? null) : input.dueDate,
    sort: input.sort ?? existing?.sort ?? 1000,
    updated_by: actor,
    archived_at: null,
  };
  const { data, error } = await db.from("ops_cards").upsert(row, { onConflict: "id" }).select("*").single();
  if (error) throw new Error(`ops_cards upsert failed: ${error.message}`);
  await db.from("ops_card_events").insert({
    card_id: id,
    from_col: existing?.col ?? null,
    to_col: input.col,
    actor,
    kind: existing ? "update" : "create",
  });
  return toCard(data as Row);
}

export async function patchCard(id: string, input: PatchCardInput, actor: string): Promise<OpsCard | null> {
  const db = getSupabaseAdmin();
  const existing = await getCard(id);
  if (!existing) return null;
  const patch: Record<string, unknown> = { updated_by: actor };
  if (input.title !== undefined) patch.title = input.title;
  if (input.owner !== undefined) patch.owner = input.owner;
  if (input.col !== undefined) patch.col = input.col;
  if (input.note !== undefined) patch.note = input.note;
  if (input.nextStep !== undefined) patch.next_step = input.nextStep;
  if (input.docSlug !== undefined) patch.doc_slug = input.docSlug;
  if (input.dueDate !== undefined) patch.due_date = input.dueDate;
  if (input.sort !== undefined) patch.sort = input.sort;
  const { data, error } = await db.from("ops_cards").update(patch).eq("id", id).select("*").single();
  if (error) throw new Error(`ops_cards update failed: ${error.message}`);
  if (input.col !== undefined && input.col !== existing.col) {
    await db.from("ops_card_events").insert({
      card_id: id,
      from_col: existing.col,
      to_col: input.col,
      actor,
      kind: "move",
    });
  }
  return toCard(data as Row);
}

export async function archiveCard(id: string, actor: string): Promise<boolean> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("ops_cards")
    .update({ archived_at: new Date().toISOString(), updated_by: actor })
    .eq("id", id)
    .is("archived_at", null)
    .select("id");
  if (error) throw new Error(`ops_cards archive failed: ${error.message}`);
  const hit = Array.isArray(data) && data.length > 0;
  if (hit) {
    await db.from("ops_card_events").insert({ card_id: id, from_col: null, to_col: null, actor, kind: "archive" });
  }
  return hit;
}

export async function listEvents(limit = 50): Promise<OpsEvent[]> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("ops_card_events")
    .select("id, card_id, from_col, to_col, actor, at")
    .order("at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`ops_card_events list failed: ${error.message}`);
  type E = { id: number; card_id: string; from_col: string | null; to_col: string | null; actor: string; at: string };
  return (data as E[]).map((e) => ({
    id: e.id,
    cardId: e.card_id,
    fromCol: e.from_col ? asCol(e.from_col) : null,
    toCol: e.to_col ? asCol(e.to_col) : null,
    actor: e.actor,
    at: e.at,
  }));
}

type EventRow = { id: number; card_id: string; from_col: string | null; to_col: string | null; actor: string; at: string; kind?: string };

export async function listCardEvents(cardId: string, limit = 30): Promise<OpsEvent[]> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("ops_card_events")
    .select("id, card_id, from_col, to_col, actor, at, kind")
    .eq("card_id", cardId)
    .order("at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`ops_card_events list failed: ${error.message}`);
  return (data as EventRow[]).map((e) => ({
    id: e.id,
    cardId: e.card_id,
    fromCol: e.from_col ? asCol(e.from_col) : null,
    toCol: e.to_col ? asCol(e.to_col) : null,
    actor: e.actor,
    at: e.at,
  }));
}

type CommentRow = { id: number; card_id: string; author: string; body: string; at: string };

function toComment(c: CommentRow): OpsComment {
  return { id: c.id, cardId: c.card_id, author: c.author, body: c.body, at: c.at };
}

export async function listComments(cardId: string, limit = 100): Promise<OpsComment[]> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("ops_card_comments")
    .select("id, card_id, author, body, at")
    .eq("card_id", cardId)
    .order("at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(`ops_card_comments list failed: ${error.message}`);
  return (data as CommentRow[]).map(toComment);
}

export async function addComment(cardId: string, body: string, actor: string): Promise<OpsComment | null> {
  const db = getSupabaseAdmin();
  const card = await getCard(cardId);
  if (!card) return null;
  const { data, error } = await db
    .from("ops_card_comments")
    .insert({ card_id: cardId, author: actor, body })
    .select("id, card_id, author, body, at")
    .single();
  if (error) throw new Error(`ops_card_comments insert failed: ${error.message}`);
  await db.from("ops_cards").update({ updated_by: actor }).eq("id", cardId);
  return toComment(data as CommentRow);
}
