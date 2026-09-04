import { timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { isAllowedEmail, normalizeEmail } from "./allowlist";

// Two ways in, one answer: who is acting.
//
// 1. A signed-in person: the Supabase session cookie names an email on the
//    allowlist. This is Marco, Ilene, Lando, or the shared mailboxes.
// 2. An agent: `Authorization: Bearer <OPS_AGENT_TOKEN>` from the bot or a
//    Claude session, with an optional `X-Ops-Actor` header naming which one.
//    Same constant-time compare as /api/estimates/ingest.
//
// Anything else is null and the route answers 401.

export type OpsActor = { actor: string; via: "session" | "token" };

function tokenMatches(request: NextRequest): boolean {
  const header = request.headers.get("authorization");
  if (!header || !header.startsWith("Bearer ")) return false;
  const secret = process.env.OPS_AGENT_TOKEN;
  if (!secret || secret.length < 16) return false;
  const a = Buffer.from(header.slice(7).trim(), "utf8");
  const b = Buffer.from(secret, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function cleanActor(raw: string | null): string {
  const v = (raw ?? "").trim().replace(/[^A-Za-z0-9._@ -]/g, "").slice(0, 64);
  return v || "agent";
}

export async function authorizeOps(request: NextRequest): Promise<OpsActor | null> {
  if (tokenMatches(request)) {
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
