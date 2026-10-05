import { NextRequest, NextResponse } from "next/server";

import { documentForEmail, recordEvent } from "@/lib/billing/documents";
import { readMailReport, verifyMailSignature } from "@/lib/billing/mailEvents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Where the mail service reports what became of a message we sent: delivered,
// bounced, marked as spam. Each report becomes a line in that document's
// proof record.
//
// The caller is the mail service, which cannot sign in. It signs every report
// with RESEND_WEBHOOK_SECRET instead, and a report without a good signature is
// refused. While that variable is not set, everything is refused.

export async function POST(request: NextRequest) {
  const body = await request.text();
  const ok = verifyMailSignature(
    process.env.RESEND_WEBHOOK_SECRET,
    {
      id: request.headers.get("svix-id"),
      timestamp: request.headers.get("svix-timestamp"),
      signature: request.headers.get("svix-signature"),
    },
    body,
  );
  if (!ok) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  // Reports we do not keep, and reports about mail that is not a document
  // (sign-in codes, alerts), are acknowledged so the service stops resending.
  const report = readMailReport(payload);
  if (!report) return NextResponse.json({ ok: true, kept: false });

  try {
    const documentId = await documentForEmail(report.emailId);
    if (!documentId) return NextResponse.json({ ok: true, kept: false });
    await recordEvent({
      documentId,
      kind: report.kind,
      at: report.at,
      actor: "mail service",
      emailId: report.emailId,
      dedupe: `mail:${request.headers.get("svix-id")}`,
      detail: report.detail,
    });
    return NextResponse.json({ ok: true, kept: true });
  } catch (err) {
    // A failure here must be retried by the service, not swallowed.
    console.error("mail-events:", err);
    return NextResponse.json({ ok: false, error: "could not record" }, { status: 500 });
  }
}
