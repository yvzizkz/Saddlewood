import { NextRequest, NextResponse } from "next/server";

import { getDocument } from "@/lib/billing/documents";
import { addFileExhibit, addLinkExhibit, listExhibits, removeExhibit } from "@/lib/billing/exhibits";
import { checkAttachments, checkLinks } from "@/lib/billing/send";
import type { BillingDocument } from "@/lib/billing/types";
import { authorizeOps, type OpsActor } from "@/lib/ops/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Staff: put an original invoice link or a waiver file on a document's page,
// or take one down with a reason. The same checks as billing mail: links go to
// approved sites only; files are PDF, PNG, JPG or XLSX.

type Ctx = { params: Promise<{ id: string }> };

type Opened = { error: NextResponse } | { who: OpsActor; doc: BillingDocument };

async function open(request: NextRequest, ctx: Ctx): Promise<Opened> {
  const who = await authorizeOps(request);
  if (!who) return { error: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }) };
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: NextResponse.json({ ok: false, error: "not found" }, { status: 404 }) };
  const doc = await getDocument(id);
  if (!doc) return { error: NextResponse.json({ ok: false, error: "not found" }, { status: 404 }) };
  return { who, doc };
}

export async function GET(request: NextRequest, ctx: Ctx): Promise<NextResponse> {
  try {
    const got = await open(request, ctx);
    if ("error" in got) return got.error;
    return NextResponse.json({ ok: true, exhibits: await listExhibits(got.doc.id) });
  } catch (err) {
    console.error("exhibits:", err);
    return NextResponse.json({ ok: false, error: "could not list" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, ctx: Ctx): Promise<NextResponse> {
  try {
    const got = await open(request, ctx);
    if ("error" in got) return got.error;
    const { who, doc } = got;

    let input: Record<string, unknown>;
    try {
      const parsed = await request.json();
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
      input = parsed as Record<string, unknown>;
    } catch {
      return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
    }
    const bad = (error: string) => NextResponse.json({ ok: false, error }, { status: 400 });

    if (typeof input.remove === "string") {
      const reason = typeof input.reason === "string" ? input.reason.trim() : "";
      if (!reason) return bad("taking an exhibit down needs a reason");
      const done = await removeExhibit(input.remove, doc.id, reason);
      return done ? NextResponse.json({ ok: true, removed: input.remove }) : NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
    }

    if (doc.status === "void") return NextResponse.json({ ok: false, error: "this document was voided" }, { status: 409 });

    const lines = doc.snapshot.lines?.length ?? 0;
    let lineIndex: number | null = null;
    if (input.lineIndex !== undefined && input.lineIndex !== null) {
      if (!Number.isInteger(input.lineIndex) || (input.lineIndex as number) < 0 || (input.lineIndex as number) >= lines) {
        return bad(`lineIndex must be a line of this document (0 to ${Math.max(lines - 1, 0)})`);
      }
      lineIndex = input.lineIndex as number;
    }

    const hasUrl = typeof input.url === "string";
    const hasFile = input.file !== undefined && input.file !== null;
    if (hasUrl === hasFile) return bad("give either a url or a file");

    if (hasUrl) {
      const links = checkLinks([{ label: input.label, url: input.url }]);
      if (!links.ok) return bad(links.error);
      const exhibit = await addLinkExhibit({ documentId: doc.id, lineIndex, label: links.links[0].label, url: links.links[0].url, addedBy: who.actor });
      return NextResponse.json({ ok: true, exhibit });
    }

    const label = typeof input.label === "string" ? input.label.replace(/\s+/g, " ").trim() : "";
    if (!label || label.length > 60) return bad("a label of 60 characters or fewer is required");
    const files = checkAttachments([input.file]);
    if (!files.ok) return bad(files.error);
    const f = files.files[0];
    const exhibit = await addFileExhibit({ documentId: doc.id, lineIndex, label, filename: f.filename, content: f.content, contentType: f.contentType, addedBy: who.actor });
    return NextResponse.json({ ok: true, exhibit });
  } catch (err) {
    console.error("exhibits:", err);
    return NextResponse.json({ ok: false, error: "could not save" }, { status: 500 });
  }
}
