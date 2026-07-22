import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { REVIEW_TOKEN } from "@/lib/reviewData";

// Records an owner decision from the approval queue. The record of truth is an
// email to info@ - the knowledge base ingests that mailbox, so every decision
// becomes a permanent, queryable record with no extra database.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: {
    k?: string;
    batch?: string;
    item?: string;
    itemTitle?: string;
    decision?: string;
    comment?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (!body.k || body.k !== REVIEW_TOKEN) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  if (!body.batch || !body.item || !body.decision) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const key = process.env.RESEND_API_KEY;
  if (!key) return NextResponse.json({ ok: false }, { status: 500 });
  const resend = new Resend(key);
  const from =
    process.env.RESEND_FROM_ADDRESS || "notifications@saddlewoodcontracting.com";

  const safe = (s: string) =>
    s.replace(/</g, "&lt;").replace(/>/g, "&gt;").slice(0, 2000);

  const subject = `OWNER DECISION [${body.batch}/${body.item}]: ${body.decision}`;
  const html = `
    <div style="font-family:Helvetica,Arial,sans-serif;font-size:14px;color:#2c2926;">
      <p><b>${safe(body.itemTitle || body.item)}</b></p>
      <p>Decision: <b>${safe(body.decision)}</b></p>
      ${body.comment ? `<p>Note: ${safe(body.comment)}</p>` : ""}
      <p style="color:#5A5A5A;font-size:12px;">Recorded from the approval queue
      (batch ${safe(body.batch)}) at ${new Date().toISOString()}.</p>
    </div>`;

  const { error } = await resend.emails.send({
    from: `Saddlewood Approvals <${from}>`,
    to: ["info@saddlewoodcontracting.com"],
    subject,
    html,
  });
  if (error) return NextResponse.json({ ok: false }, { status: 502 });
  return NextResponse.json({ ok: true });
}
