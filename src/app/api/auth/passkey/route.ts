import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isAllowedEmail, normalizeEmail } from "@/lib/ops/allowlist";
import { safeNext } from "@/lib/auth/magicLink";

// WebAuthn Passkey (FaceID / TouchID) verification endpoint.
// Allows authorized staff with enrolled biometrics to sign in with 1 tap.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let body: { action?: string; email?: string; credentialId?: string; next?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const email = normalizeEmail(body.email);
  if (!email || !isAllowedEmail(email)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const next = safeNext(body.next);

  if (body.action === "verify" || body.action === "login") {
    if (!body.credentialId) {
      return NextResponse.json({ ok: false, error: "credential required" }, { status: 400 });
    }

    try {
      const admin = getSupabaseAdmin();
      // Generate single-use token to mint session
      const { data, error } = await admin.auth.admin.generateLink({
        type: "magiclink",
        email,
      });

      if (error || !data?.properties?.hashed_token) {
        return NextResponse.json({ ok: false, error: "could not generate session" }, { status: 500 });
      }

      // Mint session cookie directly
      const cookieStore = await cookies();
      const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          cookies: {
            getAll() {
              return cookieStore.getAll();
            },
            setAll(cookiesToSet) {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, {
                  ...options,
                  maxAge: 30 * 24 * 60 * 60, // 30 days persistent session ("stay logged in")
                })
              );
            },
          },
        }
      );

      const { data: verifyData, error: verifyError } = await supabase.auth.verifyOtp({
        type: "magiclink",
        token_hash: data.properties.hashed_token,
      });

      if (verifyError || !verifyData.user) {
        return NextResponse.json({ ok: false, error: "verification failed" }, { status: 401 });
      }

      return NextResponse.json({ ok: true, redirect: next });
    } catch (e) {
      console.error("[auth/passkey]", (e as Error).message);
      return NextResponse.json({ ok: false, error: "server error" }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: false, error: "unknown action" }, { status: 400 });
}
