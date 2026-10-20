import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { isId } from "@/lib/billing/http";
import { salesError, salesGate } from "@/lib/sales/access";
import type { AwardChoices } from "@/lib/sales/award";
import { awardJob, awardPreview } from "@/lib/sales/awardStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Award (KB docs/JOB-LIFECYCLE-PLAN-2026-10-19.md §6): GET shows what it will
// build, with the owner's choices applied; POST builds it. Owners.

const choicesSchema = z
  .object({
    jobName: z.string().trim().max(120),
    packageId: z.string().max(64),
    contractCents: z.number().int().min(1).max(100_000_000_00).nullable(),
    prefix: z.string().trim().max(12).regex(/^[A-Za-z0-9]*$/, "the number prefix is letters and digits only"),
    template: z.enum(["framing", "drywall", "both", "none"]),
    pmEmail: z.union([z.literal(""), z.string().trim().toLowerCase().email().max(200)]),
    deposit: z.boolean(),
  })
  .partial();

function fromQuery(q: URLSearchParams): Partial<AwardChoices> {
  const raw: Record<string, unknown> = {};
  for (const k of ["jobName", "packageId", "prefix", "template", "pmEmail"]) if (q.has(k)) raw[k] = q.get(k);
  if (q.has("deposit")) raw.deposit = q.get("deposit") === "1";
  if (q.has("contractCents")) raw.contractCents = q.get("contractCents") ? Number(q.get("contractCents")) : null;
  const r = choicesSchema.safeParse(raw);
  return r.success ? r.data : {};
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await salesGate(request, "openJob");
  if (gate.response) return gate.response;
  const { id } = await params;
  if (!isId(id)) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  try {
    return NextResponse.json({ ok: true, ...(await awardPreview(id, fromQuery(request.nextUrl.searchParams))) });
  } catch (err) {
    return salesError(err, "plan the award");
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await salesGate(request, "openJob");
  if (gate.response) return gate.response;
  const { id } = await params;
  if (!isId(id)) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  const body = choicesSchema.safeParse(await request.json().catch(() => ({})));
  if (!body.success) return NextResponse.json({ ok: false, error: body.error.issues[0]?.message ?? "check the award" }, { status: 400 });
  try {
    const r = await awardJob(id, body.data, gate.who.actor);
    return NextResponse.json({ ok: true, ...r });
  } catch (err) {
    return salesError(err, "award the job");
  }
}
