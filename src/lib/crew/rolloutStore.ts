import { readState } from "@/lib/bot/queries";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { addDays, localDay } from "./time";
import { rolloutRows, type RolloutMark, type RolloutPerson, type RolloutRow } from "./rollout";

// What rollout.ts reads, with the service role. The page has checked the seat.

const WINDOW_DAYS = 90;
/** Shifts the person clocked themselves. 'office' is someone typing their hours in for them. */
const OWN_CLOCK = ["app", "late"];
const recently = new Map<string, number>();

/** Stamp that a staff person opened the app, at most every five minutes per server. Never fails the page. */
export async function noteStaffSeen(email: string): Promise<void> {
  const now = Date.now();
  if (now - (recently.get(email) ?? 0) < 5 * 60_000) return;
  recently.set(email, now);
  await getSupabaseAdmin().from("staff_seen").upsert({ email, last_seen_at: new Date(now).toISOString() }, { onConflict: "email" }).then(
    () => undefined,
    () => undefined,
  );
}

export async function loadRollout(today = localDay()): Promise<RolloutRow[]> {
  const db = getSupabaseAdmin();
  const from = addDays(today, -WINDOW_DAYS);
  const [crew, groups, seen, shifts, entries, { sections }] = await Promise.all([
    db.from("crew_people").select("email,name,group_id,phone,last_seen_at").eq("active", true),
    db.from("crew_groups").select("id,name"),
    db.from("staff_seen").select("email,last_seen_at"),
    db.from("crew_shifts").select("email,day").eq("status", "ok").in("source", OWN_CLOCK).gte("day", from),
    db.from("crew_entries").select("email,day").eq("kind", "eod").gte("day", from),
    readState(),
  ]);
  for (const [what, res] of [["crew_people", crew], ["crew_groups", groups], ["staff_seen", seen], ["crew_shifts", shifts], ["crew_entries", entries]] as const) {
    if (res.error) throw new Error(`${what}: ${res.error.message}`);
  }
  const groupName = new Map(((groups.data ?? []) as { id: string; name: string }[]).map((g) => [g.id, g.name]));
  const people: RolloutPerson[] = ((crew.data ?? []) as { email: string; name: string | null; group_id: string | null; phone: string | null; last_seen_at: string | null }[]).map((p) => ({
    name: p.name || p.email,
    seat: (p.group_id && groupName.get(p.group_id)) || "Crew",
    hasPhone: !!p.phone?.trim(),
    lastSeenAt: p.last_seen_at,
    emails: [p.email],
    field: true,
  }));

  // One person can have two staff addresses.
  const seenAt = new Map(((seen.data ?? []) as { email: string; last_seen_at: string }[]).map((s) => [s.email, s.last_seen_at]));
  const office = new Map<string, RolloutPerson>();
  for (const [email, who] of Object.entries((sections.people ?? {}) as Record<string, { name?: string }>)) {
    const name = who.name || email;
    const p = office.get(name) ?? { name, seat: "Office", hasPhone: true, lastSeenAt: null, emails: [], field: false };
    const at = seenAt.get(email) ?? null;
    p.emails.push(email);
    if (at && (!p.lastSeenAt || at > p.lastSeenAt)) p.lastSeenAt = at;
    office.set(name, p);
  }
  return rolloutRows([...office.values(), ...people], (shifts.data ?? []) as RolloutMark[], (entries.data ?? []) as RolloutMark[], today);
}
