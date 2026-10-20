// Role seats in the database (0032), and everyone who can hold one. Server only.
// Reading never fails a screen: without the table the decided defaults apply.

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { readState } from "@/lib/bot/queries";
import { DEFAULT_SEATS, peopleOf, ROLES, type Person, type Role, type Seat } from "./seats";

export async function loadSeats(): Promise<Seat[]> {
  const { data, error } = await getSupabaseAdmin().from("role_seats").select("role,holder,backup,note,updated_by,updated_at");
  if (error || !data) return DEFAULT_SEATS;
  const rows = data as { role: Role; holder: string; backup: string; note: string; updated_by: string; updated_at: string }[];
  return ROLES.map((role) => {
    const r = rows.find((x) => x.role === role);
    return r ? { role, holder: r.holder, backup: r.backup, note: r.note, updatedBy: r.updated_by, updatedAt: r.updated_at } : DEFAULT_SEATS.find((s) => s.role === role)!;
  });
}

export async function loadPeople(): Promise<Person[]> {
  const [{ sections }, crew] = await Promise.all([readState(), getSupabaseAdmin().from("crew_people").select("email,name,active")]);
  const active = ((crew.data ?? []) as { email: string; name: string | null; active: boolean }[]).filter((c) => c.active);
  return peopleOf(sections.people, active);
}

export class SeatError extends Error {}

export async function saveSeat(role: string, patch: { holder?: string; backup?: string; note?: string }, by: string): Promise<void> {
  if (!(ROLES as readonly string[]).includes(role)) throw new SeatError("That is not a role.");
  const clean = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 120) : undefined);
  const row: Record<string, unknown> = { role, updated_by: by, updated_at: new Date().toISOString() };
  for (const k of ["holder", "backup", "note"] as const) {
    const v = clean(patch[k]);
    if (v !== undefined) row[k] = v;
  }
  const { error } = await getSupabaseAdmin().from("role_seats").upsert(row, { onConflict: "role" });
  if (error) throw new Error(`role_seats write failed: ${error.message}`);
}
