---
name: Phase 2 — Data Pipeline (Pipeline → Portal)
status: READY TO EXECUTE
created: 2026-05-13
depends_on: Phase 1 complete (login + DB schema live)
originSessionId: 271de9ef-5bd1-4b51-809e-80b684f6ab3a
---
# Phase 2 — Pipeline → Portal Data Pipeline

## 1. Phase Goal

Connect the local AI estimating pipeline (running on the estimator's Mac via Claude Code) to the Vercel portal so that a completed estimate is automatically ingested into Supabase the moment the pipeline finishes. After Phase 2, running `/estimate full [path]` on the Mac results in a new, fully-populated estimate visible in Marco's portal without any manual file transfer.

---

## 2. Success Criteria

- [ ] `POST /api/estimates/ingest` exists and responds 201 on valid payload
- [ ] Bearer token validation rejects requests without `PIPELINE_INGEST_SECRET`
- [ ] SHA-256 idempotency check returns 200 with existing estimateId on duplicate POST (no duplicate rows in DB)
- [ ] A new `jobs` row is created (or an existing one is upserted) correctly
- [ ] A new `estimates` row is created with `is_ai_baseline = true` and `version = 1`
- [ ] `estimate_trades` rows are created in correct `sort_order`
- [ ] `estimate_line_items` rows are created with `ai_baseline_snapshot` JSONB frozen correctly
- [ ] Partial failure mid-insert triggers full rollback (no orphaned rows)
- [ ] `estimate-payload.json` is emitted correctly by the rollup prompt
- [ ] The curl call in the pipeline sends the payload and reports success/failure without blocking Gate 3
- [ ] Manual curl test with sample payload passes end-to-end
- [ ] Data visible in Supabase Table Editor after test

---

## 3. Prerequisites

- [ ] **Phase 1 is complete**: Marco can log in via magic link and reach `/internal`
- [ ] **SQL schema is live**: All 8 tables exist in Supabase (`jobs`, `estimates`, `estimate_trades`, `estimate_line_items`, `estimate_overrides`, `bid_log`, `export_links`, `email_log`)
- [ ] **Packages installed**: `@supabase/supabase-js`, `@supabase/ssr` are in `node_modules`
- [ ] **Supabase client files exist**: `src/lib/supabase/client.ts`, `server.ts`, `admin.ts`
- [ ] **ENV vars set locally** (`.env.local`):
  ```
  NEXT_PUBLIC_SUPABASE_URL=https://rwzmcknxlucwbhsyxdcx.supabase.co
  NEXT_PUBLIC_SUPABASE_ANON_KEY=<from dashboard>
  SUPABASE_SERVICE_ROLE_KEY=<from dashboard>
  PIPELINE_INGEST_SECRET=<generate below>
  ```
- [ ] **ENV vars set in Vercel dashboard** (Production + Preview): same as above except `NEXT_PUBLIC_*` vars
- [ ] **Generate the ingest secret**:
  ```bash
  openssl rand -hex 32
  ```
  Copy the output into `.env.local` as `PIPELINE_INGEST_SECRET` and into Vercel dashboard.

---

## 4. TypeScript Types

**File to create**: `src/types/estimate.ts`

This file defines all shared types. Import from this in the route handler and any future UI code.

```typescript
// src/types/estimate.ts

export type TradeStatus = "SP" | "SUB" | "DEFERRED" | "NIS";
export type UnitType = "LF" | "SF" | "EA" | "LS";
export type DimensionType = "written" | "scaled" | "schedule" | "calculated" | "assumed";
export type ConfidenceLevel = "high" | "medium" | "low";

export interface IngestLineItem {
  description: string;
  area_location?: string;
  quantity: number;
  unit: UnitType;
  material_unit_cost: number;
  labor_unit_cost: number;
  labor_hours_per_unit?: number;
  dimension_type: DimensionType;
  source_sheet?: string;
  source_grid?: string;
  confidence: ConfidenceLevel;
  flags?: string[];
  is_allowance?: boolean;
}

export interface IngestTrade {
  trade_name: string;
  trade_status: TradeStatus;
  sort_order?: number;
  line_items: IngestLineItem[];
}

export interface IngestJob {
  name: string;
  client_name: string;
  address?: string;
  ahj?: string;
  bid_due_date?: string;     // ISO date string e.g. "2026-06-15"
  project_type?: string;     // "TI" | "Residential" | "Institutional" etc.
  gc_name?: string;
  client_email?: string;
  client_phone?: string;
}

export interface IngestConfig {
  overhead_pct: number;      // e.g. 15
  profit_pct: number;        // e.g. 10
  contingency_pct: number;   // e.g. 5
  gc_sub_markup_pct: number; // e.g. 10
}

export interface IngestPayload {
  pipeline_version: string;  // "2.0"
  job: IngestJob;
  config: IngestConfig;
  trades: IngestTrade[];
}

export interface IngestSuccessResponse {
  success: true;
  estimateId: string;
  jobId: string;
}

export interface IngestErrorResponse {
  success: false;
  error: string;
  code?: string;
}

// The frozen snapshot stored on each line item at ingest time.
// Never updated after creation — powers the AI baseline diff view.
export interface AiBaselineSnapshot {
  quantity: number;
  material_unit_cost: number;
  labor_unit_cost: number;
  labor_hours_per_unit?: number;
  confidence: ConfidenceLevel;
  flags: string[];
  dimension_type: DimensionType;
}
```

---

## 5. Ingest Route — Full Implementation

**File to create**: `src/app/api/estimates/ingest/route.ts`

### Directory structure
```
src/app/api/estimates/ingest/
└── route.ts
```

### Full implementation

```typescript
// src/app/api/estimates/ingest/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "crypto";
import type {
  IngestPayload,
  IngestLineItem,
  AiBaselineSnapshot,
  IngestSuccessResponse,
  IngestErrorResponse,
} from "@/types/estimate";

// ─── Admin client (service role — bypasses RLS) ───────────────────────────────
// NEVER import this in client-side code or Server Components that run in the browser bundle.
function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase admin env vars not set");
  }
  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

// ─── Auth helper ──────────────────────────────────────────────────────────────
function validateBearerToken(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) return false;
  const token = authHeader.slice(7); // strip "Bearer "
  const secret = process.env.PIPELINE_INGEST_SECRET;
  if (!secret) return false;
  // Constant-time comparison to prevent timing attacks
  const tokenBuf = Buffer.from(token);
  const secretBuf = Buffer.from(secret);
  if (tokenBuf.length !== secretBuf.length) return false;
  return require("crypto").timingSafeEqual(tokenBuf, secretBuf);
}

// ─── SHA-256 idempotency ──────────────────────────────────────────────────────
function computeBodyHash(rawBody: string): string {
  return createHash("sha256").update(rawBody, "utf8").digest("hex");
}

// ─── Payload validation ───────────────────────────────────────────────────────
function validatePayload(body: unknown): body is IngestPayload {
  if (!body || typeof body !== "object") return false;
  const p = body as Record<string, unknown>;
  if (typeof p.pipeline_version !== "string") return false;
  if (!p.job || typeof p.job !== "object") return false;
  if (!p.config || typeof p.config !== "object") return false;
  if (!Array.isArray(p.trades)) return false;
  const job = p.job as Record<string, unknown>;
  if (typeof job.name !== "string" || !job.name.trim()) return false;
  if (typeof job.client_name !== "string" || !job.client_name.trim()) return false;
  const config = p.config as Record<string, unknown>;
  if (typeof config.overhead_pct !== "number") return false;
  if (typeof config.profit_pct !== "number") return false;
  if (typeof config.contingency_pct !== "number") return false;
  if (typeof config.gc_sub_markup_pct !== "number") return false;
  return true;
}

// ─── Main handler ─────────────────────────────────────────────────────────────
export async function POST(request: NextRequest): Promise<NextResponse<IngestSuccessResponse | IngestErrorResponse>> {
  // 1. Auth
  if (!validateBearerToken(request)) {
    return NextResponse.json(
      { success: false, error: "Unauthorized", code: "INVALID_TOKEN" },
      { status: 401 }
    );
  }

  // 2. Read raw body (needed for hash before parsing)
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return NextResponse.json(
      { success: false, error: "Could not read request body", code: "BODY_READ_ERROR" },
      { status: 400 }
    );
  }

  // 3. Parse JSON
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body", code: "JSON_PARSE_ERROR" },
      { status: 400 }
    );
  }

  // 4. Validate shape
  if (!validatePayload(payload)) {
    return NextResponse.json(
      { success: false, error: "Payload validation failed — missing required fields", code: "VALIDATION_ERROR" },
      { status: 422 }
    );
  }

  // 5. Compute idempotency hash
  const bodyHash = computeBodyHash(rawBody);

  const supabase = getAdminClient();

  // 6. Idempotency check — does this exact payload already exist?
  const { data: existing } = await supabase
    .from("estimates")
    .select("id, job_id")
    .eq("ingest_hash", bodyHash)
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      { success: true, estimateId: existing.id, jobId: existing.job_id },
      { status: 200 }
    );
  }

  // 7. Run full insert — all-or-nothing via explicit rollback pattern
  // Note: Supabase JS client does not support multi-statement transactions directly.
  // We use a Postgres RPC (stored procedure) for atomic ingest, OR we implement
  // a manual rollback pattern. See Section 10 for the RPC approach.
  // Below uses the manual rollback pattern with cleanup on failure.

  let jobId: string | null = null;
  let estimateId: string | null = null;

  try {
    // ── Step A: Upsert job ──────────────────────────────────────────────────
    // Match on name + address; if address is null, match on name alone.
    // We always upsert — a job can have multiple estimates over time.
    const jobUpsertData: Record<string, unknown> = {
      name: payload.job.name.trim(),
      client_name: payload.job.client_name.trim(),
      updated_at: new Date().toISOString(),
    };
    if (payload.job.address) jobUpsertData.address = payload.job.address;
    if (payload.job.ahj) jobUpsertData.ahj = payload.job.ahj;
    if (payload.job.bid_due_date) jobUpsertData.bid_due_date = payload.job.bid_due_date;
    if (payload.job.project_type) jobUpsertData.project_type = payload.job.project_type;
    if (payload.job.gc_name) jobUpsertData.gc_name = payload.job.gc_name;
    if (payload.job.client_email) jobUpsertData.client_email = payload.job.client_email;
    if (payload.job.client_phone) jobUpsertData.client_phone = payload.job.client_phone;

    const { data: jobRow, error: jobError } = await supabase
      .from("jobs")
      .upsert(jobUpsertData, {
        onConflict: "name,address",  // Requires a UNIQUE constraint on (name, address) in DB
        ignoreDuplicates: false,     // We want the update to go through so updated_at refreshes
      })
      .select("id")
      .single();

    if (jobError || !jobRow) {
      throw new Error(`Job upsert failed: ${jobError?.message ?? "no row returned"}`);
    }
    jobId = jobRow.id;

    // ── Step B: Count existing estimates for this job (for version number) ──
    const { count: existingEstimateCount } = await supabase
      .from("estimates")
      .select("id", { count: "exact", head: true })
      .eq("job_id", jobId);

    const version = (existingEstimateCount ?? 0) + 1;

    // ── Step C: Create estimate row ─────────────────────────────────────────
    const { data: estimateRow, error: estimateError } = await supabase
      .from("estimates")
      .insert({
        job_id: jobId,
        version,
        is_ai_baseline: true,
        review_status: "draft",
        ingest_hash: bodyHash,
        pipeline_version: payload.pipeline_version,
        overhead_pct: payload.config.overhead_pct,
        profit_pct: payload.config.profit_pct,
        contingency_pct: payload.config.contingency_pct,
        gc_sub_markup_pct: payload.config.gc_sub_markup_pct,
      })
      .select("id")
      .single();

    if (estimateError || !estimateRow) {
      throw new Error(`Estimate insert failed: ${estimateError?.message ?? "no row returned"}`);
    }
    estimateId = estimateRow.id;

    // ── Step D: Insert trades and line items ────────────────────────────────
    for (let tradeIdx = 0; tradeIdx < payload.trades.length; tradeIdx++) {
      const trade = payload.trades[tradeIdx];

      const { data: tradeRow, error: tradeError } = await supabase
        .from("estimate_trades")
        .insert({
          estimate_id: estimateId,
          trade_name: trade.trade_name,
          trade_status: trade.trade_status,
          sort_order: trade.sort_order ?? tradeIdx,
        })
        .select("id")
        .single();

      if (tradeError || !tradeRow) {
        throw new Error(
          `Trade insert failed for "${trade.trade_name}": ${tradeError?.message ?? "no row returned"}`
        );
      }

      const tradeId = tradeRow.id;

      // Build line item rows in bulk for this trade
      const lineItemRows = trade.line_items.map((item: IngestLineItem) => {
        const snapshot: AiBaselineSnapshot = {
          quantity: item.quantity,
          material_unit_cost: item.material_unit_cost,
          labor_unit_cost: item.labor_unit_cost,
          labor_hours_per_unit: item.labor_hours_per_unit,
          confidence: item.confidence,
          flags: item.flags ?? [],
          dimension_type: item.dimension_type,
        };

        return {
          trade_id: tradeId,
          description: item.description,
          area_location: item.area_location ?? null,
          quantity: item.quantity,
          unit: item.unit,
          material_unit_cost: item.material_unit_cost,
          labor_unit_cost: item.labor_unit_cost,
          labor_hours_per_unit: item.labor_hours_per_unit ?? null,
          dimension_type: item.dimension_type,
          source_sheet: item.source_sheet ?? null,
          source_grid: item.source_grid ?? null,
          confidence: item.confidence,
          flags: item.flags ?? [],
          is_allowance: item.is_allowance ?? false,
          is_deleted: false,
          is_manual_override: false,
          ai_baseline_snapshot: snapshot,
        };
      });

      if (lineItemRows.length > 0) {
        const { error: lineItemError } = await supabase
          .from("estimate_line_items")
          .insert(lineItemRows);

        if (lineItemError) {
          throw new Error(
            `Line items insert failed for trade "${trade.trade_name}": ${lineItemError.message}`
          );
        }
      }
    }

    // ── Step E: Success ─────────────────────────────────────────────────────
    return NextResponse.json(
      { success: true, estimateId, jobId },
      { status: 201 }
    );

  } catch (err) {
    // ── Rollback: clean up any rows that were written ──────────────────────
    // Order matters: delete child rows before parent rows.
    if (estimateId) {
      // Cascade deletes handle trades + line items if FK ON DELETE CASCADE is set.
      // If not, delete manually in reverse order.
      await supabase.from("estimate_line_items")
        .delete()
        .in(
          "trade_id",
          (await supabase
            .from("estimate_trades")
            .select("id")
            .eq("estimate_id", estimateId)
          ).data?.map((r: { id: string }) => r.id) ?? []
        );
      await supabase.from("estimate_trades").delete().eq("estimate_id", estimateId);
      await supabase.from("estimates").delete().eq("id", estimateId);
      // Do NOT delete the job — it may have pre-existing estimates.
    }

    console.error("[ingest] transaction failed, rolled back:", err);

    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Internal server error",
        code: "INGEST_FAILED",
      },
      { status: 500 }
    );
  }
}
```

### Critical: `ingest_hash` column

The idempotency check requires an `ingest_hash` column on the `estimates` table. If Phase 1 schema did not include it, add it now in Supabase SQL Editor:

```sql
-- Run in Supabase SQL Editor
ALTER TABLE estimates ADD COLUMN IF NOT EXISTS ingest_hash TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS estimates_ingest_hash_idx ON estimates (ingest_hash) WHERE ingest_hash IS NOT NULL;

-- Also add pipeline_version if not already there
ALTER TABLE estimates ADD COLUMN IF NOT EXISTS pipeline_version TEXT;
```

---

## 6. Idempotency Implementation

**Where the hash is stored**: `estimates.ingest_hash` column (TEXT, nullable, unique index).

**What is hashed**: The raw request body bytes (UTF-8 string), SHA-256, hex-encoded. This means the hash is computed before JSON parsing, so byte-for-byte identical payloads produce identical hashes.

**Hash algorithm**: SHA-256 via Node.js built-in `crypto` module — no extra dependency.

**Collision scenario**: If the pipeline reruns the same estimate (same payload bytes), the second POST returns HTTP 200 with the existing `estimateId` and `jobId`. No rows are created.

**Why not idempotency on job name alone**: A re-estimate (new version) of the same job will have different line items and thus a different payload hash, correctly creating a second estimate row with version = 2.

**Timing edge case**: Two simultaneous POSTs of the same payload could both pass the initial hash check before either writes a row. The `UNIQUE INDEX` on `ingest_hash` will cause the second insert to fail with a unique constraint violation. The catch block will roll back the second request. The first request will have already returned 201. The second will return 500. This is acceptable — the pipeline should not send concurrent duplicate requests. The retry is safe because the hash check will return 200 on any subsequent attempt.

---

## 7. Error Handling and Partial Failure

**The problem with Supabase JS client**: The `@supabase/supabase-js` client does NOT support multi-statement transactions natively. Each `.insert()` call is an independent HTTP request to the Supabase PostgREST API. There is no `BEGIN` / `COMMIT` / `ROLLBACK`.

**The solution used above**: Manual compensating rollback in the catch block. If any step fails after `estimateId` is set, we delete all rows created in this request in reverse dependency order (line_items → trades → estimate). The job row is NOT deleted because it may pre-exist or be needed.

**Better alternative (recommended if cascades are set up)**: Add `ON DELETE CASCADE` to foreign keys:
```sql
-- In the schema, or add now:
ALTER TABLE estimate_trades DROP CONSTRAINT IF EXISTS estimate_trades_estimate_id_fkey;
ALTER TABLE estimate_trades ADD CONSTRAINT estimate_trades_estimate_id_fkey
  FOREIGN KEY (estimate_id) REFERENCES estimates(id) ON DELETE CASCADE;

ALTER TABLE estimate_line_items DROP CONSTRAINT IF EXISTS estimate_line_items_trade_id_fkey;
ALTER TABLE estimate_line_items ADD CONSTRAINT estimate_line_items_trade_id_fkey
  FOREIGN KEY (trade_id) REFERENCES estimate_trades(id) ON DELETE CASCADE;
```

With cascade deletes, the rollback simplifies to:
```typescript
if (estimateId) {
  await supabase.from("estimates").delete().eq("id", estimateId);
  // Cascade handles trades and line_items automatically
}
```

**Best alternative (most robust)**: Use a Postgres RPC function. See Section 10.

**What partial failure looks like**:
- Jobs upsert fails → nothing written, 500 returned. Safe.
- Estimate insert fails → nothing written (job was upserted, which is fine), 500 returned. Safe.
- Trade insert fails mid-loop → estimate + prior trades exist; catch block deletes them. 500 returned.
- Line item insert fails → estimate + all trades exist; catch block deletes them. 500 returned.

In all failure cases, the pipeline receives a non-201 response and reports the error without blocking Gate 3.

---

## 8. Pipeline Modification Spec

### 8a. What to add to `~/.claude/commands/estimate.md`

Add a new agent block **after the PIPELINE VERIFICATION PROTOCOL section**, before Gate 3. Place it in the WAVE 4 section as **Agent W4-D: Portal Push**.

```markdown
---

### Agent W4-D: Portal Push
**Trigger**: Only runs after PIPELINE VERIFICATION PROTOCOL reports APPROVE-READY
**Role**: Deliver the completed estimate to the Saddlewood portal

**Reads**: `output/estimate-payload.json`

**Action**:
```bash
curl -s -w "\n%{http_code}" -X POST "${PORTAL_URL:-https://saddlewoodcontracting.com}/api/estimates/ingest" \
  -H "Authorization: Bearer $PIPELINE_INGEST_SECRET" \
  -H "Content-Type: application/json" \
  -d @output/estimate-payload.json
```

**Response handling**:
- HTTP 201: Report "Portal updated — Marco can review at saddlewoodcontracting.com/internal"
- HTTP 200: Report "Portal already has this estimate (duplicate submission) — no action needed"
- HTTP 401: Report "Portal push FAILED: invalid PIPELINE_INGEST_SECRET — check your .env file. Estimate files are saved locally."
- HTTP 422: Report "Portal push FAILED: payload validation error — see response body. Estimate files are saved locally."
- HTTP 5xx or curl error: Report "Portal push FAILED: [error details]. Estimate files are saved locally. Retry manually with: curl -X POST ... -d @output/estimate-payload.json"

**IMPORTANT**: Portal push failure does NOT block Gate 3. The estimate is complete when local files are written. The portal push is a convenience delivery. Always report the failure clearly but continue.

**Output**: No file written. Only the HTTP call.

---
```

### 8b. New ENV vars for the pipeline environment

Add to `~/.claude/.env` (or whatever env file the estimate skill reads):

```bash
PORTAL_URL=https://saddlewoodcontracting.com
PIPELINE_INGEST_SECRET=<same 64-char hex value as in Vercel dashboard>
```

These must match exactly. If they diverge (e.g., you rotate the Vercel secret), update both.

### 8c. What `ROLLUP_AND_PROPOSAL_PROMPT` must write

The rollup prompt (at `FRAMEWORK/08_OUTPUT/ROLLUP_AND_PROPOSAL_PROMPT`) currently writes:
- `output/estimate-detailed.xlsx`
- `output/estimate-summary.md`
- `output/Proposal.md`
- `output/Proposal.docx`

**Add this output**: `output/estimate-payload.json`

The rollup agent must construct the JSON by:
1. Reading `JOB_CONFIG` for job metadata (name, client, address, ahj, bid_due_date, project_type, gc_name)
2. Reading `JOB_CONFIG` for config values (OVERHEAD_PCT, PROFIT_PCT, CONTINGENCY_PCT, GC_SUB_MARKUP_PCT)
3. Reading all trade summaries from the takeoff output files
4. Assembling line items from each trade's completed takeoff

**Add to the rollup prompt instructions**:

```markdown
## Additional Output: estimate-payload.json

After generating all other outputs, write `output/estimate-payload.json` with the following structure.
This file is consumed by Agent W4-D (Portal Push) and must be valid JSON.

Fields to populate:
- `pipeline_version`: always "2.0"
- `job.name`: from JOB_CONFIG `JOB_NAME`
- `job.client_name`: from JOB_CONFIG `CLIENT_NAME`  
- `job.address`: from JOB_CONFIG `PROJECT_ADDRESS` (omit if not set)
- `job.ahj`: from JOB_CONFIG `AHJ` (e.g. "Surprise, AZ")
- `job.bid_due_date`: from JOB_CONFIG `BID_DUE_DATE` in ISO format (e.g. "2026-06-15")
- `job.project_type`: from JOB_CONFIG `PROJECT_TYPE`
- `job.gc_name`: from JOB_CONFIG `GC_NAME` (omit if not set)
- `config.overhead_pct`: from JOB_CONFIG `OVERHEAD_PCT` as number
- `config.profit_pct`: from JOB_CONFIG `PROFIT_PCT` as number
- `config.contingency_pct`: from JOB_CONFIG `CONTINGENCY_PCT` as number
- `config.gc_sub_markup_pct`: from JOB_CONFIG `GC_SUB_MARKUP_PCT` as number
- `trades`: one object per trade scope, in sort_order
  - Each trade: `trade_name`, `trade_status` (SP/SUB/DEFERRED/NIS), `sort_order` (0-based), `line_items`
  - Each line_item: all fields from the takeoff table: description, area_location, quantity, unit,
    material_unit_cost, labor_unit_cost, labor_hours_per_unit, dimension_type, source_sheet,
    source_grid, confidence, flags (array), is_allowance

Validation before writing:
- Every line_item must have quantity > 0
- Every line_item must have material_unit_cost >= 0 and labor_unit_cost >= 0
- Every dimension_type must be one of: written | scaled | schedule | calculated | assumed
- Every confidence must be one of: high | medium | low
- Every trade_status must be one of: SP | SUB | DEFERRED | NIS

If any validation fails: write the file anyway but add a top-level field `"validation_warnings": ["..."]`
listing each problem. The portal ingest endpoint will still accept the payload; the warnings are for
the estimator's awareness.
```

---

## 9. Testing Plan

### 9a. Sample payload (`output/estimate-payload.json`)

Save this as a test file at `/tmp/test-estimate-payload.json`:

```json
{
  "pipeline_version": "2.0",
  "job": {
    "name": "Bellevue Church Test",
    "client_name": "Bellevue Community Church",
    "address": "14800 W Tierra Buena Ln, Surprise, AZ 85374",
    "ahj": "Surprise, AZ",
    "bid_due_date": "2026-06-15",
    "project_type": "Institutional",
    "gc_name": "Turner Construction"
  },
  "config": {
    "overhead_pct": 15,
    "profit_pct": 10,
    "contingency_pct": 5,
    "gc_sub_markup_pct": 10
  },
  "trades": [
    {
      "trade_name": "Framing",
      "trade_status": "SP",
      "sort_order": 0,
      "line_items": [
        {
          "description": "3-5/8\" 20ga metal stud wall @ 16\" OC",
          "area_location": "Franklin_Hall",
          "quantity": 842,
          "unit": "LF",
          "material_unit_cost": 1.18,
          "labor_unit_cost": 2.40,
          "labor_hours_per_unit": 0.030,
          "dimension_type": "written",
          "source_sheet": "A3.1",
          "source_grid": "B/4",
          "confidence": "high",
          "flags": [],
          "is_allowance": false
        },
        {
          "description": "6\" 18ga metal stud wall @ 16\" OC — sound",
          "area_location": "Sanctuary_Lobby",
          "quantity": 312,
          "unit": "LF",
          "material_unit_cost": 1.65,
          "labor_unit_cost": 2.60,
          "labor_hours_per_unit": 0.033,
          "dimension_type": "scaled",
          "source_sheet": "A3.2",
          "source_grid": "C/7",
          "confidence": "medium",
          "flags": ["scale-not-verified"],
          "is_allowance": false
        },
        {
          "description": "Structural header — (2) C8x11.5 @ door openings",
          "area_location": "Franklin_Hall",
          "quantity": 8,
          "unit": "EA",
          "material_unit_cost": 185.00,
          "labor_unit_cost": 95.00,
          "labor_hours_per_unit": 1.20,
          "dimension_type": "schedule",
          "source_sheet": "S2.1",
          "source_grid": "DOOR SCHEDULE",
          "confidence": "high",
          "flags": [],
          "is_allowance": false
        }
      ]
    },
    {
      "trade_name": "Drywall",
      "trade_status": "SP",
      "sort_order": 1,
      "line_items": [
        {
          "description": "5/8\" Type X GWB — single layer both sides",
          "area_location": "Franklin_Hall",
          "quantity": 6240,
          "unit": "SF",
          "material_unit_cost": 0.62,
          "labor_unit_cost": 1.10,
          "labor_hours_per_unit": 0.014,
          "dimension_type": "calculated",
          "source_sheet": "A3.1",
          "source_grid": "B/4",
          "confidence": "high",
          "flags": [],
          "is_allowance": false
        },
        {
          "description": "Taping and Level 4 finish — all GWB",
          "area_location": "Franklin_Hall",
          "quantity": 6240,
          "unit": "SF",
          "material_unit_cost": 0.28,
          "labor_unit_cost": 0.85,
          "labor_hours_per_unit": 0.011,
          "dimension_type": "calculated",
          "source_sheet": "A3.1",
          "source_grid": "B/4",
          "confidence": "high",
          "flags": [],
          "is_allowance": false
        },
        {
          "description": "Specialty acoustical ceiling — allowance",
          "area_location": "Sanctuary_Lobby",
          "quantity": 1,
          "unit": "LS",
          "material_unit_cost": 18000.00,
          "labor_unit_cost": 7000.00,
          "labor_hours_per_unit": null,
          "dimension_type": "assumed",
          "source_sheet": null,
          "source_grid": null,
          "confidence": "low",
          "flags": ["RFI-001", "allowance-verify-with-specs"],
          "is_allowance": true
        }
      ]
    }
  ]
}
```

### 9b. Manual curl test commands

**Step 1 — Set your secret in the terminal session**:
```bash
export PIPELINE_INGEST_SECRET="<your 64-char hex secret>"
```

**Step 2 — Test against localhost (during development)**:
```bash
curl -s -w "\n\nHTTP STATUS: %{http_code}\n" \
  -X POST http://localhost:3000/api/estimates/ingest \
  -H "Authorization: Bearer $PIPELINE_INGEST_SECRET" \
  -H "Content-Type: application/json" \
  -d @/tmp/test-estimate-payload.json | jq .
```

Expected response (201):
```json
{
  "success": true,
  "estimateId": "uuid-...",
  "jobId": "uuid-..."
}
```

**Step 3 — Test idempotency (send same payload again)**:
```bash
# Run the exact same curl command again
# Expected: HTTP 200 (not 201), same estimateId and jobId
```

**Step 4 — Test bad token (should return 401)**:
```bash
curl -s -w "\n\nHTTP STATUS: %{http_code}\n" \
  -X POST http://localhost:3000/api/estimates/ingest \
  -H "Authorization: Bearer wrongtoken" \
  -H "Content-Type: application/json" \
  -d @/tmp/test-estimate-payload.json
```

**Step 5 — Test against production (after deploy)**:
```bash
curl -s -w "\n\nHTTP STATUS: %{http_code}\n" \
  -X POST https://saddlewoodcontracting.com/api/estimates/ingest \
  -H "Authorization: Bearer $PIPELINE_INGEST_SECRET" \
  -H "Content-Type: application/json" \
  -d @/tmp/test-estimate-payload.json | jq .
```

### 9c. Verify in Supabase Table Editor

After a successful 201 response:

1. Open https://supabase.com/dashboard → project `rwzmcknxlucwbhsyxdcx` → Table Editor

2. **`jobs` table**: Confirm one row exists with:
   - `name` = "Bellevue Church Test"
   - `client_name` = "Bellevue Community Church"
   - `ahj` = "Surprise, AZ"

3. **`estimates` table**: Confirm one row exists with:
   - `job_id` = the UUID from jobs
   - `is_ai_baseline` = true
   - `version` = 1
   - `ingest_hash` = 64-char hex string
   - `overhead_pct` = 15, `profit_pct` = 10, `contingency_pct` = 5, `gc_sub_markup_pct` = 10

4. **`estimate_trades` table**: Confirm 2 rows (Framing + Drywall), both with `estimate_id` set correctly, `sort_order` 0 and 1.

5. **`estimate_line_items` table**: Confirm 6 rows total (3 per trade). Check one row in detail:
   - `ai_baseline_snapshot` JSONB column should contain the frozen values
   - `is_manual_override` = false
   - `is_deleted` = false
   - For the allowance item: `is_allowance` = true, `confidence` = "low", `flags` = ["RFI-001", "allowance-verify-with-specs"]

6. **Idempotency test**: Run the curl command a second time. The count of rows in all tables must not change. The `estimates` table must still have exactly 1 row for this job.

---

## 10. Common Pitfalls

### Pitfall 1: Supabase JS has no native transactions

**The issue**: Every `.insert()`, `.update()`, `.delete()` call goes to the PostgREST REST API as a separate HTTP request. There is no `BEGIN TRANSACTION`. If your code crashes between inserts, you get orphaned rows.

**The workaround used in this plan**: Manual rollback in the catch block — delete rows in reverse dependency order if any step fails.

**The better solution**: Write a Postgres stored procedure (RPC) that does the entire ingest atomically:

```sql
-- Run in Supabase SQL Editor to create the RPC
CREATE OR REPLACE FUNCTION ingest_estimate(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER  -- runs as the owner, bypasses RLS
AS $$
DECLARE
  v_job_id UUID;
  v_estimate_id UUID;
  v_trade_id UUID;
  v_version INT;
  v_trade JSONB;
  v_item JSONB;
BEGIN
  -- All of this is one transaction. Any error causes full rollback.

  -- Upsert job
  INSERT INTO jobs (name, client_name, address, ahj, bid_due_date, project_type, gc_name, client_email, client_phone)
  VALUES (
    payload->'job'->>'name',
    payload->'job'->>'client_name',
    payload->'job'->>'address',
    payload->'job'->>'ahj',
    (payload->'job'->>'bid_due_date')::DATE,
    payload->'job'->>'project_type',
    payload->'job'->>'gc_name',
    payload->'job'->>'client_email',
    payload->'job'->>'client_phone'
  )
  ON CONFLICT (name, address) DO UPDATE
    SET client_name = EXCLUDED.client_name,
        updated_at = NOW()
  RETURNING id INTO v_job_id;

  -- Version number
  SELECT COALESCE(COUNT(*), 0) + 1 INTO v_version FROM estimates WHERE job_id = v_job_id;

  -- Create estimate
  INSERT INTO estimates (job_id, version, is_ai_baseline, review_status, ingest_hash,
    pipeline_version, overhead_pct, profit_pct, contingency_pct, gc_sub_markup_pct)
  VALUES (
    v_job_id, v_version, true, 'draft', payload->>'ingest_hash',
    payload->>'pipeline_version',
    (payload->'config'->>'overhead_pct')::NUMERIC,
    (payload->'config'->>'profit_pct')::NUMERIC,
    (payload->'config'->>'contingency_pct')::NUMERIC,
    (payload->'config'->>'gc_sub_markup_pct')::NUMERIC
  )
  RETURNING id INTO v_estimate_id;

  -- Insert trades and line items
  FOR v_trade IN SELECT * FROM jsonb_array_elements(payload->'trades')
  LOOP
    INSERT INTO estimate_trades (estimate_id, trade_name, trade_status, sort_order)
    VALUES (
      v_estimate_id,
      v_trade->>'trade_name',
      v_trade->>'trade_status',
      (v_trade->>'sort_order')::INT
    )
    RETURNING id INTO v_trade_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(v_trade->'line_items')
    LOOP
      INSERT INTO estimate_line_items (
        trade_id, description, area_location, quantity, unit,
        material_unit_cost, labor_unit_cost, labor_hours_per_unit,
        dimension_type, source_sheet, source_grid, confidence, flags,
        is_allowance, is_deleted, is_manual_override, ai_baseline_snapshot
      )
      VALUES (
        v_trade_id,
        v_item->>'description',
        v_item->>'area_location',
        (v_item->>'quantity')::NUMERIC,
        v_item->>'unit',
        (v_item->>'material_unit_cost')::NUMERIC,
        (v_item->>'labor_unit_cost')::NUMERIC,
        NULLIF(v_item->>'labor_hours_per_unit', 'null')::NUMERIC,
        v_item->>'dimension_type',
        v_item->>'source_sheet',
        v_item->>'source_grid',
        v_item->>'confidence',
        COALESCE(v_item->'flags', '[]'::JSONB),
        COALESCE((v_item->>'is_allowance')::BOOLEAN, false),
        false,
        false,
        jsonb_build_object(
          'quantity', (v_item->>'quantity')::NUMERIC,
          'material_unit_cost', (v_item->>'material_unit_cost')::NUMERIC,
          'labor_unit_cost', (v_item->>'labor_unit_cost')::NUMERIC,
          'labor_hours_per_unit', NULLIF(v_item->>'labor_hours_per_unit', 'null')::NUMERIC,
          'confidence', v_item->>'confidence',
          'flags', COALESCE(v_item->'flags', '[]'::JSONB),
          'dimension_type', v_item->>'dimension_type'
        )
      );
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object('estimateId', v_estimate_id, 'jobId', v_job_id);
END;
$$;
```

Then in the route handler, replace the entire try/catch insert block with:
```typescript
const { data, error } = await supabase.rpc("ingest_estimate", {
  payload: { ...payload, ingest_hash: bodyHash }
});
if (error) throw new Error(error.message);
return NextResponse.json({ success: true, estimateId: data.estimateId, jobId: data.jobId }, { status: 201 });
```

This is the cleanest solution and is truly atomic. The manual rollback pattern in Section 5 is the fallback if you want to avoid creating the RPC for now.

### Pitfall 2: RLS blocks service role — actually it does NOT

**Common misconception**: Developers assume that enabling RLS blocks everyone including service role.

**Reality**: The service role key (`SUPABASE_SERVICE_ROLE_KEY`) bypasses RLS entirely. All RLS policies are ignored for queries made with the service role client. This is intentional and correct — the ingest endpoint is server-side and already authenticated by its own Bearer token.

**The danger**: Never import `src/lib/supabase/admin.ts` in any client-side component or page component that runs in the browser. The service role key would leak into the browser bundle and give anyone full DB access. Keep admin client imports only in route handlers (files named `route.ts`).

### Pitfall 3: `upsert` with `onConflict` requires a unique constraint

**The issue**: Calling `.upsert({ ... }, { onConflict: "name,address" })` will fail if the DB does not have a `UNIQUE` constraint (or unique index) on `(name, address)` in the `jobs` table.

**Fix**: Add this to the schema if it isn't there:
```sql
CREATE UNIQUE INDEX IF NOT EXISTS jobs_name_address_idx ON jobs (name, COALESCE(address, ''));
```
Note: `COALESCE(address, '')` handles the case where address is NULL — PostgreSQL treats NULL != NULL, so two rows with `name='X'` and `address=NULL` would not collide without this.

### Pitfall 4: `request.text()` vs `request.json()`

The ingest route calls `request.text()` (not `request.json()`) because the raw body string is needed for SHA-256 hashing before parsing. Once you call `request.json()`, you cannot call `request.text()` — request bodies are streams that can only be consumed once.

### Pitfall 5: Next.js App Router route handlers must export named functions

The file must export `export async function POST(...)`, not `export default`. If you accidentally export `default`, Next.js will not recognize the route and return 404.

### Pitfall 6: Vercel function cold start timeout

On Vercel Pro, serverless functions have a 60-second max execution time. The ingest route does multiple sequential DB calls. With a large estimate (20 trades, 50 line items each = 1000 line items), individual inserts in a loop could be slow.

**Mitigation**: Use bulk insert. The line items for each trade are already batched into a single `.insert(lineItemRows)` call in the implementation above — this sends all line items for a trade in one HTTP call to PostgREST, not one per row.

**Further optimization if needed**: Use the RPC approach (Pitfall 1 solution) which does everything in one round trip.

### Pitfall 7: `PIPELINE_INGEST_SECRET` drift between Mac and Vercel

If you rotate the secret in Vercel but forget to update `~/.claude/.env` on the Mac (or vice versa), every pipeline push will return 401. The fix is always to update both simultaneously:
1. Generate new secret: `openssl rand -hex 32`
2. Update Vercel dashboard
3. Update `~/.claude/.env` (or wherever the pipeline reads it)
4. Redeploy if Vercel doesn't auto-redeploy on env var change

### Pitfall 8: `bid_due_date` as ISO string vs Date object

The payload sends `bid_due_date` as an ISO string (e.g., `"2026-06-15"`). The Supabase insert must cast this correctly. PostgREST accepts ISO date strings directly for `DATE` columns — no manual casting needed. Do not wrap it in `new Date()` — that converts to a full timestamp with timezone which may cause type mismatch in Postgres.

---

## 11. Execution Order

Do these steps in exact order:

1. Add `ingest_hash` and `pipeline_version` columns to `estimates` table in Supabase SQL Editor (SQL in Section 5)
2. Add unique index on `jobs(name, address)` if not present (Pitfall 3)
3. Add `ON DELETE CASCADE` to FK constraints if desired (Pitfall 1, Section 7)
4. (Optional but recommended) Create the `ingest_estimate` RPC in Supabase SQL Editor (Pitfall 1 solution)
5. Generate `PIPELINE_INGEST_SECRET`: `openssl rand -hex 32`
6. Add to `.env.local` and Vercel dashboard
7. Create `src/types/estimate.ts` (Section 4)
8. Create `src/app/api/estimates/ingest/route.ts` (Section 5)
9. Deploy to Vercel (or `npm run dev` for local testing)
10. Test with sample payload curl command (Section 9b)
11. Verify rows in Supabase Table Editor (Section 9c)
12. Modify `ROLLUP_AND_PROPOSAL_PROMPT` to write `estimate-payload.json` (Section 8c)
13. Add Agent W4-D block to `~/.claude/commands/estimate.md` (Section 8a)
14. Add `PORTAL_URL` and `PIPELINE_INGEST_SECRET` to pipeline env (Section 8b)
15. Run a real estimate and confirm end-to-end: local files written + portal shows new estimate

**Phase 2 is complete when Step 15 succeeds.**


---

## AMENDMENTS — Gap Fixes (2026-05-13)

### Gap 4 Fix — Re-Ingest Versioning (Revised Estimates for the Same Job)

**Problem:** The pipeline may run multiple times for the same job — e.g., after Marco requests changes to the framing quantities, the estimator re-runs the framing agent and re-pushes. The original ingest logic upserts the `jobs` row (correct) but always creates a fresh `estimates` row without connecting it to prior versions. This means Bellevue Church v2 appears as a brand-new job, not a revision.

**Updated ingest logic — versioning section:**

Add this logic to the ingest route AFTER the `jobs` upsert and BEFORE creating the `estimates` row:

```typescript
// --- VERSION DETECTION ---
// Check if a prior estimate exists for this job
const { data: existingEstimates } = await supabaseAdmin
  .from('estimates')
  .select('id, version')
  .eq('job_id', jobId)
  .order('version', { ascending: false })
  .limit(1)

const priorEstimate = existingEstimates?.[0] ?? null
const newVersion = priorEstimate ? priorEstimate.version + 1 : 1
const parentEstimateId = priorEstimate?.id ?? null

// Archive the prior estimate if this is a revision
if (priorEstimate) {
  await supabaseAdmin
    .from('estimates')
    .update({ review_status: 'archived' })
    .eq('id', priorEstimate.id)
}

// Create the new estimate with correct version linkage
const { data: newEstimate } = await supabaseAdmin
  .from('estimates')
  .insert({
    job_id: jobId,
    version: newVersion,
    parent_estimate_id: parentEstimateId,
    is_ai_baseline: true,
    ingest_hash: payloadHash,
    overhead_pct: payload.config.overhead_pct,
    profit_pct: payload.config.profit_pct,
    contingency_pct: payload.config.contingency_pct,
    gc_sub_markup_pct: payload.config.gc_sub_markup_pct,
    review_status: 'draft',
    pipeline_version: payload.pipeline_version,
  })
  .select()
  .single()
```

**Updated ingest response — include version info:**
```typescript
return NextResponse.json({
  success: true,
  estimateId: newEstimate.id,
  jobId,
  version: newVersion,
  isRevision: newVersion > 1,
  previousEstimateId: parentEstimateId,
}, { status: 201 })
```

**Pipeline skill update (Agent W4-D):**
When the pipeline receives a 201 response, check the `isRevision` flag:
- `isRevision: false` → report: "✅ Portal updated — new estimate created. Marco can review at saddlewoodcontracting.com/internal"
- `isRevision: true` → report: "✅ Portal updated — v[N] revision created for [Job Name]. Previous version archived. Marco has been notified."

**Optional payload field — add to `IngestPayload` interface in `src/types/estimate.ts`:**
```typescript
interface IngestPayload {
  pipeline_version: string
  ingest_mode?: 'new' | 'revision'  // optional hint from pipeline; portal uses versioning logic regardless
  job: { ... }
  config: { ... }
  trades: Array<{ ... }>
}
```

**Dashboard display changes (Phase 3 — note for that phase):**
- Group estimates by `job_id` on the dashboard
- Show only the highest (non-archived) version by default
- An "N versions" expander shows archived prior versions
- Estimate cards show "v2", "v3" badges when `version > 1`
- The `estimate-ready` notification email to Marco should indicate if this is a revision: "Revised estimate ready for review (v2): Bellevue Church — $847,500"

**Notification email update (Phase 5 — note for that phase):**
When `isRevision: true`, the `estimate-ready` email to Marco should say:
- Subject: `Revised estimate ready (v2): [Job Name] — $[Amount]`
- Body: Include a "What changed" section if the previous version's grand total differs: "Previously: $865,000 → Now: $847,500 (−$17,500)"

**Testing addition:**
After the initial ingest test, run a second ingest with a slightly modified payload for the same job. Verify:
1. `jobs` table still has 1 row (upserted, not duplicated)
2. `estimates` table has 2 rows: v1 with `review_status = 'archived'`, v2 with `review_status = 'draft'`
3. `estimates.parent_estimate_id` on v2 points to v1's id
4. API returns `{ isRevision: true, version: 2, previousEstimateId: '...' }`

**Database migration note:**
The `estimates` table already has `version INTEGER NOT NULL DEFAULT 1` and `parent_estimate_id UUID REFERENCES estimates(id)` from the original schema — no migration needed. The logic change is purely in the ingest route.
