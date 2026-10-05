import { createHash, randomUUID } from "crypto";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

// What goes with a document on the client's page: the original invoice it
// refers to, the waiver sent for it (supabase/migrations/0013_document_exhibits.sql).
// Files sit in a private bucket and leave only through /d/<token>/x/<id>.

export const BILLING_BUCKET = "billing";

export type Exhibit = {
  id: string;
  documentId: string;
  /** The line it belongs under; null = the document as a whole. */
  lineIndex: number | null;
  label: string;
  kind: "link" | "file";
  url: string | null;
  storagePath: string | null;
  contentType: string | null;
  bytes: number | null;
  addedAt: string;
  addedBy: string;
  removedAt: string | null;
};

type Row = {
  id: string;
  document_id: string;
  line_index: number | null;
  label: string;
  kind: "link" | "file";
  url: string | null;
  storage_path: string | null;
  content_type: string | null;
  bytes: number | string | null;
  added_at: string;
  added_by: string;
  removed_at: string | null;
};

function toExhibit(r: Row): Exhibit {
  return {
    id: r.id,
    documentId: r.document_id,
    lineIndex: r.line_index,
    label: r.label,
    kind: r.kind,
    url: r.url,
    storagePath: r.storage_path,
    contentType: r.content_type,
    bytes: r.bytes === null ? null : Number(r.bytes),
    addedAt: r.added_at,
    addedBy: r.added_by,
    removedAt: r.removed_at,
  };
}

function fail(what: string, message: string): never {
  throw new Error(`${what} failed: ${message}`);
}

/** What a client sees with the document: everything not taken down, oldest first. */
export async function listExhibits(documentId: string): Promise<Exhibit[]> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("document_exhibits")
    .select("*")
    .eq("document_id", documentId)
    .is("removed_at", null)
    .order("added_at", { ascending: true });
  if (error) fail("list exhibits", error.message);
  return (data ?? []).map((r) => toExhibit(r as Row));
}

export async function getExhibit(id: string): Promise<Exhibit | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("document_exhibits").select("*").eq("id", id).maybeSingle();
  if (error) fail("get exhibit", error.message);
  return data ? toExhibit(data as Row) : null;
}

type Common = { documentId: string; lineIndex: number | null; label: string; addedBy: string };

export async function addLinkExhibit(input: Common & { url: string }): Promise<Exhibit> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("document_exhibits")
    .insert({
      document_id: input.documentId,
      line_index: input.lineIndex,
      label: input.label,
      kind: "link",
      url: input.url,
      added_by: input.addedBy,
    })
    .select("*")
    .single();
  if (error) fail("add link", error.message);
  return toExhibit(data as Row);
}

export async function addFileExhibit(
  input: Common & { filename: string; content: Buffer; contentType: string },
): Promise<Exhibit> {
  const db = getSupabaseAdmin();
  // The name on disk is ours; the client only ever sees the label.
  const ext = input.filename.includes(".") ? input.filename.split(".").pop()!.toLowerCase() : "bin";
  const storagePath = `${input.documentId}/${randomUUID()}.${ext}`;
  const up = await db.storage.from(BILLING_BUCKET).upload(storagePath, input.content, { contentType: input.contentType, upsert: false });
  if (up.error) fail("store file", up.error.message);
  const { data, error } = await db
    .from("document_exhibits")
    .insert({
      document_id: input.documentId,
      line_index: input.lineIndex,
      label: input.label,
      kind: "file",
      storage_path: storagePath,
      content_type: input.contentType,
      bytes: input.content.length,
      sha256: createHash("sha256").update(input.content).digest("hex"),
      added_by: input.addedBy,
    })
    .select("*")
    .single();
  if (error) fail("add file", error.message);
  return toExhibit(data as Row);
}

/** Take one down. It stays in the table with the reason; the client's page stops showing it. */
export async function removeExhibit(id: string, documentId: string, reason: string, now: Date = new Date()): Promise<boolean> {
  const why = reason.trim();
  if (!why) throw new Error("taking an exhibit down needs a reason");
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("document_exhibits")
    .update({ removed_at: now.toISOString(), remove_reason: why })
    .eq("id", id)
    .eq("document_id", documentId)
    .is("removed_at", null)
    .select("id")
    .maybeSingle();
  if (error) fail("remove exhibit", error.message);
  return Boolean(data);
}

export async function readExhibitFile(storagePath: string): Promise<Buffer> {
  const db = getSupabaseAdmin();
  const { data, error } = await db.storage.from(BILLING_BUCKET).download(storagePath);
  if (error || !data) fail("read file", error?.message ?? "no data");
  return Buffer.from(await data.arrayBuffer());
}
