import { NextRequest, NextResponse } from "next/server";

import { buildSignInEmail } from "@/lib/auth/signInEmail";
import { generateSignInLink, LINK_HOURS, safeNext, sendEmail, SITE_URL } from "@/lib/auth/magicLink";
import { sendOtpMessage } from "@/lib/auth/sms";
import { getPerson } from "@/lib/crew/queries";
import { isAllowedIdentity, normalizeEmail } from "@/lib/ops/allowlist";

// The login page calls this instead of Supabase's own mailer. Only
// allowlisted addresses and phone numbers, and crew members an owner gave a
// seat in the app, can receive a sign-in code.
//
// The answer to a typed email is the same {"ok": true} whether the address
// has access, was throttled, or is unknown, so the page cannot be used to
// find out who works here. (A real address takes longer to answer, because
// an email is being sent. That is a weaker tell than a different body, and
// it is accepted.) A phone number is the one exception: the page needs to
// know which email its code belongs to, so that is echoed back.
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
  if (identity.allowed && identity.email) return sendToStaff(identity.email, identity.phone, body.next);

  // Not staff. A crew member signs in with the email their seat is under.
  if (raw.includes("@")) {
    const email = normalizeEmail(raw);
    const person = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? await getPerson(email).catch(() => null) : null;
    if (person?.active) return sendToCrew(email, person.lang);
  }

  // Unknown: the same answer as a known address, and nothing is sent.
  return NextResponse.json({ ok: true });
}

function throttled(email: string): boolean {
  const now = Date.now();
  if (now - (lastSent.get(email) ?? 0) < THROTTLE_MS) return true;
  lastSent.set(email, now);
  return false;
}

async function sendToStaff(email: string, phone: string | undefined, next: unknown) {
  const echo = phone ? { email, phone: `***-***-${phone.slice(-4)}` } : {};
  if (throttled(email)) return NextResponse.json({ ok: true, ...echo });
  try {
    const signIn = await generateSignInLink(email, safeNext(typeof next === "string" ? next : undefined));
    const { html, text } = buildSignInEmail({ link: signIn.link, code: signIn.code });
    await sendEmail({ to: email, subject: "Your Saddlewood sign-in code", html, text });
    if (phone) await sendOtpMessage(phone, signIn.code, signIn.link);
    return NextResponse.json({ ok: true, ...echo });
  } catch (e) {
    console.error("[auth/send-link]", (e as Error).message);
    return NextResponse.json({ ok: false, error: "could not send" }, { status: 502 });
  }
}

async function sendToCrew(email: string, lang: "en" | "es") {
  if (throttled(email)) return NextResponse.json({ ok: true });
  try {
    const signIn = await generateSignInLink(email, "/app");
    const es = lang === "es";
    const site = SITE_URL.replace(/^https?:\/\//, "");
    const { html, text } = buildSignInEmail({
      link: signIn.link,
      code: signIn.code,
      eyebrow: "Saddlewood",
      headline: es ? "Tu código para entrar" : "Your sign-in code",
      paragraphs: es
        ? ["Toca el botón para abrir la app de Saddlewood, o escribe el código de abajo en la pantalla donde lo pediste."]
        : ["Tap the button to open the Saddlewood app, or type the code below on the screen where you asked for it."],
      buttonLabel: es ? "Abrir la app" : "Open the app",
      codeLabel: es ? `O escribe este código en ${site}/login` : `Or enter this code at ${site}/login`,
      afterButton: es
        ? [`El código funciona una vez y vence en ${LINK_HOURS} horas.`]
        : [`The code works once and expires in ${LINK_HOURS} hours.`],
      footer: es
        ? "Recibes esto porque alguien pidió entrar a la app de Saddlewood con tu correo. Si no fuiste tú, ignóralo."
        : "You are receiving this because someone asked to sign in to the Saddlewood app with your address. If that was not you, ignore it.",
    });
    await sendEmail({ to: email, subject: es ? "Tu código de Saddlewood" : "Your Saddlewood sign-in code", html, text });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[auth/send-link] crew:", (e as Error).message);
    return NextResponse.json({ ok: false, error: "could not send" }, { status: 502 });
  }
}
