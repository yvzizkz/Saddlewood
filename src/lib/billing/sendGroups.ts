import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { DocumentError } from "./documents";
import type { SendGroup } from "./types";

// Documents that go out together in one email (supabase/migrations/0019).
// A group is a name and a client; its documents point at it
// (documents.send_group_id). Made once and never edited: what went out
// together is read back from the proof record, one "sent" line per document.

const UNIQUE_VIOLATION = "23505";
const FOREIGN_KEY_VIOLATION = "23503";

type Row = {
  id: string;
  name: string;
  client_id: string | null;
  note: string;
  created_by: string;
  created_at: string;
};

function toGroup(r: Row): SendGroup {
  return { id: r.id, name: r.name, clientId: r.client_id, note: r.note, createdBy: r.created_by, createdAt: r.created_at };
}

/** One spelling of a group's name: "jury-1012 " is JURY-1012. */
export function normalizeGroupName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().toUpperCase();
}

export async function createSendGroup(input: { name: string; clientId: string | null; note?: string; createdBy: string }): Promise<SendGroup> {
  const db = getSupabaseAdmin();
  const name = normalizeGroupName(input.name);
  const { data, error } = await db
    .from("send_groups")
    .insert({ name, client_id: input.clientId, note: input.note ?? "", created_by: input.createdBy })
    .select("*")
    .single();
  if (error) {
    if (error.code === UNIQUE_VIOLATION) throw new DocumentError(`a send group named ${name} already exists`, 409);
    if (error.code === FOREIGN_KEY_VIOLATION) throw new DocumentError("there is no such client", 400);
    throw new Error(`create send group failed: ${error.message}`);
  }
  return toGroup(data as Row);
}

export async function getSendGroup(id: string): Promise<SendGroup | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("send_groups").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`get send group failed: ${error.message}`);
  return data ? toGroup(data as Row) : null;
}
