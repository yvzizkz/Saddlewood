import { Resend } from "resend";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

// One-tap sign-in for the internal portal, without Supabase's mailer.
//
// Supabase's default sender is capped at two emails an hour and its template
// pointed at localhost, so the site now makes the link itself: the admin API
// mints a magic-link token for an allowlisted address, and we build a URL to
// our own /auth/confirm route, which verifies the token hash server-side and
// sets the session cookie. The same call also returns the eight-digit code,
// so the email carries both: tap the button, or type the code.
//
// The link works on any device (no PKCE verifier needed) and is single use.
// Its life is the project's mailer_otp_exp (24 hours as of 2026-09-04).

export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://saddlewoodcontracting.com";

export const DEFAULT_NEXT = "/internal/ops";

export const LINK_HOURS = 24;

export type SignInLink = { email: string; link: string; code: string; next: string };

export function safeNext(next: string | null | undefined): string {
  const n = (next ?? "").trim();
  // Only same-site paths; never an absolute URL someone could smuggle in.
  if (!n.startsWith("/") || n.startsWith("//")) return DEFAULT_NEXT;
  return n.slice(0, 200);
}

export async function generateSignInLink(email: string, next?: string): Promise<SignInLink> {
  const admin = getSupabaseAdmin();
  const n = safeNext(next);
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: `${SITE_URL}/auth/callback?next=${encodeURIComponent(n)}` },
  });
  if (error || !data?.properties?.hashed_token) {
    throw new Error(`generateLink failed: ${error?.message ?? "no token returned"}`);
  }
  const params = new URLSearchParams({
    token_hash: data.properties.hashed_token,
    type: "magiclink",
    next: n,
  });
  return {
    email,
    link: `${SITE_URL}/auth/confirm?${params.toString()}`,
    code: data.properties.email_otp ?? "",
    next: n,
  };
}

export type OutboundEmail = {
  to: string;
  subject: string;
  html: string;
  text: string;
  from?: string;
  replyTo?: string;
};

export async function sendEmail(msg: OutboundEmail): Promise<{ id: string | null }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is not set");
  const resend = new Resend(key);
  const from =
    msg.from ||
    process.env.PORTAL_FROM_ADDRESS ||
    "Saddlewood Portal <portal@saddlewoodcontracting.com>";
  const { data, error } = await resend.emails.send({
    from,
    to: [msg.to],
    subject: msg.subject,
    html: msg.html,
    text: msg.text,
    ...(msg.replyTo ? { replyTo: msg.replyTo } : {}),
  });
  if (error) throw new Error(`resend: ${error.message}`);
  return { id: data?.id ?? null };
}
