import { NextRequest, NextResponse } from "next/server";

import { buildSignInEmail } from "@/lib/auth/signInEmail";
import { generateSignInLink, safeNext, sendEmail } from "@/lib/auth/magicLink";
import { sendOtpMessage } from "@/lib/auth/sms";
import { isAllowedIdentity } from "@/lib/ops/allowlist";

// The login page calls this instead of Supabase's own mailer. Only
// allowlisted addresses and phone numbers can receive sign-in links.
// Throttled to 1 request per 30 seconds per identity.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const THROTTLE_MS = 30_000;
const lastSent = new Map<string, number>();

export async function POST(request: NextRequest) {
  let body: { email?: unknown; phone?: unknown; identifier?: unknown; next?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const raw = String(body.identifier || body.email || body.phone || "").trim();
  if (!raw) {
    return NextResponse.json({ ok: false, error: "identifier required" }, { status: 400 });
  }

  const identity = isAllowedIdentity(raw);
  if (!identity.allowed || !identity.email) {
    // Return ok: true so unknown inputs cannot probe the allowlist
    return NextResponse.json({ ok: true });
  }

  const email = identity.email;
  const now = Date.now();
  const last = lastSent.get(email) ?? 0;
  if (now - last < THROTTLE_MS) {
    return NextResponse.json({ ok: true, throttled: true, email });
  }
  lastSent.set(email, now);

  try {
    const next = safeNext(typeof body.next === "string" ? body.next : undefined);
    const signIn = await generateSignInLink(email, next);
    const { html, text } = buildSignInEmail({ link: signIn.link, code: signIn.code });

    // Send email (always)
    await sendEmail({ to: email, subject: "Your Saddlewood sign-in code", html, text });

    // Send iMessage/SMS if phone is available
    let smsSent = false;
    if (identity.phone) {
      const smsRes = await sendOtpMessage(identity.phone, signIn.code, signIn.link);
      smsSent = smsRes.sent;
    }

    return NextResponse.json({
      ok: true,
      email,
      phone: identity.phone ? `***-***-${identity.phone.slice(-4)}` : undefined,
      smsSent,
    });
  } catch (e) {
    console.error("[auth/send-link]", (e as Error).message);
    return NextResponse.json({ ok: false, error: "could not send" }, { status: 502 });
  }
}
