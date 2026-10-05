import { createHmac, timingSafeEqual } from "crypto";

import type { DocumentEventKind } from "./types";

// Delivery reports from the mail service (Resend), which signs each one the
// Svix way: three headers, and an HMAC over "<id>.<timestamp>.<body>" with a
// secret that starts "whsec_". Nothing is believed without a good signature:
// these reports become lines in the proof record.

/** How far a report's own timestamp may be from now. Stops an old one being replayed. */
export const TOLERANCE_SECONDS = 5 * 60;

export type SignedHeaders = { id: string | null; timestamp: string | null; signature: string | null };

export function verifyMailSignature(
  secret: string | undefined,
  headers: SignedHeaders,
  body: string,
  now: Date = new Date(),
): boolean {
  if (!secret || !headers.id || !headers.timestamp || !headers.signature) return false;
  const key = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  let keyBytes: Buffer;
  try {
    keyBytes = Buffer.from(key, "base64");
  } catch {
    return false;
  }
  if (keyBytes.length < 16) return false;

  const ts = Number(headers.timestamp);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(now.getTime() / 1000 - ts) > TOLERANCE_SECONDS) return false;

  const expected = createHmac("sha256", keyBytes)
    .update(`${headers.id}.${headers.timestamp}.${body}`)
    .digest();

  // The header may carry several signatures ("v1,<a> v1,<b>") while a secret is being rotated.
  for (const part of headers.signature.split(" ")) {
    const [version, value] = part.split(",");
    if (version !== "v1" || !value) continue;
    const given = Buffer.from(value, "base64");
    if (given.length === expected.length && timingSafeEqual(given, expected)) return true;
  }
  return false;
}

export type MailReport = { kind: DocumentEventKind; emailId: string; at: string; detail: Record<string, unknown> };

const KINDS = new Map<string, DocumentEventKind>([
  ["email.delivered", "delivered"],
  ["email.bounced", "bounced"],
  ["email.complained", "complained"],
]);

/**
 * The part of a report the proof record keeps, or null for the kinds it does
 * not (sent, delivery delayed, and the service's own open and click tracking,
 * which we do not rely on: a view is an opening of OUR link).
 */
export function readMailReport(payload: unknown): MailReport | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as { type?: unknown; created_at?: unknown; data?: unknown };
  const kind = typeof p.type === "string" ? KINDS.get(p.type) : undefined;
  const data = p.data && typeof p.data === "object" ? (p.data as Record<string, unknown>) : null;
  const emailId = data && typeof data.email_id === "string" ? data.email_id : "";
  if (!kind || !emailId) return null;
  const at = typeof p.created_at === "string" && !Number.isNaN(Date.parse(p.created_at)) ? p.created_at : new Date().toISOString();
  const detail: Record<string, unknown> = {};
  if (data && Array.isArray(data.to)) detail.to = data.to.filter((a) => typeof a === "string");
  if (data && data.bounce && typeof data.bounce === "object") {
    const b = data.bounce as Record<string, unknown>;
    detail.bounce = { type: b.type, subType: b.subType, message: typeof b.message === "string" ? b.message.slice(0, 300) : undefined };
  }
  return { kind, emailId, at, detail };
}
