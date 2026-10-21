// Sign-in for the scenarios: a real Supabase session on this worktree's own
// local stack, set as the app's auth cookie. Local only: the stack's URL and
// keys come from `supabase status`, and anything but 127.0.0.1:55321 stops
// the run before a request is made.

import { execSync } from "node:child_process";
import { test as base, type BrowserContext, type Page } from "@playwright/test";

const LOCAL = "http://127.0.0.1:55321";
const PASSWORD = "local-only-pass-1";

type Env = { API_URL: string; ANON_KEY: string; SERVICE_ROLE_KEY: string };

let cached: Env | null = null;
function stack(): Env {
  if (cached) return cached;
  const out = execSync("supabase status -o env", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  const env = Object.fromEntries(
    out
      .split("\n")
      .map((l) => l.match(/^([A-Z_]+)="?(.*?)"?$/))
      .filter((m): m is RegExpMatchArray => !!m)
      .map((m) => [m[1], m[2]]),
  ) as Env;
  if (env.API_URL !== LOCAL) throw new Error(`refusing: the scenarios run only on this worktree's stack (${LOCAL}), not ${env.API_URL}`);
  cached = env;
  return env;
}

/** A session cookie for a local user, created if missing. Crew seats carry the crew mark. */
export async function sessionCookie(email: string, opts: { crew?: boolean } = {}): Promise<string> {
  const env = stack();
  const admin = { apikey: env.SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SERVICE_ROLE_KEY}`, "Content-Type": "application/json" };
  await fetch(`${env.API_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: admin,
    body: JSON.stringify({ email, password: PASSWORD, email_confirm: true, ...(opts.crew ? { app_metadata: { sw_role: "crew" } } : {}) }),
  });
  const res = await fetch(`${env.API_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: env.ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const session = await res.json();
  if (!session.access_token) throw new Error(`local sign-in failed for ${email}`);
  return "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");
}

export async function signIn(context: BrowserContext, email: string, opts: { crew?: boolean } = {}) {
  const value = await sessionCookie(email, opts);
  await context.addCookies([{ name: "sb-127-auth-token", value, domain: "localhost", path: "/" }]);
  // The first-run tour is seen once per address.
  await context.addInitScript((e) => localStorage.setItem(`sw_onboarded:${e}`, "1"), email);
}

export const OWNER = "lando@saddlewoodcontracting.com";
export const PM = "eli.pm@example.com";

/** The page as an owner (Lando's local seat). */
export const test = base.extend<{ owner: Page }>({
  owner: async ({ context, page }, provide) => {
    await signIn(context, OWNER);
    await provide(page);
  },
});
export { expect } from "@playwright/test";

/** "$1,234.56" -> 123456 (cents); "–" -> null. */
export function cents(text: string | null | undefined): number | null {
  if (!text) return null;
  const m = text.replace(/[^0-9.\-]/g, "");
  if (!m) return null;
  return Math.round(Number(m) * 100);
}

/** "481.5 h" -> 481.5 */
export function hours(text: string | null | undefined): number | null {
  if (!text) return null;
  const m = text.replace(/[^0-9.]/g, "");
  return m ? Number(m) : null;
}
