import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { isId } from "@/lib/billing/http";
import { salesError, salesGate } from "@/lib/sales/access";
import { addWatch, setWatchDone } from "@/lib/sales/awardStore";
import { getOpportunity } from "@/lib/sales/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The paperwork a won job owes (0027): an owner marks one done or open again,
// or adds a permit or anything else to watch.

const schema = z.union([
  z.object({ id: z.number().int().positive(), done: z.boolean() }),
  z.object({
    add: z.object({
      kind: z.enum(["permit", "custom"]),
      title: z.string().trim().min(2).max(200),
      dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    }),
  }),
]);

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await salesGate(request, "openJob");
  if (gate.response) return gate.response;
  const { id } = await params;
  if (!isId(id)) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  const body = schema.safeParse(await request.json().catch(() => ({})));
  if (!body.success) return NextResponse.json({ ok: false, error: "check the paperwork line" }, { status: 400 });
  try {
    const o = await getOpportunity(id);
    if (!o?.jobId) return NextResponse.json({ ok: false, error: "award the job first" }, { status: 409 });
    const watch = "add" in body.data ? await addWatch(o.jobId, body.data.add, gate.who.actor) : await setWatchDone(o.jobId, body.data.id, body.data.done, gate.who.actor);
    return NextResponse.json({ ok: true, watch });
  } catch (err) {
    return salesError(err, "update the paperwork");
  }
}
