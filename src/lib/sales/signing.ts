import { createHash } from "crypto";
import { z } from "zod";

import type { DocumentEvent } from "@/lib/billing/types";
import { SIGNATURE_FONT_KEYS, type SignatureFont } from "./settings";

// Signatures on a proposal: the client's on their link, the company's in the
// app. Each one is a line in the document's proof record (document_events,
// kind "signed"), which cannot be changed or deleted, and carries what a
// signature needs to stand up later: who (name, email), how (drew it or typed
// it, and in which style), the picture of it, the exact words they agreed to,
// when, from where (IP, browser), and a SHA-256 of the frozen proposal they
// signed, so it is tied to that content and nothing else.
//
// The picture is a PNG made on the signer's screen (a drawn signature, or the
// typed name set in the chosen script font), so the record, the page and the
// PDF all show the same mark.

export type SignatureRole = "client" | "company";
export type SignMethod = "draw" | "type";

/** What a signer sends. */
export type SignatureInput = {
  name: string;
  email?: string;
  method: SignMethod;
  /** For a typed signature: the text and the style. */
  typed?: string;
  font?: SignatureFont;
  /** data:image/png;base64,... */
  image: string;
  /** They ticked the consent box. */
  agree: true;
};

/** What is kept (document_events.detail of a "signed" line). */
export type SignatureRecord = {
  role: SignatureRole;
  name: string;
  email: string;
  title: string;
  method: SignMethod;
  typed: string;
  font: string;
  image: string;
  consent: string;
  snapshotSha256: string;
  ip: string;
  ua: string;
  /** For the client: what they chose. */
  packageName?: string;
  totalCents?: number;
};

export type Signature = SignatureRecord & { at: string; eventId: number };

const MAX_IMAGE_BYTES = 150_000;
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export const signatureInputSchema = z.object({
  name: z
    .string()
    .trim()
    .transform((s) => s.replace(/\s+/g, " "))
    .pipe(z.string().min(3, "type your full name").max(120)),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(200)
    .refine((s) => s === "" || /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/.test(s), "that email address does not look right")
    .optional(),
  method: z.enum(["draw", "type"]),
  typed: z.string().trim().max(120).optional(),
  font: z.enum(SIGNATURE_FONT_KEYS as [SignatureFont, ...SignatureFont[]]).optional(),
  image: z.string().max(Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 40),
  agree: z.literal(true),
});

/** A PNG data URL that really is a PNG, under the size limit. */
export function checkSignatureImage(dataUrl: string): { ok: true } | { ok: false; error: string } {
  const m = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!m) return { ok: false, error: "the signature did not come through; sign again" };
  const bytes = Buffer.from(m[1], "base64");
  if (bytes.length < 100) return { ok: false, error: "the signature is empty; sign again" };
  if (bytes.length > MAX_IMAGE_BYTES) return { ok: false, error: "the signature picture is too large" };
  if (!PNG_MAGIC.every((b, i) => bytes[i] === b)) return { ok: false, error: "the signature did not come through; sign again" };
  return { ok: true };
}

export function readSignatureInput(raw: unknown): { ok: true; value: SignatureInput } | { ok: false; error: string } {
  const r = signatureInputSchema.safeParse(raw);
  if (!r.success) return { ok: false, error: r.error.issues[0]?.message ?? "the signature is not complete" };
  const v = r.data;
  if (v.method === "type" && (!v.typed || v.typed.length < 2)) return { ok: false, error: "type your signature" };
  if (v.method === "type" && !v.font) return { ok: false, error: "pick a signature style" };
  const img = checkSignatureImage(v.image);
  if (!img.ok) return img;
  return { ok: true, value: v as SignatureInput };
}

/** The fingerprint of the frozen proposal a signature is tied to. */
export function snapshotHash(snapshot: unknown): string {
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}

/** The signatures in a document's proof record, oldest first. */
export function signaturesOf(events: DocumentEvent[]): Signature[] {
  return events
    .filter((e) => e.kind === "signed")
    .sort((a, b) => a.at.localeCompare(b.at) || a.id - b.id)
    .map((e) => {
      const d = e.detail as Partial<SignatureRecord>;
      return {
        role: d.role === "company" ? "company" : "client",
        name: String(d.name ?? ""),
        email: String(d.email ?? ""),
        title: String(d.title ?? ""),
        method: d.method === "type" ? "type" : "draw",
        typed: String(d.typed ?? ""),
        font: String(d.font ?? ""),
        image: String(d.image ?? ""),
        consent: String(d.consent ?? ""),
        snapshotSha256: String(d.snapshotSha256 ?? ""),
        ip: String(d.ip ?? ""),
        ua: String(d.ua ?? ""),
        packageName: typeof d.packageName === "string" ? d.packageName : undefined,
        totalCents: typeof d.totalCents === "number" ? d.totalCents : undefined,
        at: e.at,
        eventId: e.id,
      } satisfies Signature;
    });
}

/** Is every signature the proposal asks for on it? */
export function isExecuted(mode: "none" | "client" | "both", sigs: Pick<Signature, "role">[]): boolean {
  if (mode === "none") return false;
  const client = sigs.some((s) => s.role === "client");
  if (mode === "client") return client;
  return client && sigs.some((s) => s.role === "company");
}

/** What the client's page and the PDF show of a signature: never the IP or the browser. */
export type PublicSignature = Pick<Signature, "role" | "name" | "title" | "method" | "image" | "at"> & { snapshotSha256: string };

export function publicSignature(s: Signature): PublicSignature {
  return { role: s.role, name: s.name, title: s.title, method: s.method, image: s.image, at: s.at, snapshotSha256: s.snapshotSha256 };
}
