import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { buildSignInEmail } from "@/lib/auth/signInEmail";
import { cancelScheduledEmail, generateSignInLink, sendEmail } from "@/lib/auth/magicLink";
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
  scheduledAt: z
    .string()
    .datetime({ offset: true })
    .refine((v) => {
      const t = Date.parse(v);
      return t > Date.now() && t < Date.now() + 72 * 3600 * 1000;
    }, "scheduledAt must be in the future and within 72 hours")
    .optional(),
  // Up to three files, base64 content, 4.5 MB of base64 each. Not combinable
  // with scheduledAt (Resend holds scheduled sends without attachments).
  attachments: z
    .array(
      z.object({
        filename: z
          .string()
          .trim()
          .min(1)
          .max(120)
          .regex(/^[A-Za-z0-9 ._()-]+$/, "filename may only use letters, digits, space, . _ ( ) -"),
        content: z.string().min(1).max(4_500_000),
        contentType: z.string().trim().max(100).optional(),
      }),
    )
    .max(3)
    .optional(),
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
})
  .refine((v) => !(v.scheduledAt && v.attachments?.length), {
    message: "attachments cannot be combined with scheduledAt",
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
        scheduledAt: parsed.data.scheduledAt,
        attachments: parsed.data.attachments,
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
      scheduledAt: parsed.data.send ? (parsed.data.scheduledAt ?? null) : null,
      attachments: parsed.data.send ? (parsed.data.attachments?.length ?? 0) : 0,
      by: who.actor,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

// Cancel a scheduled send that has not gone out yet: DELETE ?id=<resend id>.
export async function DELETE(request: NextRequest) {
  const who = await authorizeOps(request);
  if (!who) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const id = (new URL(request.url).searchParams.get("id") || "").trim();
  if (!/^[A-Za-z0-9-]{8,64}$/.test(id)) {
    return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
  }
  try {
    await cancelScheduledEmail(id);
    return NextResponse.json({ ok: true, cancelled: id, by: who.actor });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 502 });
  }
}
