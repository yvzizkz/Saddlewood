import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { buildTimeline, type CoEvent, type CoEventKind, type TimelineLine } from "./coTimeline";
import type { DocumentEvent } from "./types";

// change_order_events (0059): every writer of the register adds its line here.

/** Add a line to a change order's timeline. Throws: use where the move itself can still fail with it. */
export async function coEvent(id: number, kind: CoEventKind, actor: string, detail: Record<string, unknown> = {}): Promise<void> {
  const { error } = await getSupabaseAdmin().from("change_order_events").insert({ change_order_id: id, kind, actor, detail });
  if (error) throw new Error(`change_order_events insert: ${error.message}`);
}

/** The same, for several change orders, after the move already happened: a lost line must not undo it. */
export async function coEventsAfter(ids: number[], kind: CoEventKind, actor: string, detail: Record<string, unknown> = {}): Promise<void> {
  if (!ids.length) return;
  const { error } = await getSupabaseAdmin()
    .from("change_order_events")
    .insert(ids.map((id) => ({ change_order_id: id, kind, actor, detail })));
  if (error) console.error(`change_order_events insert (${kind}):`, error.message);
}

/** Each change order's timeline: its own lines plus its document's proof record. */
export async function loadTimelines(cos: { id: number; documentId: string | null }[], opts: { money?: boolean } = {}): Promise<Map<number, TimelineLine[]>> {
  const out = new Map<number, TimelineLine[]>();
  if (!cos.length) return out;
  const db = getSupabaseAdmin();
  const docIds = [...new Set(cos.map((c) => c.documentId).filter((d): d is string => !!d))];
  const [ev, dev] = await Promise.all([
    db.from("change_order_events").select("change_order_id,kind,at,actor,detail").in("change_order_id", cos.map((c) => c.id)).order("at").order("id"),
    docIds.length
      ? db.from("document_events").select("document_id,kind,at,actor,automatic,detail").in("document_id", docIds).in("kind", ["delivered", "bounced", "viewed", "downloaded", "accepted", "signed"]).order("at")
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (ev.error) throw new Error(`change_order_events read: ${ev.error.message}`);
  if (dev.error) throw new Error(`document_events read: ${dev.error.message}`);
  type E = CoEvent & { change_order_id: number };
  type D = { document_id: string; kind: DocumentEvent["kind"]; at: string; actor: string; automatic: boolean; detail: Record<string, unknown> | null };
  const byCo = new Map<number, CoEvent[]>();
  for (const e of (ev.data ?? []) as E[]) byCo.set(e.change_order_id, [...(byCo.get(e.change_order_id) ?? []), { kind: e.kind, at: e.at, actor: e.actor, detail: e.detail ?? {} }]);
  const byDoc = new Map<string, DocumentEvent[]>();
  for (const d of (dev.data ?? []) as D[]) {
    const e: DocumentEvent = { id: 0, documentId: d.document_id, kind: d.kind, at: d.at, actor: d.actor, automatic: d.automatic, emailId: null, detail: d.detail ?? {} };
    byDoc.set(d.document_id, [...(byDoc.get(d.document_id) ?? []), e]);
  }
  for (const c of cos) out.set(c.id, buildTimeline(byCo.get(c.id) ?? [], c.documentId ? (byDoc.get(c.documentId) ?? []) : [], opts));
  return out;
}
