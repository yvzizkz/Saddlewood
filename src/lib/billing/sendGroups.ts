import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { DocumentError } from "./documents";
import { cleanAddress } from "./send";
import type { SendGroup, SendGroupMessage } from "./types";

// Documents that go out together in one email (supabase/migrations/0019).
// A group is a name and a client; its documents point at it
// (documents.send_group_id). What went out together is read back from the
// proof record, one "sent" line per document. The one thing that is edited is
// the group's working message (0020): the email an owner reviews on the Bill
// screen before the group is sent.

const UNIQUE_VIOLATION = "23505";
const FOREIGN_KEY_VIOLATION = "23503";

type Row = {
  id: string;
  name: string;
  client_id: string | null;
  note: string;
  created_by: string;
  created_at: string;
  message?: unknown;
};

function toGroup(r: Row): SendGroup {
  return {
    id: r.id,
    name: r.name,
    clientId: r.client_id,
    note: r.note,
    createdBy: r.created_by,
    createdAt: r.created_at,
    message: readMessage(r.message),
  };
}

const MAX_RECIPIENTS = 10;

/** The stored message, leniently: a field that is not what it should be is left out, never thrown on. */
export function readMessage(raw: unknown): SendGroupMessage {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const r = raw as Record<string, unknown>;
  const text = (k: string, max: number) => (typeof r[k] === "string" ? (r[k] as string).slice(0, max) : undefined);
  const list = (k: string) =>
    Array.isArray(r[k]) ? (r[k] as unknown[]).map(cleanAddress).filter((a): a is string => !!a).slice(0, MAX_RECIPIENTS) : undefined;
  const out: SendGroupMessage = {};
  const subject = text("subject", 200);
  if (subject !== undefined) out.subject = subject;
  const body = text("body", 6000);
  if (body !== undefined) out.body = body;
  const intro = text("intro", 600);
  if (intro !== undefined) out.intro = intro;
  const to = list("to");
  if (to) out.to = to;
  const cc = list("cc");
  if (cc) out.cc = cc;
  for (const k of ["updatedAt", "updatedBy", "sentAt", "emailId"] as const) {
    const v = text(k, 200);
    if (v !== undefined) out[k] = v;
  }
  return out;
}

/**
 * What a caller may put in the message, read strictly: subject, body, to, cc,
 * intro. Anything else is refused by name. Recipients are kept as given here;
 * whether they may receive the message is decided at send time (deliver.ts).
 */
export function readMessageInput(raw: unknown): { ok: true; value: SendGroupMessage } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "message must be an object" };
  const r = raw as Record<string, unknown>;
  const out: SendGroupMessage = {};
  for (const k of Object.keys(r)) {
    if (!["subject", "body", "to", "cc", "intro"].includes(k)) return { ok: false, error: `message.${k} is not something a message has` };
  }
  const text = (k: "subject" | "body" | "intro", max: number) => {
    if (r[k] === undefined) return null;
    if (typeof r[k] !== "string") return `message.${k} must be text`;
    const v = (r[k] as string).replace(/\r\n/g, "\n").trim();
    if (v.length > max) return `message.${k} is too long (${max} characters at most)`;
    out[k] = v;
    return null;
  };
  for (const [k, max] of [["subject", 200], ["body", 6000], ["intro", 600]] as const) {
    const err = text(k, max);
    if (err) return { ok: false, error: err };
  }
  for (const k of ["to", "cc"] as const) {
    if (r[k] === undefined) continue;
    if (!Array.isArray(r[k])) return { ok: false, error: `message.${k} must be a list of addresses` };
    const list: string[] = [];
    for (const item of r[k] as unknown[]) {
      const a = cleanAddress(item);
      if (!a) return { ok: false, error: `message.${k} has an address that is not valid` };
      if (!list.includes(a)) list.push(a);
    }
    if (list.length > MAX_RECIPIENTS) return { ok: false, error: `message.${k}: ${MAX_RECIPIENTS} addresses at most` };
    out[k] = list;
  }
  return { ok: true, value: out };
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

/** Change the working message. Refused once the group was sent: a correction after that is a new document. */
export async function updateSendGroupMessage(id: string, changes: SendGroupMessage, actor: string, now: Date = new Date()): Promise<SendGroup> {
  const current = await getSendGroup(id);
  if (!current) throw new DocumentError("there is no such send group", 404);
  if (current.message.sentAt) throw new DocumentError(`${current.name} was sent on ${current.message.sentAt}; its message cannot change now`, 409);
  const message: SendGroupMessage = { ...current.message, ...changes, updatedAt: now.toISOString(), updatedBy: actor };
  return writeMessage(id, message);
}

/** Stamp the group as sent. Written after the mail left, never before. */
export async function markSendGroupSent(id: string, emailId: string, now: Date = new Date()): Promise<SendGroup | null> {
  const current = await getSendGroup(id);
  if (!current) return null;
  return writeMessage(id, { ...current.message, sentAt: now.toISOString(), emailId });
}

async function writeMessage(id: string, message: SendGroupMessage): Promise<SendGroup> {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("send_groups").update({ message }).eq("id", id).select("*").single();
  if (error) throw new Error(`update send group failed: ${error.message}`);
  return toGroup(data as Row);
}

/** The latest groups, newest first: what the Bill screen lists to continue or look back at. */
export async function listSendGroups(limit = 12): Promise<SendGroup[]> {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("send_groups").select("*").order("created_at", { ascending: false }).limit(limit);
  if (error) throw new Error(`list send groups failed: ${error.message}`);
  return ((data ?? []) as Row[]).map(toGroup);
}

export async function getSendGroup(id: string): Promise<SendGroup | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("send_groups").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`get send group failed: ${error.message}`);
  return data ? toGroup(data as Row) : null;
}
