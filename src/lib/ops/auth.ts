import type { NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { isAllowedEmail, normalizeEmail } from "./allowlist";
import { agentTokenMatches } from "./token";

// Two ways in, one answer: who is acting.
//
// 1. A signed-in person: the Supabase session cookie names an email on the
//    allowlist. This is Marco, Ilene, Lando, or the shared mailboxes.
// 2. An agent: `Authorization: Bearer <OPS_AGENT_TOKEN>` from the bot or a
//    Claude session, with an optional `X-Ops-Actor` header naming which one.
//    Constant-time compare (./token.ts), the same one the proxy uses.
//
// Anything else is null and the route answers 401.

export type OpsActor = { actor: string; via: "session" | "token" };

function cleanActor(raw: string | null): string {
  const v = (raw ?? "").trim().replace(/[^A-Za-z0-9._@ -]/g, "").slice(0, 64);
  return v || "agent";
}

export async function authorizeOps(request: NextRequest): Promise<OpsActor | null> {
  if (agentTokenMatches(request.headers.get("authorization"))) {
    return { actor: cleanActor(request.headers.get("x-ops-actor")), via: "token" };
  }
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const email = normalizeEmail(user?.email);
    if (user && isAllowedEmail(email)) {
      return { actor: email, via: "session" };
    }
  } catch {
    // No cookies in this context, or Supabase unreachable: treat as anonymous.
  }
  return null;
}
