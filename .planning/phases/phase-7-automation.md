# Phase 7 — Automated Follow-Up Emails via Vercel Cron

## 1. Phase Goal

Add a daily Vercel Cron job that automatically sends follow-up emails to clients and internal alerts to Marco based on estimate age, open status, and expiry date — eliminating all manual follow-up work. Every automated send is idempotent, per-estimate opt-out-able, and fully logged for debugging.

---

## 2. Success Criteria

- [ ] `vercel.json` cron fires at 8:00 AM Arizona time every day
- [ ] `GET /api/cron/follow-ups` returns 401 for any request missing the correct `CRON_SECRET`
- [ ] All 5 checks execute correctly against real estimate data
- [ ] No email is ever sent twice for the same `estimate_id` + `template_id` combination
- [ ] Estimates with `no_auto_followup = true` are skipped entirely
- [ ] Failed sends are logged as `status = 'failed'` and retried on the next cron run
- [ ] `cron_runs` table captures a row after every execution
- [ ] Estimates that meet check 4 are marked `review_status = 'expired'` in the DB
- [ ] UI toggle on the estimate review page updates `export_links.no_auto_followup` via PATCH
- [ ] Local testing via `curl` or Vercel CLI reproduces all 5 checks
- [ ] Migration SQL runs cleanly on existing tables without data loss

---

## 3. `vercel.json` Configuration

```json
{
  "crons": [
    {
      "path": "/api/cron/follow-ups",
      "schedule": "0 15 * * *"
    }
  ]
}
```

**Timezone note:** Arizona does NOT observe DST. Arizona Standard Time is permanently UTC-7. `15:00 UTC = 08:00 America/Phoenix` year-round. No seasonal adjustment needed. If the business ever adds operations in a DST-observing state, this will need revisiting.

**Vercel cron limits (see Section 13 for full details):**
- Vercel Pro: up to 40 crons, max 24 invocations/day each
- Max execution time: 60s on Vercel Hobby/Pro Serverless. Use Edge Runtime only if needed for latency, not timeout.
- Cron authentication: Vercel automatically sets `Authorization: Bearer [CRON_SECRET]` on cron-triggered requests.

---

## 4. `/api/cron/follow-ups` Route — Full Implementation Spec

### File: `src/app/api/cron/follow-ups/route.ts`

```typescript
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { sendFollowUpEmail } from '@/lib/email/follow-ups'
import type { CronCheckResult, CronRunSummary, EstimateForCron } from '@/types/cron'

// Initialize Supabase with service role key (bypasses RLS for cron operations)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now()

  // --- Auth ---
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const results: CronCheckResult[] = []
  let checkedCount = 0
  let sentCount = 0
  let errorCount = 0

  try {
    // --- Load active estimates ---
    const estimates = await loadActiveEstimates()
    checkedCount = estimates.length

    for (const estimate of estimates) {
      if (estimate.no_auto_followup) continue

      const checkResults = await runAllChecks(estimate)
      results.push(...checkResults)

      for (const result of checkResults) {
        if (result.action === 'send' && result.templateId && result.recipientEmail) {
          const sent = await dispatchEmail(estimate, result)
          if (sent) sentCount++
          else errorCount++
        } else if (result.action === 'mark_expired') {
          await markEstimateExpired(estimate.estimateId)
        }
      }
    }
  } catch (err) {
    errorCount++
    console.error('[cron/follow-ups] Fatal error:', err)
  }

  const durationMs = Date.now() - startTime

  // --- Log cron run ---
  await supabase.from('cron_runs').insert({
    run_at: new Date().toISOString(),
    checked_count: checkedCount,
    sent_count: sentCount,
    error_count: errorCount,
    duration_ms: durationMs,
  })

  const summary: CronRunSummary = {
    checked: checkedCount,
    emailsSent: sentCount,
    errors: errorCount,
    durationMs,
  }

  return NextResponse.json(summary, { status: 200 })
}
```

### `loadActiveEstimates()` query

```typescript
async function loadActiveEstimates(): Promise<EstimateForCron[]> {
  const { data, error } = await supabase
    .from('export_links')
    .select(`
      id,
      estimate_id,
      no_auto_followup,
      client_email,
      sent_at,
      first_opened_at,
      expires_at,
      estimates!inner (
        id,
        review_status,
        approved_at,
        accepted_at,
        client_name,
        project_name,
        estimator_email
      )
    `)
    .eq('is_revoked', false)
    .in('estimates.review_status', ['sent', 'viewed'])

  if (error) throw error

  return (data ?? []).map((row) => ({
    exportLinkId: row.id,
    estimateId: row.estimate_id,
    noAutoFollowup: row.no_auto_followup,
    clientEmail: row.client_email,
    sentAt: row.sent_at ? new Date(row.sent_at) : null,
    firstOpenedAt: row.first_opened_at ? new Date(row.first_opened_at) : null,
    expiresAt: row.expires_at ? new Date(row.expires_at) : null,
    reviewStatus: row.estimates.review_status,
    approvedAt: row.estimates.approved_at ? new Date(row.estimates.approved_at) : null,
    acceptedAt: row.estimates.accepted_at ? new Date(row.estimates.accepted_at) : null,
    clientName: row.estimates.client_name,
    projectName: row.estimates.project_name,
    estimatorEmail: row.estimates.estimator_email,
  }))
}
```

### `runAllChecks()` — all 5 checks

```typescript
async function runAllChecks(estimate: EstimateForCron): Promise<CronCheckResult[]> {
  const results: CronCheckResult[] = []
  const now = toArizonaDate(new Date())

  // Check 1: Sent 3+ days ago, never opened
  if (estimate.sentAt) {
    const daysSinceSent = diffDays(now, toArizonaDate(estimate.sentAt))
    if (daysSinceSent >= 3 && !estimate.firstOpenedAt) {
      const alreadySent = await checkIdempotency(estimate.estimateId, 'client-reminder-3d')
      if (!alreadySent) {
        results.push({
          estimateId: estimate.estimateId,
          check: 1,
          action: 'send',
          templateId: 'client-reminder-3d',
          recipientEmail: estimate.clientEmail,
          daysSinceSent,
        })
      }
    }
  }

  // Check 2: Sent 7+ days ago, opened but not accepted
  if (estimate.sentAt && estimate.firstOpenedAt) {
    const daysSinceSent = diffDays(now, toArizonaDate(estimate.sentAt))
    if (daysSinceSent >= 7 && !estimate.acceptedAt) {
      const alreadySent = await checkIdempotency(estimate.estimateId, 'client-followup-7d')
      if (!alreadySent) {
        results.push({
          estimateId: estimate.estimateId,
          check: 2,
          action: 'send',
          templateId: 'client-followup-7d',
          recipientEmail: estimate.clientEmail,
          daysSinceSent,
        })
      }
    }
  }

  // Check 3: Expiring within 5 days, not accepted
  if (estimate.expiresAt && !estimate.acceptedAt) {
    const daysUntilExpiry = diffDays(toArizonaDate(estimate.expiresAt), now)
    if (daysUntilExpiry >= 0 && daysUntilExpiry <= 5) {
      const alreadySent = await checkIdempotency(estimate.estimateId, 'client-expiring-soon')
      if (!alreadySent) {
        results.push({
          estimateId: estimate.estimateId,
          check: 3,
          action: 'send',
          templateId: 'client-expiring-soon',
          recipientEmail: estimate.clientEmail,
          daysUntilExpiry,
        })
      }
    }
  }

  // Check 4: Expired today or yesterday, not accepted, no acceptance record
  if (estimate.expiresAt && !estimate.acceptedAt) {
    const daysOverdue = diffDays(now, toArizonaDate(estimate.expiresAt))
    if (daysOverdue >= 0 && daysOverdue <= 1) {
      const alreadySent = await checkIdempotency(estimate.estimateId, 'estimate-expired-internal')
      if (!alreadySent) {
        results.push({
          estimateId: estimate.estimateId,
          check: 4,
          action: 'mark_expired',
          templateId: 'estimate-expired-internal',
          recipientEmail: process.env.MARCO_EMAIL!,
          daysOverdue,
        })
      }
    }
  }

  // Check 5: Approved 30+ days ago, never sent to client
  if (estimate.approvedAt && !estimate.sentAt) {
    const daysSinceApproval = diffDays(now, toArizonaDate(estimate.approvedAt))
    if (daysSinceApproval >= 30) {
      const alreadySent = await checkIdempotency(estimate.estimateId, 'estimate-never-sent-internal')
      if (!alreadySent) {
        results.push({
          estimateId: estimate.estimateId,
          check: 5,
          action: 'send',
          templateId: 'estimate-never-sent-internal',
          recipientEmail: estimate.estimatorEmail ?? process.env.MARCO_EMAIL!,
          daysSinceApproval,
        })
      }
    }
  }

  return results
}
```

### Idempotency helper

```typescript
async function checkIdempotency(estimateId: string, templateId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('email_log')
    .select('id')
    .eq('estimate_id', estimateId)
    .eq('template_id', templateId)
    .not('status', 'in', '("failed","bounced")')
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return !!data
}
```

### Email dispatch

```typescript
async function dispatchEmail(
  estimate: EstimateForCron,
  result: CronCheckResult
): Promise<boolean> {
  const now = toArizonaDate(new Date())
  const daysSinceDelivery = estimate.sentAt
    ? diffDays(now, toArizonaDate(estimate.sentAt))
    : null

  try {
    await sendFollowUpEmail({
      templateId: result.templateId!,
      recipientEmail: result.recipientEmail!,
      estimate,
    })

    await supabase.from('email_log').insert({
      estimate_id: estimate.estimateId,
      template_id: result.templateId,
      recipient_email: result.recipientEmail,
      status: 'sent',
      sent_at: new Date().toISOString(),
      sent_at_days_after_delivery: daysSinceDelivery,
    })

    return true
  } catch (err) {
    console.error(`[cron] Failed to send ${result.templateId} for ${estimate.estimateId}:`, err)

    await supabase.from('email_log').insert({
      estimate_id: estimate.estimateId,
      template_id: result.templateId,
      recipient_email: result.recipientEmail,
      status: 'failed',
      error_message: err instanceof Error ? err.message : String(err),
      sent_at: new Date().toISOString(),
      sent_at_days_after_delivery: daysSinceDelivery,
    })

    return false
  }
}
```

### Mark estimate expired

```typescript
async function markEstimateExpired(estimateId: string): Promise<void> {
  const { error } = await supabase
    .from('estimates')
    .update({ review_status: 'expired' })
    .eq('id', estimateId)

  if (error) {
    console.error(`[cron] Failed to mark estimate ${estimateId} as expired:`, error)
    throw error
  }
}
```

### Arizona timezone utilities

```typescript
// src/lib/date/arizona.ts

/**
 * Return a Date representing midnight of the given date in America/Phoenix.
 * All day-diff logic operates on these truncated values to avoid fractional day errors.
 */
export function toArizonaDate(date: Date): Date {
  const az = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Phoenix',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
  // az is "MM/DD/YYYY"
  const [month, day, year] = az.split('/')
  return new Date(`${year}-${month}-${day}T00:00:00.000Z`)
}

/**
 * Difference in whole days between two Arizona-midnight dates.
 * diffDays(later, earlier) = positive number of days elapsed.
 */
export function diffDays(later: Date, earlier: Date): number {
  return Math.floor((later.getTime() - earlier.getTime()) / (1000 * 60 * 60 * 24))
}
```

---

## 5. TypeScript Types

### File: `src/types/cron.ts`

```typescript
export interface EstimateForCron {
  exportLinkId: string
  estimateId: string
  noAutoFollowup: boolean
  clientEmail: string
  sentAt: Date | null
  firstOpenedAt: Date | null
  expiresAt: Date | null
  reviewStatus: 'sent' | 'viewed' | 'expired'
  approvedAt: Date | null
  acceptedAt: Date | null
  clientName: string
  projectName: string
  estimatorEmail: string | null
}

export type CronCheckNumber = 1 | 2 | 3 | 4 | 5

export type CronAction = 'send' | 'mark_expired' | 'skip'

export interface CronCheckResult {
  estimateId: string
  check: CronCheckNumber
  action: CronAction
  templateId?: string
  recipientEmail?: string
  // Context fields (optional, for debugging)
  daysSinceSent?: number
  daysUntilExpiry?: number
  daysOverdue?: number
  daysSinceApproval?: number
}

export interface CronRunSummary {
  checked: number
  emailsSent: number
  errors: number
  durationMs: number
}
```

---

## 6. Database Query Patterns — All 5 Checks

All queries assume the cron runs **after** `loadActiveEstimates()` has already filtered to active estimates. These are the per-estimate SQL equivalents for reference and for direct Supabase queries/RPC usage.

### Check 1 — Not opened after 3 days

```sql
SELECT el.estimate_id
FROM export_links el
JOIN estimates e ON e.id = el.estimate_id
LEFT JOIN email_log log ON log.estimate_id = el.estimate_id
  AND log.template_id = 'client-reminder-3d'
  AND log.status NOT IN ('failed', 'bounced')
WHERE el.is_revoked = false
  AND el.no_auto_followup = false
  AND e.review_status IN ('sent', 'viewed')
  AND el.first_opened_at IS NULL
  AND el.sent_at IS NOT NULL
  AND (NOW() AT TIME ZONE 'America/Phoenix')::date
      - (el.sent_at AT TIME ZONE 'America/Phoenix')::date >= 3
  AND log.id IS NULL;
```

### Check 2 — Opened but not accepted after 7 days

```sql
SELECT el.estimate_id
FROM export_links el
JOIN estimates e ON e.id = el.estimate_id
LEFT JOIN email_log log ON log.estimate_id = el.estimate_id
  AND log.template_id = 'client-followup-7d'
  AND log.status NOT IN ('failed', 'bounced')
WHERE el.is_revoked = false
  AND el.no_auto_followup = false
  AND e.review_status IN ('sent', 'viewed')
  AND el.first_opened_at IS NOT NULL
  AND e.accepted_at IS NULL
  AND (NOW() AT TIME ZONE 'America/Phoenix')::date
      - (el.sent_at AT TIME ZONE 'America/Phoenix')::date >= 7
  AND log.id IS NULL;
```

### Check 3 — Expiring within 5 days

```sql
SELECT el.estimate_id,
       (e.expires_at AT TIME ZONE 'America/Phoenix')::date
         - (NOW() AT TIME ZONE 'America/Phoenix')::date AS days_until_expiry
FROM export_links el
JOIN estimates e ON e.id = el.estimate_id
LEFT JOIN email_log log ON log.estimate_id = el.estimate_id
  AND log.template_id = 'client-expiring-soon'
  AND log.status NOT IN ('failed', 'bounced')
WHERE el.is_revoked = false
  AND el.no_auto_followup = false
  AND e.review_status IN ('sent', 'viewed')
  AND e.accepted_at IS NULL
  AND e.expires_at IS NOT NULL
  AND (e.expires_at AT TIME ZONE 'America/Phoenix')::date
      - (NOW() AT TIME ZONE 'America/Phoenix')::date BETWEEN 0 AND 5
  AND log.id IS NULL;
```

### Check 4 — Expired today or yesterday

```sql
SELECT el.estimate_id
FROM export_links el
JOIN estimates e ON e.id = el.estimate_id
LEFT JOIN email_log log ON log.estimate_id = el.estimate_id
  AND log.template_id = 'estimate-expired-internal'
  AND log.status NOT IN ('failed', 'bounced')
WHERE el.is_revoked = false
  AND e.review_status IN ('sent', 'viewed')
  AND e.accepted_at IS NULL
  AND e.expires_at IS NOT NULL
  AND (NOW() AT TIME ZONE 'America/Phoenix')::date
      - (e.expires_at AT TIME ZONE 'America/Phoenix')::date BETWEEN 0 AND 1
  AND log.id IS NULL;
```

### Check 5 — Approved 30+ days ago, never sent

```sql
SELECT el.estimate_id, e.estimator_email
FROM export_links el
JOIN estimates e ON e.id = el.estimate_id
LEFT JOIN email_log log ON log.estimate_id = el.estimate_id
  AND log.template_id = 'estimate-never-sent-internal'
  AND log.status NOT IN ('failed', 'bounced')
WHERE el.is_revoked = false
  AND e.review_status IN ('sent', 'viewed')
  AND e.approved_at IS NOT NULL
  AND el.sent_at IS NULL
  AND (NOW() AT TIME ZONE 'America/Phoenix')::date
      - (e.approved_at AT TIME ZONE 'America/Phoenix')::date >= 30
  AND log.id IS NULL;
```

---

## 7. Email Template Integration

All templates live in `src/emails/` following the Phase 5 pattern.

| Check | Template ID | Template File | Recipient | Subject Line |
|---|---|---|---|---|
| 1 | `client-reminder-3d` | `src/emails/client-reminder-3d.tsx` | Client | "Still thinking it over? Your estimate is ready." |
| 2 | `client-followup-7d` | `src/emails/client-followup-7d.tsx` | Client | "Following up on your [project] estimate" |
| 3 | `client-expiring-soon` | `src/emails/client-expiring-soon.tsx` | Client | "Your estimate expires in [N] days" |
| 4 | `estimate-expired-internal` | `src/emails/estimate-expired-internal.tsx` | Marco | "Estimate expired: [project] – [client]" |
| 5 | `estimate-never-sent-internal` | `src/emails/estimate-never-sent-internal.tsx` | Estimator / Marco | "Approved estimate never sent: [project]" |

### `sendFollowUpEmail` dispatcher

```typescript
// src/lib/email/follow-ups.ts

import { Resend } from 'resend'
import ClientReminder3d from '@/emails/client-reminder-3d'
import ClientFollowup7d from '@/emails/client-followup-7d'
import ClientExpiringSoon from '@/emails/client-expiring-soon'
import EstimateExpiredInternal from '@/emails/estimate-expired-internal'
import EstimateNeverSentInternal from '@/emails/estimate-never-sent-internal'
import type { EstimateForCron } from '@/types/cron'

const resend = new Resend(process.env.RESEND_API_KEY)

const FROM = 'Saddlewood Contracting <estimates@mail.saddlewoodcontracting.com>'

const TEMPLATE_MAP: Record<
  string,
  (estimate: EstimateForCron) => { subject: string; react: React.ReactElement }
> = {
  'client-reminder-3d': (e) => ({
    subject: 'Still thinking it over? Your estimate is ready.',
    react: <ClientReminder3d estimate={e} />,
  }),
  'client-followup-7d': (e) => ({
    subject: `Following up on your ${e.projectName} estimate`,
    react: <ClientFollowup7d estimate={e} />,
  }),
  'client-expiring-soon': (e) => ({
    subject: `Your estimate expires soon`,
    react: <ClientExpiringSoon estimate={e} />,
  }),
  'estimate-expired-internal': (e) => ({
    subject: `Estimate expired: ${e.projectName} – ${e.clientName}`,
    react: <EstimateExpiredInternal estimate={e} />,
  }),
  'estimate-never-sent-internal': (e) => ({
    subject: `Approved estimate never sent: ${e.projectName}`,
    react: <EstimateNeverSentInternal estimate={e} />,
  }),
}

export async function sendFollowUpEmail({
  templateId,
  recipientEmail,
  estimate,
}: {
  templateId: string
  recipientEmail: string
  estimate: EstimateForCron
}): Promise<void> {
  const builder = TEMPLATE_MAP[templateId]
  if (!builder) throw new Error(`Unknown template: ${templateId}`)

  const { subject, react } = builder(estimate)

  const { error } = await resend.emails.send({
    from: FROM,
    to: recipientEmail,
    subject,
    react,
  })

  if (error) throw new Error(error.message)
}
```

---

## 8. `cron_runs` Table SQL

```sql
CREATE TABLE IF NOT EXISTS cron_runs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  checked_count INTEGER     NOT NULL DEFAULT 0,
  sent_count    INTEGER     NOT NULL DEFAULT 0,
  error_count   INTEGER     NOT NULL DEFAULT 0,
  duration_ms   INTEGER     NOT NULL DEFAULT 0,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for dashboard queries (most recent first)
CREATE INDEX idx_cron_runs_run_at ON cron_runs (run_at DESC);
```

---

## 9. Migration SQL — 3 New Columns on Existing Tables

```sql
-- Migration: phase-7-automation
-- Adds no_auto_followup to export_links
-- Adds template_id and sent_at_days_after_delivery to email_log

BEGIN;

-- export_links: per-estimate opt-out flag
ALTER TABLE export_links
  ADD COLUMN IF NOT EXISTS no_auto_followup BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN export_links.no_auto_followup IS
  'When true, the daily cron skips all automated follow-up emails for this estimate.';

-- email_log: template_id for idempotency
ALTER TABLE email_log
  ADD COLUMN IF NOT EXISTS template_id TEXT;

CREATE INDEX IF NOT EXISTS idx_email_log_estimate_template
  ON email_log (estimate_id, template_id)
  WHERE status NOT IN ('failed', 'bounced');

COMMENT ON COLUMN email_log.template_id IS
  'Identifies which cron email template triggered this log entry. Used for idempotency.';

-- email_log: days since delivery for debugging
ALTER TABLE email_log
  ADD COLUMN IF NOT EXISTS sent_at_days_after_delivery INTEGER;

COMMENT ON COLUMN email_log.sent_at_days_after_delivery IS
  'Number of days between the estimate send_at date and when this automated email fired.';

COMMIT;
```

**Run order:** Apply this migration before deploying the Phase 7 code. The cron route will fail gracefully (column not found) if run against an un-migrated DB, but the toggle UI will throw on save.

---

## 10. Follow-Up Toggle UI Spec

### Component: `AutoFollowupToggle`

**Location:** `src/components/estimate/AutoFollowupToggle.tsx`

**Render condition:** Only shown when `estimate.review_status` is `'sent'` or `'viewed'` (i.e., after the estimate has been dispatched to a client).

**UI:**
- Label: "Auto follow-up emails"
- Subtext: "Send automatic reminders and follow-ups to the client."
- Control: Toggle switch (use existing `Switch` component from shadcn/ui)
- Default: ON (`no_auto_followup = false`)
- When toggled OFF: show brief amber notice — "Automated emails are disabled for this estimate."

**State management:**
- Optimistic update on toggle (flip immediately, revert on API error)
- Debounce: no — fire the PATCH immediately on toggle

**API call:**

```typescript
// PATCH /api/estimates/[id]/follow-up-toggle
// Body: { no_auto_followup: boolean }
// Response: { success: true }
```

```typescript
// src/app/api/estimates/[id]/follow-up-toggle/route.ts

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const schema = z.object({ no_auto_followup: z.boolean() })

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const body = schema.safeParse(await request.json())
  if (!body.success) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { error } = await supabase
    .from('export_links')
    .update({ no_auto_followup: body.data.no_auto_followup })
    .eq('estimate_id', params.id)
    .eq('is_revoked', false)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
```

**Component:**

```typescript
// src/components/estimate/AutoFollowupToggle.tsx
'use client'

import { useState } from 'react'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'

interface Props {
  estimateId: string
  initialValue: boolean
}

export function AutoFollowupToggle({ estimateId, initialValue }: Props) {
  const [enabled, setEnabled] = useState(!initialValue)
  const [saving, setSaving] = useState(false)

  async function handleToggle(checked: boolean) {
    setEnabled(checked)
    setSaving(true)
    try {
      const res = await fetch(`/api/estimates/${estimateId}/follow-up-toggle`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ no_auto_followup: !checked }),
      })
      if (!res.ok) throw new Error('Save failed')
    } catch {
      setEnabled(!checked) // revert on error
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-3">
        <Switch
          id="auto-followup"
          checked={enabled}
          onCheckedChange={handleToggle}
          disabled={saving}
        />
        <Label htmlFor="auto-followup" className="text-sm font-medium">
          Auto follow-up emails
        </Label>
      </div>
      <p className="text-xs text-muted-foreground pl-[52px]">
        {enabled
          ? 'Automatic reminders and follow-ups are active.'
          : 'Automated emails are disabled for this estimate.'}
      </p>
    </div>
  )
}
```

**Where to add it:** In the estimate detail page (`src/app/(portal)/estimates/[id]/page.tsx`), inside the "Sent / Viewed" status section block. Pass `estimate.exportLink.no_auto_followup` as `initialValue`.

---

## 11. How to Test the Cron Locally

### Option A — Vercel CLI (recommended)

```bash
# Install Vercel CLI
npm i -g vercel

# Link project
vercel link

# Run dev server with cron support (--cron flag available on Vercel CLI 32+)
vercel dev
```

Vercel CLI will invoke `GET /api/cron/follow-ups` at the schedule. Watch the terminal output.

### Option B — `curl` simulation

```bash
# Start dev server
pnpm dev

# Fire the cron endpoint directly
curl -X GET http://localhost:3000/api/cron/follow-ups \
  -H "Authorization: Bearer $(grep CRON_SECRET .env.local | cut -d= -f2)"
```

Expected response (if DB has data):
```json
{ "checked": 5, "emailsSent": 2, "errors": 0, "durationMs": 312 }
```

### Option C — Unit test the check logic

Because `runAllChecks()` is a pure function against an `EstimateForCron` object, test it without hitting the DB:

```typescript
// src/__tests__/cron/checks.test.ts
import { runAllChecks } from '@/lib/cron/checks' // extract pure logic to lib

const baseEstimate: EstimateForCron = {
  exportLinkId: 'el-1',
  estimateId: 'est-1',
  noAutoFollowup: false,
  clientEmail: 'client@example.com',
  sentAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000), // 4 days ago
  firstOpenedAt: null,
  expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 days from now
  reviewStatus: 'sent',
  approvedAt: null,
  acceptedAt: null,
  clientName: 'Test Client',
  projectName: 'Test Project',
  estimatorEmail: 'estimator@example.com',
}

test('Check 1 fires when not opened after 3 days', async () => {
  const results = await runAllChecks(baseEstimate)
  expect(results.some(r => r.templateId === 'client-reminder-3d')).toBe(true)
})

test('Check 3 fires when expiring within 5 days', async () => {
  const results = await runAllChecks(baseEstimate)
  expect(results.some(r => r.templateId === 'client-expiring-soon')).toBe(true)
})
```

### Test data setup SQL

```sql
-- Seed 5 estimates covering all 5 cron checks
-- Run against dev/staging Supabase

INSERT INTO estimates (id, project_name, client_name, review_status, approved_at, accepted_at, expires_at)
VALUES
  -- Check 1: Sent 4 days ago, never opened
  ('test-check-1', 'Check 1 Project', 'Alice Test', 'sent', NULL, NULL, NOW() + INTERVAL '14 days'),
  -- Check 2: Sent 8 days ago, opened, not accepted
  ('test-check-2', 'Check 2 Project', 'Bob Test', 'viewed', NULL, NULL, NOW() + INTERVAL '14 days'),
  -- Check 3: Expiring in 3 days, not accepted
  ('test-check-3', 'Check 3 Project', 'Carol Test', 'sent', NULL, NULL, NOW() + INTERVAL '3 days'),
  -- Check 4: Expired yesterday, not accepted
  ('test-check-4', 'Check 4 Project', 'Dave Test', 'sent', NULL, NULL, NOW() - INTERVAL '1 day'),
  -- Check 5: Approved 35 days ago, never sent
  ('test-check-5', 'Check 5 Project', 'Eve Test', 'sent', NOW() - INTERVAL '35 days', NULL, NOW() + INTERVAL '14 days');

INSERT INTO export_links (id, estimate_id, client_email, is_revoked, no_auto_followup, sent_at, first_opened_at)
VALUES
  ('el-check-1', 'test-check-1', 'alice@example.com', false, false, NOW() - INTERVAL '4 days', NULL),
  ('el-check-2', 'test-check-2', 'bob@example.com',   false, false, NOW() - INTERVAL '8 days', NOW() - INTERVAL '6 days'),
  ('el-check-3', 'test-check-3', 'carol@example.com', false, false, NOW() - INTERVAL '5 days', NOW() - INTERVAL '4 days'),
  ('el-check-4', 'test-check-4', 'dave@example.com',  false, false, NOW() - INTERVAL '10 days', NULL),
  ('el-check-5', 'test-check-5', 'eve@example.com',   false, false, NULL, NULL);
```

After seeding, call the cron endpoint via `curl`. Verify:
- `email_log` has 5 new rows with correct `template_id` values
- `cron_runs` has a new row with `sent_count = 5` (or `4` + `1` mark_expired)
- estimate `test-check-4` has `review_status = 'expired'`
- Running the cron a second time produces no additional `email_log` rows (idempotency)

---

## 12. Monitoring Approach

### Knowing if cron ran

1. **`cron_runs` table** — primary source. After each run, a row is inserted. Check for today's run:
   ```sql
   SELECT * FROM cron_runs
   WHERE run_at > NOW() - INTERVAL '25 hours'
   ORDER BY run_at DESC
   LIMIT 5;
   ```
   If no row exists for today, the cron did not fire.

2. **Vercel Dashboard** → Project → Cron Jobs tab → shows last invocation time and response status.

3. **Vercel Function Logs** → filter by `/api/cron/follow-ups` → check for errors.

### Debugging a missed email

Step-by-step:

1. Check `cron_runs` for the expected run date — confirm the cron fired.
2. Check `email_log` for the estimate + template combination:
   ```sql
   SELECT * FROM email_log
   WHERE estimate_id = '[estimate-id]'
   ORDER BY sent_at DESC;
   ```
3. If a row exists with `status = 'failed'`, check `error_message` column.
4. If no row exists, check whether `no_auto_followup = true` on the `export_links` row.
5. Check whether the estimate still had the right `review_status` when the cron ran.
6. Re-run the cron manually via `curl` with the dev CRON_SECRET to reproduce.

### Alerting (optional enhancement)

In `dispatchEmail()`, if `errorCount` exceeds 3 for a single run, consider sending a Slack webhook or email to Marco. Not in Phase 7 scope but add a `// TODO:` comment.

---

## 13. Vercel Cron Limits

| Limit | Hobby | Pro |
|---|---|---|
| Cron jobs per project | 2 | 40 |
| Max invocations per day per job | 2 | 24 |
| Max execution time (Serverless) | 60s | 60s |
| Max execution time (Edge) | ~25s CPU | ~25s CPU |
| Max execution time (Fluid compute) | Up to 800s | Up to 800s |

**This project uses Pro.** The `0 15 * * *` schedule = 1 invocation/day, well within limits.

**If cron times out on a large dataset:**

The 60s limit applies to standard Serverless Functions. If the estimate count grows large (500+), looping through every estimate with individual DB queries per check will time out.

**Mitigation strategies (implement if `checkedCount` regularly exceeds 100):**

1. **Batch the DB queries.** Replace per-estimate idempotency lookups with a single query that pre-fetches all `email_log` rows for active estimates, then filter in-memory:
   ```typescript
   const { data: sentLogs } = await supabase
     .from('email_log')
     .select('estimate_id, template_id')
     .in('estimate_id', estimateIds)
     .not('status', 'in', '("failed","bounced")')
   const sentSet = new Set(sentLogs.map(r => `${r.estimate_id}:${r.template_id}`))
   // Then: sentSet.has(`${estimateId}:${templateId}`) replaces DB round-trip
   ```

2. **Enable Fluid Compute** on the cron route in `vercel.json`:
   ```json
   {
     "functions": {
       "src/app/api/cron/follow-ups/route.ts": {
         "maxDuration": 300
       }
     }
   }
   ```
   Fluid compute allows up to 800s on Pro but requires a streaming or keep-alive approach.

3. **Paginate the estimates** with a cursor and store progress in a `cron_state` table (overkill until scale demands it).

---

## 14. Testing Checklist

Run after seeding test data (see Section 11):

- [ ] **Auth: reject unauthenticated request**
  - `curl http://localhost:3000/api/cron/follow-ups` (no header) → expect `401`
  - `curl -H "Authorization: Bearer wrongsecret" ...` → expect `401`

- [ ] **Check 1 fires correctly**
  - Estimate `test-check-1`: `sent_at` = 4 days ago, `first_opened_at` = NULL
  - After cron run: `email_log` row with `template_id = 'client-reminder-3d'`, `status = 'sent'`

- [ ] **Check 2 fires correctly**
  - Estimate `test-check-2`: `sent_at` = 8 days ago, `first_opened_at` set, `accepted_at` = NULL
  - After cron run: `email_log` row with `template_id = 'client-followup-7d'`, `status = 'sent'`

- [ ] **Check 3 fires correctly**
  - Estimate `test-check-3`: `expires_at` = 3 days from now, `accepted_at` = NULL
  - After cron run: `email_log` row with `template_id = 'client-expiring-soon'`, `status = 'sent'`

- [ ] **Check 4 fires correctly**
  - Estimate `test-check-4`: `expires_at` = yesterday, `accepted_at` = NULL
  - After cron run: `email_log` row with `template_id = 'estimate-expired-internal'`, `status = 'sent'`
  - `estimates.review_status` for `test-check-4` = `'expired'`

- [ ] **Check 5 fires correctly**
  - Estimate `test-check-5`: `approved_at` = 35 days ago, `sent_at` = NULL
  - After cron run: `email_log` row with `template_id = 'estimate-never-sent-internal'`, `status = 'sent'`

- [ ] **Idempotency: second cron run sends nothing new**
  - Run cron twice. `email_log` count is the same after the second run.
  - `cron_runs` has 2 rows, second has `sent_count = 0`.

- [ ] **Opt-out respected**
  - Set `no_auto_followup = true` on one export_link. Rerun cron. No new email_log row for that estimate.

- [ ] **Failed send does not block others**
  - Temporarily set `RESEND_API_KEY` to an invalid value for one test.
  - Cron response still includes `{ emailsSent: N-1, errors: 1 }`.
  - Failed row in `email_log` with `status = 'failed'` and `error_message` populated.
  - Next cron run retries it (no idempotency block on `failed` rows).

- [ ] **Toggle UI saves correctly**
  - In the estimate review page, toggle OFF → PATCH fires → `no_auto_followup = true` in DB.
  - Toggle back ON → `no_auto_followup = false` in DB.
  - Network failure → toggle reverts to previous state.

- [ ] **`cron_runs` table populated**
  - After each test run, a new row exists with correct `checked_count`, `sent_count`, `error_count`, `duration_ms`.

- [ ] **Arizona timezone edge case**
  - Seed an estimate with `sent_at` exactly 2 days 23 hours ago (UTC).
  - Confirm Check 1 does NOT fire (not yet 3 full Arizona days).
  - Seed an estimate with `sent_at` exactly 3 days ago in Arizona time (even if slightly under 72 hours UTC).
  - Confirm Check 1 DOES fire.

---

## ENV Vars Required for Phase 7

```
# Already present (from prior phases):
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
RESEND_API_KEY=

# New for Phase 7:
CRON_SECRET=<generate with: openssl rand -hex 32>
MARCO_EMAIL=marco@saddlewoodcontracting.com
```

Set `CRON_SECRET` in Vercel Dashboard → Project Settings → Environment Variables. Vercel automatically injects it as the `Authorization: Bearer` header when invoking cron routes — no manual passing required.

---

## File Checklist (New Files to Create)

```
src/app/api/cron/follow-ups/route.ts
src/app/api/estimates/[id]/follow-up-toggle/route.ts
src/lib/cron/checks.ts          (extracted pure check logic for unit tests)
src/lib/date/arizona.ts         (toArizonaDate, diffDays)
src/lib/email/follow-ups.ts     (sendFollowUpEmail dispatcher)
src/types/cron.ts
src/emails/client-reminder-3d.tsx
src/emails/client-followup-7d.tsx
src/emails/client-expiring-soon.tsx
src/emails/estimate-expired-internal.tsx
src/emails/estimate-never-sent-internal.tsx
src/components/estimate/AutoFollowupToggle.tsx
vercel.json                     (add crons array — may already exist)
supabase/migrations/phase-7-automation.sql
```
