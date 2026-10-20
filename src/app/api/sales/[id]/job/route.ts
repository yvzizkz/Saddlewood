import { NextRequest, NextResponse } from "next/server";

import { isId } from "@/lib/billing/http";
import { salesError, salesGate } from "@/lib/sales/access";
import { openJob } from "@/lib/sales/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Won: open the job (public.jobs) it becomes, linked both ways. Owners.

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await salesGate(request, "openJob");
  if (gate.response) return gate.response;
  const { id } = await params;
  if (!isId(id)) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  try {
    const job = await openJob(id, gate.who.actor);
    return NextResponse.json({ ok: true, ...job });
  } catch (err) {
    return salesError(err, "open the job");
  }
}
