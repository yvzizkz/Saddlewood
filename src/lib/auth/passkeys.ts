import { createHmac, createHash, randomBytes, timingSafeEqual } from "crypto";

import { createServerClient } from "@supabase/ssr";
import type { AuthenticatorTransportFuture } from "@simplewebauthn/server";
import { cookies } from "next/headers";
import type { User } from "@supabase/supabase-js";

import { hasCrewRole } from "@/lib/crew/role";
import { isAllowedEmail } from "@/lib/ops/allowlist";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { SITE_URL } from "@/lib/auth/magicLink";

// Face ID / fingerprint sign-in, done as real WebAuthn this time (the stub it
// replaces explains what the 2026-09 version got wrong). The pieces:
//
//   - the relying party is this site: rpID is the bare host, origin SITE_URL;
//   - a challenge is random, issued by the server, and carried back to it in
//     a signed, short-lived, httpOnly cookie, so a response can only answer
//     the challenge this server just made;
//   - enrollment stores the credential's public key in public.passkeys;
//   - sign-in verifies the signature against that key, checks the counter,
//     re-checks that the person still has access, and only then mints a
//     session, the same way the emailed link does (/auth/confirm).

export const RP_NAME = "Saddlewood";
export const RP_ID = new URL(SITE_URL).hostname;
export const ORIGIN = SITE_URL;

export const CHALLENGE_COOKIE = "sw_passkey_challenge";
const CHALLENGE_MINUTES = 5;

export type Challenge = {
  kind: "register" | "login";
  challenge: string;
  /** Who is enrolling (register only). */
  userId?: string;
  exp: number;
};

// The signing key is derived from the service-role key, which only the
// deployed server holds. Deriving (not using it directly) means a leak of a
// signed cookie tells nothing about the key itself.
function signingKey(): Buffer {
  const base = process.env.PASSKEY_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base) throw new Error("PASSKEY_SECRET or SUPABASE_SERVICE_ROLE_KEY is required");
  return createHash("sha256").update(`saddlewood-passkey:${base}`).digest();
}

function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}

export function signChallenge(c: Challenge): string {
  const body = b64url(Buffer.from(JSON.stringify(c)));
  const sig = b64url(createHmac("sha256", signingKey()).update(body).digest());
  return `${body}.${sig}`;
}

export function readChallenge(raw: string | undefined, kind: Challenge["kind"], now = Date.now()): Challenge | null {
  if (!raw) return null;
  const dot = raw.lastIndexOf(".");
  if (dot < 1) return null;
  const body = raw.slice(0, dot);
  const sig = Buffer.from(raw.slice(dot + 1), "base64url");
  const want = createHmac("sha256", signingKey()).update(body).digest();
  if (sig.length !== want.length || !timingSafeEqual(sig, want)) return null;
  let c: Challenge;
  try {
    c = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (c.kind !== kind || typeof c.challenge !== "string" || c.exp < now) return null;
  return c;
}

export function newChallenge(kind: Challenge["kind"], userId?: string): Challenge {
  return {
    kind,
    challenge: b64url(randomBytes(32)),
    ...(userId ? { userId } : {}),
    exp: Date.now() + CHALLENGE_MINUTES * 60_000,
  };
}

export const challengeCookie = {
  name: CHALLENGE_COOKIE,
  options: {
    httpOnly: true,
    secure: ORIGIN.startsWith("https://"),
    sameSite: "strict" as const,
    path: "/api/auth/passkey",
    maxAge: CHALLENGE_MINUTES * 60,
  },
};

// --- who may use a passkey ------------------------------------------------

/** Staff on the allowlist, or crew with a live seat. Same rule as the proxy. */
export function mayUseApp(user: Pick<User, "email" | "app_metadata"> | null | undefined): boolean {
  if (!user) return false;
  return isAllowedEmail(user.email) || hasCrewRole(user);
}

// --- storage ----------------------------------------------------------------

export type PasskeyRow = {
  id: string;
  user_id: string;
  email: string;
  credential_id: string;
  public_key: string;
  counter: number;
  transports: AuthenticatorTransportFuture[];
  device_label: string;
  created_at: string;
  last_used_at: string | null;
};

export async function passkeysForUser(userId: string): Promise<PasskeyRow[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("passkeys")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`passkeys: ${error.message}`);
  return (data ?? []) as PasskeyRow[];
}

export async function passkeyByCredential(credentialId: string): Promise<PasskeyRow | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("passkeys")
    .select("*")
    .eq("credential_id", credentialId)
    .maybeSingle();
  if (error) throw new Error(`passkeys: ${error.message}`);
  return (data as PasskeyRow | null) ?? null;
}

export async function savePasskey(row: Omit<PasskeyRow, "id" | "created_at" | "last_used_at">): Promise<PasskeyRow> {
  const { data, error } = await getSupabaseAdmin().from("passkeys").insert(row).select("*").single();
  if (error) throw new Error(`passkeys insert: ${error.message}`);
  return data as PasskeyRow;
}

export async function touchPasskey(id: string, counter: number): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from("passkeys")
    .update({ counter, last_used_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`passkeys update: ${error.message}`);
}

export async function deletePasskey(id: string, userId: string): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin()
    .from("passkeys")
    .delete()
    .eq("id", id)
    .eq("user_id", userId)
    .select("id");
  if (error) throw new Error(`passkeys delete: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

// --- session ----------------------------------------------------------------

// A verified passkey earns a session the way the emailed link does: the
// admin API mints a one-time token for the address and this server redeems
// it, which sets the session cookies on the response. (Supabase has no
// "create a session for this user" call; this is the supported route.) It
// also retires any emailed code still out for the address, which is fine:
// the person just signed in.
export async function mintSession(email: string): Promise<User> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error || !data?.properties?.hashed_token) {
    throw new Error(`generateLink failed: ${error?.message ?? "no token returned"}`);
  }
  const cookieStore = await cookies();
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
      },
    },
  });
  const verified = await supabase.auth.verifyOtp({ type: "magiclink", token_hash: data.properties.hashed_token });
  if (verified.error || !verified.data.user) {
    throw new Error(`verifyOtp failed: ${verified.error?.message ?? "no user"}`);
  }
  return verified.data.user;
}
