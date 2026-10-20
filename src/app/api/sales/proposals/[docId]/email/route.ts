import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { isId } from "@/lib/billing/http";
import { salesError, salesGate } from "@/lib/sales/access";
import { prepareProposalMail, sendPrepared } from "@/lib/sales/mail";
import { proposalRecord } from "@/lib/sales/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Email an issued proposal from the app: the link, the PDF, or both. Without
// { confirm: true } it answers exactly what would leave (sender, recipients,
// words, attachments, and any address refused with the owner's command to
// allow it). Nothing is sent until the same request comes back confirmed.

const input = z.object({
  to: z.array(z.string().max(254)).min(1).max(10),
  cc: z.array(z.string().max(254)).max(10).default([]),
  subject: z.string().max(200),
  body: z.string().max(5000),
  link: z.boolean(),
  attachPdf: z.boolean(),
  confirm: z.boolean().optional(),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ docId: string }> }) {
  const gate = await salesGate(request, "send");
  if (gate.response) return gate.response;
  const { docId } = await params;
  if (!isId(docId)) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? "not valid" }, { status: 400 });
  const { confirm, ...mail } = parsed.data;
  try {
    const rec = await proposalRecord(docId);
    if (!rec) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
    const prepared = await prepareProposalMail(rec.doc, rec.proposal, rec.signatures, rec.events, mail, gate.settings);
    if (!prepared.ok) return NextResponse.json({ ok: false, error: prepared.error, refused: prepared.refused ?? [] }, { status: 400 });
    const m = prepared.client;
    if (!confirm) {
      return NextResponse.json({
        ok: true,
        preview: true,
        from: m.from,
        replyTo: m.replyTo,
        to: m.to,
        cc: m.cc,
        staffCopyTo: prepared.staffCopy?.to ?? [],
        subject: m.subject,
        text: m.text,
        attachments: m.attachments.map((a) => ({ filename: a.filename, bytes: a.content.length })),
        refused: prepared.refused,
      });
    }
    // Refused addresses are not quietly dropped from a confirmed send: the owner fixes the list first.
    if (prepared.refused.length) {
      return NextResponse.json({ ok: false, error: "some addresses cannot receive it; remove them or have an owner allow them first", refused: prepared.refused }, { status: 400 });
    }
    const emailId = await sendPrepared(rec.doc, prepared, gate.who.actor, mail, "proposal");
    return NextResponse.json({ ok: true, emailId, to: m.to, cc: m.cc });
  } catch (err) {
    return salesError(err, "email the proposal");
  }
}
