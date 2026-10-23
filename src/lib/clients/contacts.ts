import { getSupabaseAdmin } from "@/lib/supabase/admin";

// One client record (T119, migration 0056): a job or a lead points at the
// person on its client (contact_id), and the database mirrors that person's
// name, email and phone onto it. This only finds the person; it never adds
// or edits one. The match is Award's rule, and 0056's client_contact_match():
// the email when there is one, else the name, case-insensitive, active only.

export type ContactRow = { id: string; name: string; email: string; active: boolean; created_at: string };

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

export async function findContact(clientId: string, name: string | undefined, email: string | undefined): Promise<string | null> {
  const { data, error } = await getSupabaseAdmin().from("client_contacts").select("id, name, email, active, created_at").eq("client_id", clientId);
  if (error) throw new Error(`clients: read contacts failed: ${error.message}`);
  return matchContact((data ?? []) as ContactRow[], name, email);
}
