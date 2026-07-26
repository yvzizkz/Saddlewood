import { NextRequest, NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "crypto";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type {
  IngestPayload,
  IngestSuccessResponse,
  IngestErrorResponse,
} from "@/types/estimate";

// Force Node runtime — the `crypto` import requires it, and the service-role
// client is server-only.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Json = Record<string, unknown>;

function unauthorized(): NextResponse<IngestErrorResponse> {
  return NextResponse.json(
    { success: false, error: "Unauthorized", code: "INVALID_TOKEN" },
    { status: 401 },
  );
}

function badRequest(error: string, code: string, status = 400): NextResponse<IngestErrorResponse> {
  return NextResponse.json({ success: false, error, code }, { status });
}

function validateBearerToken(request: NextRequest): boolean {
  const header = request.headers.get("authorization");
  if (!header || !header.startsWith("Bearer ")) return false;
  const token = header.slice(7).trim();
  const secret = process.env.PIPELINE_INGEST_SECRET;
  if (!secret) return false;

  const a = Buffer.from(token, "utf8");
  const b = Buffer.from(secret, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function validatePayload(body: unknown): body is IngestPayload {
  if (!body || typeof body !== "object") return false;
  const p = body as Json;

  if (!isNonEmptyString(p.pipeline_version)) return false;

  const job = p.job as Json | undefined;
  if (!job || typeof job !== "object") return false;
  if (!isNonEmptyString(job.name)) return false;
  if (!isNonEmptyString(job.client_name)) return false;

  const config = p.config as Json | undefined;
  if (!config || typeof config !== "object") return false;
  if (
    !isFiniteNumber(config.overhead_pct) ||
    !isFiniteNumber(config.profit_pct) ||
    !isFiniteNumber(config.contingency_pct) ||
    !isFiniteNumber(config.gc_sub_markup_pct)
  ) {
    return false;
  }

  if (!Array.isArray(p.trades)) return false;
  for (const t of p.trades) {
    if (!t || typeof t !== "object") return false;
    const trade = t as Json;
    if (!isNonEmptyString(trade.trade_name)) return false;
    if (!isNonEmptyString(trade.trade_status)) return false;
    if (!Array.isArray(trade.line_items)) return false;
    for (const li of trade.line_items) {
      if (!li || typeof li !== "object") return false;
      const item = li as Json;
      if (!isNonEmptyString(item.description)) return false;
      if (!isFiniteNumber(item.quantity)) return false;
      if (!isFiniteNumber(item.material_unit_cost)) return false;
      if (!isFiniteNumber(item.labor_unit_cost)) return false;
      if (!isNonEmptyString(item.unit)) return false;
      if (!isNonEmptyString(item.dimension_type)) return false;
      if (!isNonEmptyString(item.confidence)) return false;
    }
  }

  return true;
}

interface IngestRpcResult {
  estimateId: string;
  jobId: string;
  version: number;
  isRevision: boolean;
  previousEstimateId: string | null;
}

export async function POST(
  request: NextRequest,
): Promise<NextResponse<IngestSuccessResponse | IngestErrorResponse>> {
  if (!validateBearerToken(request)) return unauthorized();

  // After the auth check, so an unauthenticated caller learns nothing about
  // how this environment is configured.
  let supabaseAdmin: ReturnType<typeof getSupabaseAdmin>;
  try {
    supabaseAdmin = getSupabaseAdmin();
  } catch (e) {
    console.error("[ingest] admin client unavailable:", e);
    return badRequest(
      "Server is not configured for ingest",
      "CONFIG_ERROR",
      500,
    );
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return badRequest("Could not read request body", "BODY_READ_ERROR");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return badRequest("Invalid JSON body", "JSON_PARSE_ERROR");
  }

  if (!validatePayload(parsed)) {
    return badRequest(
      "Payload validation failed — missing or malformed required fields",
      "VALIDATION_ERROR",
      422,
    );
  }

  const payload = parsed;
  const bodyHash = createHash("sha256").update(rawBody, "utf8").digest("hex");

  // Idempotency: same payload bytes → return existing row, no new insert.
  const { data: existing, error: existingErr } = await supabaseAdmin
    .from("estimates")
    .select("id, job_id, version, parent_estimate_id")
    .eq("ingest_hash", bodyHash)
    .maybeSingle();

  if (existingErr) {
    console.error("[ingest] idempotency lookup failed:", existingErr);
    return badRequest("Idempotency check failed", "IDEMPOTENCY_LOOKUP_FAILED", 500);
  }

  if (existing) {
    return NextResponse.json(
      {
        success: true,
        estimateId: existing.id as string,
        jobId: existing.job_id as string,
        version: existing.version as number,
        isRevision: (existing.version as number) > 1,
        previousEstimateId: (existing.parent_estimate_id as string | null) ?? null,
      },
      { status: 200 },
    );
  }

  // Atomic ingest via Postgres function — handles versioning + revision archive.
  const { data, error } = await supabaseAdmin.rpc("ingest_estimate", {
    payload: { ...payload, ingest_hash: bodyHash },
  });

  if (error || !data) {
    console.error("[ingest] ingest_estimate RPC failed:", error);
    return badRequest(
      error?.message ?? "Ingest RPC returned no data",
      "INGEST_FAILED",
      500,
    );
  }

  const result = data as unknown as IngestRpcResult;

  return NextResponse.json(
    {
      success: true,
      estimateId: result.estimateId,
      jobId: result.jobId,
      version: result.version,
      isRevision: result.isRevision,
      previousEstimateId: result.previousEstimateId,
    },
    { status: 201 },
  );
}
