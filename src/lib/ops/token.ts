import { timingSafeEqual } from "crypto";

// The agent token check, shared by the proxy and authorizeOps: the request's
// `Authorization: Bearer <OPS_AGENT_TOKEN>`, compared in constant time. Pure
// (no Supabase), so the proxy can import it.
export function agentTokenMatches(header: string | null): boolean {
  if (!header || !header.startsWith("Bearer ")) return false;
  const secret = process.env.OPS_AGENT_TOKEN;
  if (!secret || secret.length < 16) return false;
  const a = Buffer.from(header.slice(7).trim(), "utf8");
  const b = Buffer.from(secret, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
