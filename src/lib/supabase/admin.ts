import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Lazy on purpose. Building this client at module scope meant importing the
// module was enough to throw, and `next build` imports every route to collect
// page data -- so a missing production secret broke the build of the whole
// site, including pages that have nothing to do with Supabase. A secret that
// only the deployed environment holds must not be a build-time requirement.
//
// Now the failure lands where it belongs: at request time, on the one route
// that actually needs the key.

let client: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const missing = [
    !url && "NEXT_PUBLIC_SUPABASE_URL",
    !key && "SUPABASE_SERVICE_ROLE_KEY",
  ].filter(Boolean);
  if (missing.length) {
    throw new Error(
      `Supabase admin client cannot initialize — missing ${missing.join(", ")}`,
    );
  }

  client = createClient(url!, key!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return client;
}
