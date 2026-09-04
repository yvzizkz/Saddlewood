import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { isAllowedEmail } from "@/lib/ops/allowlist";
import { safeNext } from "@/lib/auth/magicLink";

// One-tap sign-in. The email link lands here with a token hash; we verify it
// server-side, which sets the session cookie, and send the person on. No
// PKCE verifier is needed, so the link works on any device, not only the one
// that asked for it. A used or expired link goes back to /login with a
// message and the email prefilled.

export const dynamic = "force-dynamic";

type EmailOtpType = "magiclink" | "email" | "signup" | "invite" | "recovery" | "email_change";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = (searchParams.get("type") || "magiclink") as EmailOtpType;
  const next = safeNext(searchParams.get("next"));

  if (!tokenHash) {
    return NextResponse.redirect(`${origin}/login?error=link_invalid`);
  }

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
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        },
      },
    },
  );

  const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error || !data.user) {
    console.error("[auth/confirm] verifyOtp failed:", error?.message);
    return NextResponse.redirect(`${origin}/login?error=link_expired`);
  }

  if (!isAllowedEmail(data.user.email)) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/login?error=unauthorized`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
