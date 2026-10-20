import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { isId } from "@/lib/billing/http";
import { subsError, subsGate } from "@/lib/subs/access";
import { defaultWords, planSubMail, recipientsFor, sendSubMail } from "@/lib/subs/mail";
import { packageDetail, setPackageStatus } from "@/lib/subs/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Mail to the subs on a package: GET the words and who it would go to; POST
// with send: false for the preview, send: true to send what was previewed.
// Sending the invites puts a draft package out.

const kinds = z.enum(["invite", "addendum", "thanks"]);
const schema = z.object({
  kind: kinds,
  inviteIds: z.array(z.string().uuid()).max(50).optional(),
  subject: z.string().max(200),
  body: z.string().max(5000),
  send: z.boolean(),
});

export async function GET(request: NextRequest, { params }: { params: Promise<{ pid: string }> }) {
  const gate = await subsGate(request, "manage");
  if (gate.response) return gate.response;
  const { pid } = await params;
  const kind = kinds.safeParse(request.nextUrl.searchParams.get("kind"));
  if (!isId(pid) || !kind.success) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  try {
    const d = await packageDetail(pid);
    if (!d) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
    const ids = recipientsFor(kind.data, d.invites);
    return NextResponse.json({ ok: true, ...defaultWords(kind.data, d, gate.seat.name), inviteIds: ids, invites: d.invites.filter((i) => ids.includes(i.id)).map((i) => ({ id: i.id, sub: i.sub.name, to: i.contactEmail })) });
  } catch (err) {
    return subsError(err, "prepare the mail");
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ pid: string }> }) {
  const gate = await subsGate(request, "manage");
  if (gate.response) return gate.response;
  const { pid } = await params;
  if (!isId(pid)) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  const body = schema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ ok: false, error: "check the message" }, { status: 400 });
  const { kind, subject, body: words, send } = body.data;
  if (gate.seat.role === "agent") return NextResponse.json({ ok: false, error: "a person sends this" }, { status: 403 });
  try {
    const d = await packageDetail(pid);
    if (!d) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
    const allowed = new Set(recipientsFor(kind, d.invites));
    const ids = (body.data.inviteIds ?? [...allowed]).filter((id) => allowed.has(id));
    if (!ids.length) return NextResponse.json({ ok: false, error: kind === "invite" ? "everyone invited has been sent the link" : "nobody to send this to" }, { status: 409 });
    const { plan } = await planSubMail(pid, kind, ids, { subject, body: words });
    if (!send) {
      return NextResponse.json({
        ok: true,
        preview: { messages: plan.messages.map((m) => ({ inviteId: m.inviteId, sub: m.sub, to: m.to, unlisted: m.unlisted, subject: m.message.subject, text: m.message.text })), refused: plan.refused },
      });
    }
    if (!plan.messages.length) return NextResponse.json({ ok: false, error: "nobody it can go to", refused: plan.refused }, { status: 409 });
    if (kind === "invite" && d.pkg.status === "draft") await setPackageStatus(pid, "out", gate.who.actor);
    const r = await sendSubMail(pid, kind, plan, gate.who.actor);
    return NextResponse.json({ ok: r.sent.length > 0, ...r, refused: plan.refused }, { status: r.sent.length ? 200 : 502 });
  } catch (err) {
    return subsError(err, "send the mail");
  }
}
