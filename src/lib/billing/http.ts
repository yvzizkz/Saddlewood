import { NextResponse, type NextRequest } from "next/server";

import { DocumentError } from "./documents";
import { documentLink, previewLink } from "./send";
import type { BillingDocument } from "./types";

// What the billing routes share: reading a JSON body, answering a refusal in
// the caller's words, and how a document is shown to our own people (with
// its preview link while it is a draft, its client link once issued).

const SITE_URL = "https://saddlewoodcontracting.com";

export function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL || SITE_URL;
}

export const notFound = () => NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
export const bad = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status });

export function isId(id: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(id);
}

/** The body as an object, or null when it is not one. */
export async function readBody(request: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** A refusal from the documents layer goes back as it is; anything else is logged and answered plainly. */
export function answerError(err: unknown, what: string, fallback: string): NextResponse {
  if (err instanceof DocumentError) return bad(err.message, err.status);
  console.error(`${what}:`, err);
  return NextResponse.json({ ok: false, error: fallback }, { status: 500 });
}

/** A document as staff see it: its links spelled out. */
export function present(doc: BillingDocument) {
  const site = siteUrl();
  const issued = doc.status !== "draft" && doc.token;
  return {
    ...doc,
    link: issued ? documentLink(site, doc.token!) : null,
    previewLink: doc.status === "draft" && doc.previewToken ? previewLink(site, doc.previewToken) : null,
  };
}
