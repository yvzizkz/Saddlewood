import { getSupabaseAdmin } from "@/lib/supabase/admin";

// One client record (T119, migration 0056): a job or a lead points at the
// person on its client (contact_id), and the database mirrors that person's
// name, email and phone onto it. This only finds the person; it never adds
// or edits one. The match is Award's rule, and 0056's client_contact_match():
// the email when there is one, else the name, case-insensitive, active only.

export type ContactRow = { id: string; name: string; email: string; phone?: string; active: boolean; created_at: string };

/** The contact on the client that this name and email are, or null. Pure. */
export function matchContact(rows: ContactRow[], name: string | undefined, email: string | undefined): string | null {
  const e = (email ?? "").trim().toLowerCase();
  const n = (name ?? "").trim().toLowerCase();
  const hit = [...rows]
    .filter((r) => r.active)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .find((r) => (e ? r.email.toLowerCase() === e : n !== "" && r.name.toLowerCase() === n));
  return hit?.id ?? null;
}

const digits = (s: string | undefined) => (s ?? "").replace(/\D/g, "");

/**
 * The contact a lead with these typed details may stay linked to: the match,
 * as long as the database's mirror (0056 opportunities_contact_mirror) would
 * not write over a name or phone typed here. The mirror copies only the
 * record's non-empty values, so an empty record value never conflicts.
 * fillEmpty: an empty typed value may be filled from the record (a new lead);
 * otherwise emptying one is an edit too (Details). Pure.
 */
export function linkableContact(
  rows: ContactRow[],
  typed: { name?: string; email?: string; phone?: string },
  { fillEmpty }: { fillEmpty: boolean },
): string | null {
  const id = matchContact(rows, typed.name, typed.email);
  const r = id ? rows.find((x) => x.id === id) : undefined;
  if (!r) return null;
  const name = (typed.name ?? "").trim();
  const keepsName = !r.name.trim() || r.name.trim() === name || (fillEmpty && !name);
  const keepsPhone = !digits(r.phone) || digits(r.phone) === digits(typed.phone) || (fillEmpty && !digits(typed.phone));
  return keepsName && keepsPhone ? r.id : null;
}

/** linkableContact against the client's contacts. Only reads them. */
export async function findLinkableContact(
  clientId: string,
  typed: { name?: string; email?: string; phone?: string },
  opts: { fillEmpty: boolean },
): Promise<string | null> {
  const { data, error } = await getSupabaseAdmin().from("client_contacts").select("id, name, email, phone, active, created_at").eq("client_id", clientId);
  if (error) throw new Error(`clients: read contacts failed: ${error.message}`);
  return linkableContact((data ?? []) as ContactRow[], typed, opts);
}

export async function findContact(clientId: string, name: string | undefined, email: string | undefined): Promise<string | null> {
  const { data, error } = await getSupabaseAdmin().from("client_contacts").select("id, name, email, active, created_at").eq("client_id", clientId);
  if (error) throw new Error(`clients: read contacts failed: ${error.message}`);
  return matchContact((data ?? []) as ContactRow[], name, email);
}
