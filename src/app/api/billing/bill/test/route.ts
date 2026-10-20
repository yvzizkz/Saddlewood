import { NextRequest, NextResponse } from "next/server";

import { deliver, exhibitAttachments } from "@/lib/billing/deliver";
import { documentsInGroup } from "@/lib/billing/documents";
import { bad, notFound, readBody, siteUrl } from "@/lib/billing/http";
import { INTERNAL_DOMAIN, previewLink, RECORDS_COPY } from "@/lib/billing/send";
import { getSendGroup } from "@/lib/billing/sendGroups";
import { requireOwner } from "@/lib/crew/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// "Send me a test": the group's message exactly as the client would get it,
// to the owner who asked and to the office copy, with buttons to the preview
// pages (not the client links: nothing is issued) and the same attachments.
// A plain note from accounting@ to our own people only; the client's contacts
// and the owner's allowlist are not consulted because no outside address is
// on it. An owner whose seat is not a company address gets it at info@.

export async function POST(request: NextRequest) {
  const owner = await requireOwner(request);
  if (!owner) return NextResponse.json({ ok: false, error: "billing is for the owners" }, { status: 403 });
  const body = await readBody(request);
  if (!body || typeof body.groupId !== "string") return bad("groupId is required");
  try {
    const group = await getSendGroup(body.groupId);
    if (!group) return notFound();
    const docs = await documentsInGroup(group.id);
    if (!docs.length) return bad("this group has no documents", 409);
    const m = group.message;
    if (!m.subject || !m.body) return bad("the message has no subject or body yet; Prepare fills it", 409);

    const to = owner.email.endsWith(INTERNAL_DOMAIN) && owner.email !== RECORDS_COPY ? [owner.email, RECORDS_COPY] : [RECORDS_COPY];
    const site = siteUrl();
    // Buttons to the preview pages. A message may only carry https links, so a
    // local dev site (http) sends the test without them.
    const links = site.startsWith("https://")
      ? docs.filter((d) => d.status === "draft" && d.previewToken).map((d) => ({ label: `Preview ${d.number}`, url: previewLink(site, d.previewToken!) }))
      : [];
    const files = await exhibitAttachments(docs);
    if (!files.ok) return bad(files.error);
    const head =
      "TEST, not sent to the client. This is the message as it stands; the buttons open the preview pages, which nobody outside can see.\n" +
      `It would go To: ${(m.to ?? []).join(", ") || "(nobody yet)"}` +
      ((m.cc ?? []).length ? `\nCc: ${m.cc!.join(", ")}` : "") +
      "\n\n";
    const text = m.body.replace("{link}\n{links}", "{links}").replace("{link}", "").trim();
    const result = await deliver(owner.email, null, {
      to,
      subject: `[TEST] ${m.subject}`,
      body: head + text,
      links,
      attachments: files.files.map((f) => ({ filename: f.filename, content: f.content.toString("base64") })),
      confirm: true,
    });
    if (result.status !== 200 || result.body.sent !== true) return NextResponse.json(result.body, { status: result.status === 200 ? 502 : result.status });
    return NextResponse.json({ ok: true, sent: true, to, emailId: result.body.emailId ?? null });
  } catch (err) {
    console.error("bill test send:", err);
    return NextResponse.json({ ok: false, error: "could not send the test" }, { status: 500 });
  }
}
