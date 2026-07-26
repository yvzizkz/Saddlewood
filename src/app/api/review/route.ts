import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { REVIEW_TOKEN } from "@/lib/reviewData";

// Records an owner decision from the approval queue. The record of truth is an
// email to info@ - the knowledge base ingests that mailbox, so every decision
// becomes a permanent, queryable record with no extra database.
//
// Files ride the same rail. A photo attached to a decision arrives as an email
// attachment on the decision email, which means it inherits the archive, the
// retention, and the retrieval path that already exist. No bucket, no second
// place a decision can live, nothing to keep in sync.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Upload = { name?: string; type?: string; b64?: string };

const MAX_FILES = 4;
// Decoded ceiling. Base64 inflates ~33%, so 3 MB decoded is ~4 MB on the wire
// and the whole request still clears Vercel's 4.5 MB body limit. Raising this
// does not fail politely -- the platform drops the request before the route
// ever runs, so the owner sees a generic network error.
const MAX_TOTAL_BYTES = 3_000_000;
const MAX_B64_CHARS = 4_400_000; // cheap pre-check before we decode anything
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "application/pdf",
  "text/plain",
]);

function cleanName(n: string | undefined, i: number) {
  const base = (n || `attachment-${i + 1}`).split(/[\\/]/).pop() || "attachment";
  return base.replace(/[^A-Za-z0-9._ -]/g, "_").slice(0, 80);
}

/** -> {files} on success, {error} on refusal. Never throws. */
function collectAttachments(raw: unknown) {
  if (!Array.isArray(raw) || raw.length === 0) return { files: [] as const };
  if (raw.length > MAX_FILES) return { error: "too_many" as const };

  const chars = (raw as Upload[]).reduce((n, f) => n + (f?.b64?.length || 0), 0);
  if (chars > MAX_B64_CHARS) return { error: "too_large" as const };

  const files: { filename: string; content: Buffer; contentType: string }[] = [];
  let total = 0;
  for (const [i, f] of (raw as Upload[]).entries()) {
    if (!f || typeof f.b64 !== "string" || !f.b64) {
      return { error: "bad_file" as const };
    }
    const type = (f.type || "").toLowerCase().split(";")[0].trim();
    // Allowlist, not denylist: the browser sets this string and an unknown
    // type is a reason to stop, not a reason to guess.
    if (!ALLOWED_TYPES.has(type)) return { error: "bad_type" as const };
    let content: Buffer;
    try {
      content = Buffer.from(f.b64, "base64");
    } catch {
      return { error: "bad_file" as const };
    }
    if (content.length === 0) return { error: "bad_file" as const };
    total += content.length;
    if (total > MAX_TOTAL_BYTES) return { error: "too_large" as const };
    files.push({ filename: cleanName(f.name, i), content, contentType: type });
  }
  return { files };
}

export async function POST(req: NextRequest) {
  let body: {
    k?: string;
    batch?: string;
    item?: string;
    itemTitle?: string;
    decision?: string;
    comment?: string;
    files?: unknown;
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

  const att = collectAttachments(body.files);
  if ("error" in att && att.error) {
    // 413 for size so the client can say something specific; the owner needs
    // to know his photo did NOT go, not just that "something failed".
    const status = att.error === "too_large" || att.error === "too_many" ? 413 : 400;
    return NextResponse.json({ ok: false, error: att.error }, { status });
  }
  const files = att.files as { filename: string; content: Buffer; contentType: string }[];

  const key = process.env.RESEND_API_KEY;
  if (!key) return NextResponse.json({ ok: false }, { status: 500 });
  const resend = new Resend(key);
  const from =
    process.env.RESEND_FROM_ADDRESS || "notifications@saddlewoodcontracting.com";

  const safe = (s: string) =>
    s.replace(/</g, "&lt;").replace(/>/g, "&gt;").slice(0, 2000);

  const subject = `OWNER DECISION [${body.batch}/${body.item}]: ${body.decision}`;
  // The KB indexes mail text, not attachment bytes, so the filenames have to
  // appear in the body or a search for them finds nothing.
  const attachLine = files.length
    ? `<p>Attached: ${files.map((f) => safe(f.filename)).join(", ")}</p>`
    : "";
  const html = `
    <div style="font-family:Helvetica,Arial,sans-serif;font-size:14px;color:#2c2926;">
      <p><b>${safe(body.itemTitle || body.item)}</b></p>
      <p>Decision: <b>${safe(body.decision)}</b></p>
      ${body.comment ? `<p>Note: ${safe(body.comment)}</p>` : ""}
      ${attachLine}
      <p style="color:#5A5A5A;font-size:12px;">Recorded from the approval queue
      (batch ${safe(body.batch)}) at ${new Date().toISOString()}.</p>
    </div>`;

  const { error } = await resend.emails.send({
    from: `Saddlewood Approvals <${from}>`,
    to: ["info@saddlewoodcontracting.com"],
    subject,
    html,
    ...(files.length ? { attachments: files } : {}),
  });
  if (error) return NextResponse.json({ ok: false }, { status: 502 });
  return NextResponse.json({ ok: true });
}
