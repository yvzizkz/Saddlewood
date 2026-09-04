import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { buildSignInEmail } from "@/lib/auth/signInEmail";
import { generateSignInLink, sendEmail } from "@/lib/auth/magicLink";
import { authorizeOps } from "@/lib/ops/auth";
import { isAllowedEmail, normalizeEmail } from "@/lib/ops/allowlist";

// Mint a one-tap sign-in link for an allowlisted person, and optionally send
// it inside a written email. This is how a session or the bot puts the
// portal in front of Marco without him ever typing a code. Protected the
// same way as the board: portal session or OPS_AGENT_TOKEN.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  email: z.string().trim().email(),
  next: z.string().optional(),
  send: z.boolean().default(false),
  subject: z.string().trim().min(3).max(160).optional(),
  from: z.string().trim().max(160).optional(),
  replyTo: z.string().trim().email().optional(),
  message: z
    .object({
      eyebrow: z.string().trim().max(60).optional(),
      headline: z.string().trim().max(160).optional(),
      paragraphs: z.array(z.string().trim().max(1200)).max(12).optional(),
      buttonLabel: z.string().trim().max(60).optional(),
      afterButton: z.array(z.string().trim().max(600)).max(6).optional(),
      footer: z.string().trim().max(600).optional(),
    })
    .optional(),
});

export async function POST(request: NextRequest) {
  const who = await authorizeOps(request);
  if (!who) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues.map((i) => i.message).join("; ") },
      { status: 400 },
    );
  }
  const email = normalizeEmail(parsed.data.email);
  if (!isAllowedEmail(email)) {
    return NextResponse.json({ ok: false, error: "not on the allowlist" }, { status: 403 });
  }
  try {
    const signIn = await generateSignInLink(email, parsed.data.next);
    let sent: string | null = null;
    if (parsed.data.send) {
      const { html, text } = buildSignInEmail({
        link: signIn.link,
        code: signIn.code,
        ...(parsed.data.message ?? {}),
      });
      const res = await sendEmail({
        to: email,
        subject: parsed.data.subject ?? "Your Saddlewood sign-in link",
        html,
        text,
        from: parsed.data.from,
        replyTo: parsed.data.replyTo,
      });
      sent = res.id;
    }
    return NextResponse.json({
      ok: true,
      email,
      link: signIn.link,
      next: signIn.next,
      expiresInHours: 24,
      sent,
      by: who.actor,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
