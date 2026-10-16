import { NextRequest, NextResponse } from "next/server";

import { documentsInGroup } from "@/lib/billing/documents";
import { answerError, notFound, present } from "@/lib/billing/http";
import { getSendGroup } from "@/lib/billing/sendGroups";
import { authorizeOps } from "@/lib/ops/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A send group and its documents, in the order their buttons go. Staff look.

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const who = await authorizeOps(request);
  if (!who) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  try {
    const group = await getSendGroup(id);
    if (!group) return notFound();
    const docs = await documentsInGroup(group.id);
    return NextResponse.json({ ok: true, group, documents: docs.map(present) });
  } catch (err) {
    return answerError(err, "get send group", "could not load");
  }
}
