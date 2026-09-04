import { NextRequest, NextResponse } from "next/server";

import { buildSignInEmail } from "@/lib/auth/signInEmail";
import { generateSignInLink, safeNext, sendEmail } from "@/lib/auth/magicLink";
import { isAllowedEmail, normalizeEmail } from "@/lib/ops/allowlist";

// The login page calls this instead of Supabase's own mailer. Only
// allowlisted addresses can ever be emailed, so the worst an outsider can do
// is send Marco a sign-in link he did not ask for; the throttle below keeps
// even that to one a minute per address.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const THROTTLE_MS = 60_000;
const lastSent = new Map<string, number>();

export async function POST(request: NextRequest) {
  let body: { email?: unknown; next?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  const email = normalizeEmail(typeof body.email === "string" ? body.email : "");
  if (!email || !email.includes("@")) {
    return NextResponse.json({ ok: false, error: "email required" }, { status: 400 });
  }
  // Same answer for unknown and allowlisted addresses, so the endpoint does
  // not confirm who is on the list. The login page checks the list itself
  // for the friendly message; this is the real gate.
  if (!isAllowedEmail(email)) {
    return NextResponse.json({ ok: true });
  }
  const now = Date.now();
  const last = lastSent.get(email) ?? 0;
  if (now - last < THROTTLE_MS) {
    return NextResponse.json({ ok: true, throttled: true });
  }
  lastSent.set(email, now);

  try {
    const next = safeNext(typeof body.next === "string" ? body.next : undefined);
    const signIn = await generateSignInLink(email, next);
    const { html, text } = buildSignInEmail({ link: signIn.link, code: signIn.code });
    await sendEmail({ to: email, subject: "Your Saddlewood sign-in link", html, text });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[auth/send-link]", (e as Error).message);
    return NextResponse.json({ ok: false, error: "could not send" }, { status: 502 });
  }
}
