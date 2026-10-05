import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

import { clientContactEmails, getDocument, recordEvent } from "@/lib/billing/documents";
import { BILLING_FROM, BILLING_REPLY_TO, buildMessage, checkRecipients, documentLink } from "@/lib/billing/send";
import { authorizeOps } from "@/lib/ops/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Mail an issued document to its client, from accounting@.
//
// Staff only. Two steps on purpose: without "confirm": true the answer is the
// exact message that would go out (from, to, subject, body) and nothing is
// sent. With it, the message goes and a "sent" line is written to the
// document's proof record, carrying the mail service's id so that delivery
// reports can find their document.

const SITE_URL = "https://saddlewoodcontracting.com";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const who = await authorizeOps(request);
  if (!who) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });

  let input: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    input = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  try {
    const doc = await getDocument(id);
    if (!doc) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
    if (doc.status !== "issued" || !doc.token) {
      return NextResponse.json({ ok: false, error: "only an issued document can be sent" }, { status: 409 });
    }

    const contacts = doc.clientId ? await clientContactEmails(doc.clientId) : [];
    const checked = checkRecipients(input.to, input.cc, contacts);
    if (!checked.ok) return NextResponse.json({ ok: false, error: checked.error }, { status: 400 });

    const link = documentLink(process.env.NEXT_PUBLIC_SITE_URL || SITE_URL, doc.token);
    const message = buildMessage(input.subject, input.body, link);
    if ("error" in message) return NextResponse.json({ ok: false, error: message.error }, { status: 400 });

    const preview = {
      from: BILLING_FROM,
      replyTo: BILLING_REPLY_TO,
      to: checked.recipients.to,
      cc: checked.recipients.cc,
      subject: message.subject,
      body: message.text,
      document: { number: doc.number, kind: doc.kind, link },
    };
    if (input.confirm !== true) return NextResponse.json({ ok: true, sent: false, preview });

    const key = process.env.RESEND_API_KEY;
    if (!key) return NextResponse.json({ ok: false, error: "mail service is not set up" }, { status: 503 });

    const { data, error } = await new Resend(key).emails.send({
      from: BILLING_FROM,
      replyTo: BILLING_REPLY_TO,
      to: checked.recipients.to,
      ...(checked.recipients.cc.length ? { cc: checked.recipients.cc } : {}),
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    if (error || !data?.id) {
      console.error("billing send:", error);
      return NextResponse.json({ ok: false, error: "the mail service refused the message; nothing was sent" }, { status: 502 });
    }

    // The message is gone. If the record cannot be written, say so plainly
    // instead of failing: a retry would mail the client twice.
    let recorded = true;
    try {
      await recordEvent({
        documentId: doc.id,
        kind: "sent",
        actor: who.actor,
        emailId: data.id,
        dedupe: `sent:${data.id}`,
        detail: { from: BILLING_REPLY_TO, to: checked.recipients.to, cc: checked.recipients.cc, subject: message.subject, via: "mail service" },
      });
    } catch (err) {
      recorded = false;
      console.error("billing send: sent but not recorded:", err);
    }
    return NextResponse.json({ ok: true, sent: true, emailId: data.id, recorded, preview });
  } catch (err) {
    console.error("billing send:", err);
    return NextResponse.json({ ok: false, error: "could not send" }, { status: 500 });
  }
}
