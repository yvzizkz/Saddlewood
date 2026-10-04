// Who counts as crew, as far as a session can say. Kept free of server-only
// imports so src/proxy.ts can use it.
//
// The mark is app_metadata.sw_role on the Supabase Auth user. A person cannot
// set app_metadata on themselves (only user_metadata); the service role sets
// it when an owner adds them (src/lib/crew/admin.ts) and changes it to
// 'former' when an owner takes the seat away. Every /api/crew route also
// checks the person's row in crew_people, so the mark alone opens nothing but
// the app's shell.

export const CREW_ROLE = "crew";

// A seat that was taken away. The mark is never cleared once set, on purpose:
// the estimate tables trust any signed-in session that carries NO mark (see
// the end of supabase/migrations/0011_crew.sql), so an unmarked ex-crew
// account would be let in where a crew member never was.
export const FORMER_ROLE = "former";

type WithAppMetadata = { app_metadata?: Record<string, unknown> | null } | null | undefined;

export function hasCrewRole(user: WithAppMetadata): boolean {
  return user?.app_metadata?.sw_role === CREW_ROLE;
}
