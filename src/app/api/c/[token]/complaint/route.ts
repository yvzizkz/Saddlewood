import { NextRequest, NextResponse } from "next/server";

import { portalByToken, PortalLimit, submitComplaint } from "@/lib/portal/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A complaint from the client's own link. No sign-in: the link is the key, and
// it only takes one while its owner has the Complaint form on.

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const live = await portalByToken((await params).token);
  if (!live?.portal.sections.includes("complaint")) return NextResponse.json({ ok: false, error: "This link doesn't take complaints." }, { status: 404 });
  const b = ((await request.json().catch(() => null)) ?? {}) as { name?: unknown; reach?: unknown; title?: unknown; detail?: unknown };
  const name = text(b.name, 120);
  const title = text(b.title, 200);
  if (!name || !title) return NextResponse.json({ ok: false, error: "Tell us your name and what's wrong." }, { status: 400 });
  try {
    const { replyBy } = await submitComplaint(live.ref, { name, reach: text(b.reach, 120), title, detail: text(b.detail, 2000) });
    return NextResponse.json({ ok: true, replyBy });
  } catch (err) {
    if (err instanceof PortalLimit) return NextResponse.json({ ok: false, error: "We've had several from this link today. Please email info@saddlewoodcontracting.com." }, { status: 429 });
    console.error("portal complaint:", err);
    return NextResponse.json({ ok: false, error: "That didn't go through. Please try again, or email info@saddlewoodcontracting.com." }, { status: 500 });
  }
}
