# Phase 8 — Bid Log & Analytics: Execution Plan

**Status:** Ready for execution
**Target project:** Saddlewood Contracting LLC — internal estimate review portal
**Stack:** Next.js 16.1.6 (App Router), React 19, TypeScript strict, Tailwind CSS v4, Supabase

---

## 1. Phase Goal

Add complete bid lifecycle tracking, win/loss analysis, and business intelligence to the portal so Marco can see at a glance how the business is performing and where bids are being lost. After Phase 8, every estimate has a full activity timeline, the dashboard shows live pipeline metrics, and the `/internal/bid-log` page gives Marco a filterable, sortable history of every bid he has ever sent.

---

## 2. Success Criteria

- [ ] Status lifecycle covers all transitions: `draft` → `in_review` → `approved` → `sent` → `accepted` / `declined` / `expired` → `won` / `lost`
- [ ] Status dropdown on estimate card (dashboard) and review page updates `bid_log` and `estimates` tables via PATCH
- [ ] "Mark Won" taps produce a confirmation toast and archive the estimate
- [ ] "Mark Lost" opens a modal capturing loss reason, optional competitor price, optional notes — all saved to `bid_log`
- [ ] Every status change writes an `estimate_activity` row
- [ ] Activity timeline renders on the review page as a collapsible section — events display in chronological order with formatted timestamps
- [ ] Per-estimate metrics card shows all 4 timing metrics and total client view count
- [ ] Dashboard metrics panel renders 4 metric cards with correct values: Win Rate, Pipeline, Pending, Avg Time to Decision
- [ ] Dashboard metrics panel does NOT overflow at 390px — no horizontal scroll, no cut-off values
- [ ] `/internal/bid-log` page loads and displays all estimates
- [ ] Bid log filters (status, date range, project type, trade scope) reduce the displayed list correctly
- [ ] Bid log sorts by amount, date, and status without errors
- [ ] Bid log shows card view on mobile, table view on desktop (md: breakpoint)
- [ ] Loss pattern summary renders at bottom of bid log with accurate GROUP BY counts
- [ ] "Copy for Joist" section appears only on `won` estimates — formatted text copies to clipboard
- [ ] Archive search queries `job_name`, `client_name`, `address` via Supabase `ilike`
- [ ] Filter chips on dashboard correctly filter by status and date range
- [ ] `estimate_activity` table exists and has correct schema
- [ ] `bid_log` table has `loss_reason`, `competitor_price`, `loss_notes` columns
- [ ] TypeScript strict — zero `any` types, zero `ts-ignore`
- [ ] `npm run build` exits 0

---

## 3. Estimate Status Lifecycle

```
                          ┌──────────────────────────────────────────────────┐
                          │                 STATUS MACHINE                   │
                          └──────────────────────────────────────────────────┘

  [Pipeline Push]
       │
       ▼
  ┌─────────┐   Marco opens
  │  draft  │ ──────────────────────────────▶ ┌───────────┐
  └─────────┘                                 │ in_review │
       │                                      └───────────┘
       │  (auto on push)                           │
       │                                           │ Marco approves
       │                                           ▼
       │                                      ┌──────────┐
       │                                      │ approved │
       │                                      └──────────┘
       │                                           │
       │                            ┌──────────────┘
       │                            │ Estimator sends to client
       │                            ▼
       │                       ┌────────┐
       │                       │  sent  │
       │                       └────────┘
       │                          /|\
       │               ┌──────────┤├──────────┐
       │               ▼          │           ▼
       │          ┌──────────┐    │      ┌─────────┐
       │          │ accepted │    │      │ declined│
       │          └──────────┘    │      └─────────┘
       │               │          │           │
       │               │          ▼           │
       │               │     ┌─────────┐      │
       │               │     │ expired │      │
       │               │     └─────────┘      │
       │               │          │           │
       │         ┌─────┘          │           └────┐
       │         ▼                │                ▼
       │      ┌─────┐             │           ┌──────┐
       │      │ won │             │           │ lost │
       │      └─────┘             │           └──────┘
       │                         │
       └─── (rejected by Marco) ─┴─ also sets 'lost', bid_log.loss_reason = 'Did not bid'

Notes:
  - 'in_review' is set automatically when Marco first opens the review page
    (write estimate_activity event 'reviewed' on first open, use created_at of that event)
  - 'approved' allows manual revert to 'in_review' if needed (edge case)
  - 'expired' is set by Vercel Cron (Phase 7 cron also manages this)
  - 'won' and 'lost' are FINAL states — no further transitions
  - Any status change writes to estimate_activity with event_type = 'status_updated'
  - 'won' additionally writes event_type = 'won'
  - 'lost' additionally writes event_type = 'lost' with metadata: { loss_reason, competitor_price, loss_notes }
```

---

## 4. File Structure — New Files This Phase

```
src/
├── app/
│   ├── (portal)/
│   │   └── internal/
│   │       ├── page.tsx                        # dashboard — ADD metrics panel + search bar at top
│   │       ├── bid-log/
│   │       │   └── page.tsx                    # NEW — RSC — bid log list page
│   │       └── estimates/
│   │           └── [id]/
│   │               └── page.tsx                # MODIFY — add activity log + metrics card + joist section
│   │
│   └── api/
│       ├── estimates/
│       │   └── [id]/
│       │       ├── route.ts                    # MODIFY — add 'won' and 'lost' actions
│       │       └── activity/
│       │           └── route.ts                # NEW — GET estimate_activity for this estimate
│       ├── bid-log/
│       │   ├── route.ts                        # NEW — GET all bid_log rows (filterable)
│       │   └── [logId]/
│       │       └── route.ts                    # MODIFY — PATCH loss fields (already exists)
│       └── metrics/
│           └── route.ts                        # NEW — GET dashboard aggregate metrics
│
├── components/
│   ├── dashboard/
│   │   ├── MetricsPanel.tsx                    # NEW 'use client' — 4-card metrics row
│   │   ├── MetricCard.tsx                      # NEW RSC-safe — single metric card
│   │   ├── StatusDropdown.tsx                  # NEW 'use client' — inline status changer on card
│   │   └── ArchiveSearch.tsx                   # NEW 'use client' — search + filter chips
│   │
│   ├── estimate/
│   │   ├── EstimateActivityLog.tsx             # NEW 'use client' — collapsible timeline
│   │   ├── ActivityEvent.tsx                   # NEW RSC-safe — single event row renderer
│   │   ├── EstimateMetricsCard.tsx             # NEW 'use client' — collapsible per-estimate metrics
│   │   ├── StatusQuickActions.tsx              # NEW 'use client' — Won/Lost buttons on review page
│   │   ├── LossReasonModal.tsx                 # NEW 'use client' — loss capture modal
│   │   └── JoistOutputPanel.tsx                # NEW 'use client' — copy-for-joist section
│   │
│   └── bid-log/
│       ├── BidLogTable.tsx                     # NEW 'use client' — desktop sortable table
│       ├── BidLogCard.tsx                      # NEW RSC-safe — mobile card per estimate
│       ├── BidLogFilters.tsx                   # NEW 'use client' — filter/sort controls
│       └── LossPatternSummary.tsx              # NEW 'use client' — GROUP BY summary at bottom
│
└── lib/
    ├── estimates/
    │   └── activity.ts                         # NEW — writeActivity() helper, event type map
    └── bid-log/
        ├── queries.ts                          # NEW — Supabase query fns for bid log
        └── types.ts                            # NEW — BidLogRow, ActivityEvent, LossReason types
```

---

## 5. Status Update UI Components

### 5a. On the Dashboard Card (EstimateCard.tsx — existing, modify)

Add a `StatusDropdown` component inside the card footer. On mobile it is a native `<select>` styled to match brand. On desktop it is a custom dropdown using Radix UI Select or a simple div-based approach (no new packages — use native `<select>` with CSS to keep bundle lean).

**Allowed transitions visible in dropdown:**
- If current status is `draft`: show `in_review`
- If current status is `in_review`: show `approved`, `draft`
- If current status is `approved`: show `sent`, `in_review`
- If current status is `sent`: show `accepted`, `declined`, `expired`
- If current status is `accepted`: show `won`
- If current status is `declined` or `expired`: show `lost`
- Terminal states (`won`, `lost`): read-only label, no dropdown

When Marco selects `won`: show a `window.confirm` dialog ("Mark as Won? This will archive the estimate."). On confirm, call `PATCH /api/estimates/[id]` with `{ action: 'won' }`.

When Marco selects `lost`: open `LossReasonModal` (see §6).

All other transitions: call `PATCH /api/estimates/[id]` with `{ action: 'update_status', status: '<new_status>' }` directly, show toast on success.

### 5b. On the Review Page (add StatusQuickActions.tsx)

Below the summary header on the review page, render quick-action buttons based on current status:

```
Status: sent
┌──────────────────────────────────────────┐
│  [✓ Mark Won]        [✗ Mark Lost]       │
│   (green, outline)    (red, outline)     │
└──────────────────────────────────────────┘

Status: accepted
┌──────────────────────────────────────────┐
│  [✓ Mark Won]                            │
└──────────────────────────────────────────┘

Status: won or lost
Shows read-only badge: "WON · May 14, 2026" or "LOST · Price too high"
```

Both buttons are 44px minimum height, full width on mobile, auto width on desktop.

---

## 6. Loss Reason Modal — Full Spec

File: `src/components/estimate/LossReasonModal.tsx`

```typescript
'use client'

import { useState } from 'react'
import { createBrowserClient } from '@/lib/supabase/client'

export type LossReason =
  | 'price_too_high'
  | 'timeline_conflict'
  | 'went_with_existing'
  | 'no_decision'
  | 'client_cancelled'
  | 'out_bid'
  | 'scope_changed'
  | 'other'

const LOSS_REASON_LABELS: Record<LossReason, string> = {
  price_too_high:    'Price too high',
  timeline_conflict: 'Timeline conflict',
  went_with_existing:'Went with existing contractor/sub',
  no_decision:       'No decision made',
  client_cancelled:  'Client cancelled project',
  out_bid:           'Out-bid by competitor',
  scope_changed:     'Scope changed (no longer needed)',
  other:             'Other',
}

interface Props {
  estimateId: string
  estimateName: string
  onClose: () => void
  onConfirm: () => void  // called after successful save
}

export function LossReasonModal({ estimateId, estimateName, onClose, onConfirm }: Props) {
  const [reason, setReason] = useState<LossReason>('price_too_high')
  const [competitorPrice, setCompetitorPrice] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    const res = await fetch(`/api/estimates/${estimateId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'lost',
        lossReason: reason,
        competitorPrice: competitorPrice ? parseFloat(competitorPrice) : null,
        lossNotes: notes.trim() || null,
      }),
    })

    setSaving(false)

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body.error ?? 'Failed to save. Try again.')
      return
    }

    onConfirm()
  }

  return (
    // Full-screen overlay, centered modal card
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-end md:items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="
        w-full max-w-md
        bg-[--color-background] rounded-t-2xl md:rounded-2xl
        p-6 shadow-2xl
      ">
        <h2 className="font-[--font-fraunces] text-xl text-[--color-charcoal] mb-1">
          Mark as Lost
        </h2>
        <p className="text-sm text-[--color-charcoal]/60 mb-5">{estimateName}</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Loss Reason */}
          <div>
            <label className="block text-sm font-medium text-[--color-charcoal] mb-1.5">
              Loss reason <span className="text-red-500">*</span>
            </label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value as LossReason)}
              className="
                w-full rounded-lg border border-[--color-stone]
                bg-white px-3 py-2.5 text-sm text-[--color-charcoal]
                focus:outline-none focus:ring-2 focus:ring-[--color-teal]
                min-h-[44px]
              "
            >
              {(Object.entries(LOSS_REASON_LABELS) as [LossReason, string][]).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          {/* Free text if 'other' */}
          {reason === 'other' && (
            <div>
              <label className="block text-sm font-medium text-[--color-charcoal] mb-1.5">
                Describe the reason
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="What happened?"
                className="
                  w-full rounded-lg border border-[--color-stone]
                  bg-white px-3 py-2.5 text-sm
                  focus:outline-none focus:ring-2 focus:ring-[--color-teal]
                  min-h-[44px]
                "
              />
            </div>
          )}

          {/* Competitor price (optional) */}
          <div>
            <label className="block text-sm font-medium text-[--color-charcoal] mb-1.5">
              Competitor price <span className="text-[--color-charcoal]/40 font-normal">(optional)</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[--color-charcoal]/50 text-sm">$</span>
              <input
                type="number"
                inputMode="decimal"
                value={competitorPrice}
                onChange={(e) => setCompetitorPrice(e.target.value)}
                placeholder="195,000"
                className="
                  w-full rounded-lg border border-[--color-stone]
                  bg-white pl-7 pr-3 py-2.5 text-sm
                  focus:outline-none focus:ring-2 focus:ring-[--color-teal]
                  min-h-[44px]
                "
              />
            </div>
          </div>

          {/* Notes (optional, only if reason !== 'other') */}
          {reason !== 'other' && (
            <div>
              <label className="block text-sm font-medium text-[--color-charcoal] mb-1.5">
                Notes <span className="text-[--color-charcoal]/40 font-normal">(optional)</span>
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Anything else to note about this loss?"
                className="
                  w-full rounded-lg border border-[--color-stone]
                  bg-white px-3 py-2.5 text-sm resize-none
                  focus:outline-none focus:ring-2 focus:ring-[--color-teal]
                "
              />
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="
                flex-1 py-3 rounded-xl border border-[--color-stone]
                text-sm font-medium text-[--color-charcoal]
                active:scale-[0.98] transition-transform
              "
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="
                flex-1 py-3 rounded-xl
                bg-red-600 text-white text-sm font-semibold
                disabled:opacity-50
                active:scale-[0.98] transition-transform
              "
            >
              {saving ? 'Saving…' : 'Mark as Lost'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
```

---

## 7. Activity Timeline Component

File: `src/components/estimate/EstimateActivityLog.tsx`

### 7a. Data types

`src/lib/bid-log/types.ts`:

```typescript
// Extend existing EstimateStatus type from Phase 3
export type EstimateStatus =
  | 'draft'
  | 'in_review'
  | 'approved'
  | 'sent'
  | 'accepted'
  | 'declined'
  | 'expired'
  | 'won'
  | 'lost'

export type ActivityEventType =
  | 'created'
  | 'reviewed'
  | 'approved'
  | 'changes_requested'
  | 'rejected'
  | 'sent_to_client'
  | 'client_opened'
  | 'client_accepted'
  | 'client_declined'
  | 'status_updated'
  | 'comment_added'
  | 'won'
  | 'lost'

export interface ActivityEvent {
  id: string
  estimate_id: string
  event_type: ActivityEventType
  actor_email: string | null    // null for system events
  metadata: Record<string, unknown> | null
  ip_address: string | null
  user_agent: string | null
  created_at: string            // ISO timestamp
}

export type LossReason =
  | 'price_too_high'
  | 'timeline_conflict'
  | 'went_with_existing'
  | 'no_decision'
  | 'client_cancelled'
  | 'out_bid'
  | 'scope_changed'
  | 'other'

export interface BidLogRow {
  id: string
  estimate_id: string
  job_id: string
  status: EstimateStatus
  submitted_amount: number | null
  loss_reason: LossReason | null
  competitor_price: number | null
  loss_notes: string | null
  created_at: string
  updated_at: string
  // Joined from estimates / jobs for display
  job_name?: string
  client_name?: string
  address?: string
  project_type?: string
  trade_scope?: string
  bid_due_date?: string
  sent_at?: string
  accepted_at?: string
  won_at?: string
  lost_at?: string
  client_view_count?: number
}

export interface DashboardMetrics {
  winRate: number           // 0-100 percentage
  winRateFraction: string   // "4/9 sent"
  pipelineValue: number     // sum of active bids
  pendingCount: number      // estimates needing review
  avgDaysToDecision: number // median
}
```

### 7b. writeActivity() helper

`src/lib/estimates/activity.ts`:

```typescript
import { createServerClient } from '@/lib/supabase/server'
import type { ActivityEventType } from '@/lib/bid-log/types'

export async function writeActivity({
  estimateId,
  eventType,
  actorEmail,
  metadata,
  ipAddress,
  userAgent,
}: {
  estimateId: string
  eventType: ActivityEventType
  actorEmail?: string
  metadata?: Record<string, unknown>
  ipAddress?: string
  userAgent?: string
}) {
  const supabase = await createServerClient()
  const { error } = await supabase.from('estimate_activity').insert({
    estimate_id: estimateId,
    event_type: eventType,
    actor_email: actorEmail ?? null,
    metadata: metadata ?? null,
    ip_address: ipAddress ?? null,
    user_agent: userAgent ?? null,
    created_at: new Date().toISOString(),
  })
  if (error) {
    // Log but do not throw — activity write failure should never block the main action
    console.error('[writeActivity] failed:', error.message, { estimateId, eventType })
  }
}
```

### 7c. EstimateActivityLog component

`src/components/estimate/EstimateActivityLog.tsx`:

```typescript
'use client'

import { useState, useEffect } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import type { ActivityEvent, ActivityEventType } from '@/lib/bid-log/types'

interface Props {
  estimateId: string
  estimateName: string
}

// Human-readable label for each event type
function formatEventLabel(event: ActivityEvent): string {
  const meta = event.metadata ?? {}
  const actor = event.actor_email
    ? event.actor_email.split('@')[0]  // "marco" not full email
    : 'System'

  switch (event.event_type) {
    case 'created':
      return 'Created by pipeline'
    case 'reviewed':
      return `${actor} reviewed ($${(meta.grand_total as number | undefined)?.toLocaleString() ?? '—'})`
    case 'approved':
      return meta.note
        ? `${actor} approved — "${meta.note}"`
        : `${actor} approved`
    case 'changes_requested':
      return `${actor} requested changes`
    case 'rejected':
      return `${actor} rejected — not bidding`
    case 'sent_to_client':
      return `Sent to ${meta.recipient_email ?? 'client'}`
    case 'client_opened': {
      const count = meta.view_count as number | undefined
      return count && count > 1
        ? `Client opened (${ordinal(count)} view)`
        : 'Client opened (1st view)'
    }
    case 'client_accepted':
      return meta.signer_name
        ? `Client accepted — "${meta.signer_name}" signed`
        : 'Client accepted'
    case 'client_declined':
      return 'Client declined'
    case 'status_updated':
      return `Status changed to ${meta.new_status ?? '—'} by ${actor}`
    case 'comment_added':
      return `Comment by ${actor}`
    case 'won':
      return `Marked Won by ${actor}`
    case 'lost': {
      const reason = LOSS_REASON_SHORT[meta.loss_reason as string] ?? meta.loss_reason
      return reason ? `Marked Lost by ${actor} — ${reason}` : `Marked Lost by ${actor}`
    }
    default:
      return event.event_type.replace(/_/g, ' ')
  }
}

const LOSS_REASON_SHORT: Record<string, string> = {
  price_too_high:    'Price too high',
  timeline_conflict: 'Timeline',
  went_with_existing:'Existing contractor',
  no_decision:       'No decision',
  client_cancelled:  'Client cancelled',
  out_bid:           'Out-bid',
  scope_changed:     'Scope changed',
  other:             'Other',
}

function ordinal(n: number) {
  const s = ['th','st','nd','rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0])
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

export function EstimateActivityLog({ estimateId, estimateName }: Props) {
  const [open, setOpen] = useState(false)
  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    if (events.length > 0) return  // already fetched
    setLoading(true)
    fetch(`/api/estimates/${estimateId}/activity`)
      .then((r) => r.json())
      .then((data: { events: ActivityEvent[] }) => setEvents(data.events ?? []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [open, estimateId, events.length])

  return (
    <section className="border border-[--color-stone] rounded-xl overflow-hidden">
      {/* Toggle header */}
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="
          w-full flex items-center justify-between
          px-4 py-3.5 bg-white
          text-sm font-semibold text-[--color-charcoal]
          active:bg-[--color-background] transition-colors
        "
      >
        <span>Activity Log</span>
        {open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
      </button>

      {open && (
        <div className="bg-[--color-background] px-4 pb-4 pt-2">
          {/* Estimate name header */}
          <p className="text-xs font-mono uppercase tracking-widest text-[--color-charcoal]/50 mb-3">
            Activity — {estimateName}
          </p>

          {loading && (
            <p className="text-sm text-[--color-charcoal]/50 py-4 text-center">Loading…</p>
          )}

          {!loading && events.length === 0 && (
            <p className="text-sm text-[--color-charcoal]/50 py-4 text-center">No activity yet.</p>
          )}

          {!loading && events.length > 0 && (
            <ol className="relative border-l border-[--color-stone] pl-4 space-y-3">
              {events.map((event) => (
                <li key={event.id} className="relative">
                  {/* Timeline dot */}
                  <span className="
                    absolute -left-[1.15rem] top-1
                    w-2 h-2 rounded-full
                    bg-[--color-teal] ring-2 ring-[--color-background]
                  " />
                  <time className="block text-[11px] text-[--color-charcoal]/40 mb-0.5 font-mono">
                    {formatTimestamp(event.created_at)}
                  </time>
                  <p className="text-sm text-[--color-charcoal]">
                    {formatEventLabel(event)}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </section>
  )
}
```

---

## 8. Per-Estimate Metrics Card

File: `src/components/estimate/EstimateMetricsCard.tsx`

### 8a. Data fetching query

Metrics are computed server-side from `estimate_activity`. Fetch inside the review page's RSC and pass as props.

`src/lib/estimates/queries.ts` (add to existing file):

```typescript
export async function getEstimateMetrics(estimateId: string) {
  const supabase = await createServerClient()

  // Fetch all activity events for this estimate
  const { data: events, error } = await supabase
    .from('estimate_activity')
    .select('event_type, created_at, metadata')
    .eq('estimate_id', estimateId)
    .order('created_at', { ascending: true })

  if (error) throw error

  const find = (type: string) =>
    events?.find((e) => e.event_type === type)?.created_at ?? null

  const created        = find('created')
  const reviewed       = find('reviewed')
  const sentToClient   = find('sent_to_client')
  const accepted       = find('client_accepted') ?? find('client_declined')
  const approved       = find('approved')

  const diffDays = (a: string | null, b: string | null): number | null => {
    if (!a || !b) return null
    return Math.round((new Date(b).getTime() - new Date(a).getTime()) / (1000 * 60 * 60 * 24))
  }
  const diffHours = (a: string | null, b: string | null): number | null => {
    if (!a || !b) return null
    return Math.round((new Date(b).getTime() - new Date(a).getTime()) / (1000 * 60 * 60))
  }

  const clientViewCount = events?.filter((e) => e.event_type === 'client_opened').length ?? 0

  // Days span from first open to last open
  const openEvents = events?.filter((e) => e.event_type === 'client_opened') ?? []
  const firstOpen  = openEvents[0]?.created_at ?? null
  const lastOpen   = openEvents[openEvents.length - 1]?.created_at ?? null
  const openSpanDays = diffDays(firstOpen, lastOpen) ?? 0

  return {
    pushToReviewHours:     diffHours(created, reviewed),        // pipeline push → Marco opened
    approvalToSentHours:   diffHours(approved, sentToClient),   // Marco approved → sent to client
    sentToDecisionDays:    diffDays(sentToClient, accepted),    // sent → accepted/declined
    clientViewCount,
    openSpanDays,
  }
}
```

### 8b. Component

```typescript
'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, Eye, Clock } from 'lucide-react'

interface EstimateMetrics {
  pushToReviewHours: number | null
  approvalToSentHours: number | null
  sentToDecisionDays: number | null
  clientViewCount: number
  openSpanDays: number
}

interface Props {
  metrics: EstimateMetrics
}

function formatHours(h: number | null): string {
  if (h === null) return '—'
  if (h < 1) return '<1h'
  if (h < 24) return `${h}h`
  return `${Math.round(h / 24)}d`
}

export function EstimateMetricsCard({ metrics }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <section className="border border-[--color-stone] rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="
          w-full flex items-center justify-between
          px-4 py-3.5 bg-white
          text-sm font-semibold text-[--color-charcoal]
          active:bg-[--color-background] transition-colors
        "
      >
        <span>Metrics</span>
        {open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
      </button>

      {open && (
        <div className="bg-[--color-background] px-4 py-4 grid grid-cols-2 gap-3">
          <MetricRow
            label="Push → Review"
            value={formatHours(metrics.pushToReviewHours)}
          />
          <MetricRow
            label="Approval → Sent"
            value={formatHours(metrics.approvalToSentHours)}
          />
          <MetricRow
            label="Sent → Decision"
            value={metrics.sentToDecisionDays !== null ? `${metrics.sentToDecisionDays}d` : '—'}
          />
          <MetricRow
            label="Client views"
            value={
              metrics.clientViewCount === 0
                ? 'Never opened'
                : metrics.clientViewCount === 1
                  ? '1 time'
                  : `${metrics.clientViewCount}× in ${metrics.openSpanDays}d`
            }
          />
        </div>
      )}
    </section>
  )
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-lg p-3 border border-[--color-stone]">
      <p className="text-[11px] text-[--color-charcoal]/50 mb-1">{label}</p>
      <p className="text-base font-semibold text-[--color-charcoal]">{value}</p>
    </div>
  )
}
```

---

## 9. Dashboard Metrics Panel

File: `src/components/dashboard/MetricsPanel.tsx`

### 9a. Supabase queries (all 4 metrics)

`src/lib/bid-log/queries.ts`:

```typescript
import { createServerClient } from '@/lib/supabase/server'
import type { DashboardMetrics } from './types'

export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  const supabase = await createServerClient()

  // ── Win Rate ─────────────────────────────────────────────────────────────────
  // won / (won + lost) for estimates with sent_at in last 90 days
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()

  const { data: recentBids, error: winErr } = await supabase
    .from('bid_log')
    .select('status')
    .in('status', ['won', 'lost'])
    .gte('updated_at', ninetyDaysAgo)   // proxy for sent date — use sent_at if column exists

  if (winErr) throw winErr

  const won  = recentBids?.filter((r) => r.status === 'won').length ?? 0
  const lost = recentBids?.filter((r) => r.status === 'lost').length ?? 0
  const total = won + lost
  const winRate = total > 0 ? Math.round((won / total) * 100) : 0
  const winRateFraction = `${won}/${total} sent`

  // ── Pipeline Value ────────────────────────────────────────────────────────────
  // Sum of submitted_amount for estimates in status: sent, in_review, approved
  const { data: pipeline, error: pipeErr } = await supabase
    .from('bid_log')
    .select('submitted_amount')
    .in('status', ['sent', 'in_review', 'approved'])
    .not('submitted_amount', 'is', null)

  if (pipeErr) throw pipeErr

  const pipelineValue = pipeline?.reduce((sum, r) => sum + (r.submitted_amount ?? 0), 0) ?? 0

  // ── Pending Count ─────────────────────────────────────────────────────────────
  // Estimates in status 'draft' or 'in_review' (need Marco's attention)
  const { count: pendingCount, error: pendErr } = await supabase
    .from('estimates')
    .select('id', { count: 'exact', head: true })
    .in('status', ['draft', 'in_review'])

  if (pendErr) throw pendErr

  // ── Average Time to Decision ──────────────────────────────────────────────────
  // Median days from sent_to_client event → client_accepted or client_declined
  // Compute from estimate_activity. Fetch all sent + decision event pairs.
  const { data: sentEvents, error: sentErr } = await supabase
    .from('estimate_activity')
    .select('estimate_id, created_at')
    .eq('event_type', 'sent_to_client')
    .gte('created_at', ninetyDaysAgo)

  if (sentErr) throw sentErr

  const sentMap = new Map<string, string>()
  for (const e of sentEvents ?? []) {
    sentMap.set(e.estimate_id, e.created_at)
  }

  const estimateIds = [...sentMap.keys()]
  let avgDaysToDecision = 0

  if (estimateIds.length > 0) {
    const { data: decisionEvents, error: decErr } = await supabase
      .from('estimate_activity')
      .select('estimate_id, created_at')
      .in('event_type', ['client_accepted', 'client_declined'])
      .in('estimate_id', estimateIds)

    if (decErr) throw decErr

    const decisionMap = new Map<string, string>()
    for (const e of decisionEvents ?? []) {
      if (!decisionMap.has(e.estimate_id)) {
        decisionMap.set(e.estimate_id, e.created_at)  // earliest decision event wins
      }
    }

    const deltas: number[] = []
    for (const [eid, sentAt] of sentMap.entries()) {
      const decisionAt = decisionMap.get(eid)
      if (!decisionAt) continue
      const days = (new Date(decisionAt).getTime() - new Date(sentAt).getTime()) / (1000 * 60 * 60 * 24)
      deltas.push(days)
    }

    if (deltas.length > 0) {
      deltas.sort((a, b) => a - b)
      const mid = Math.floor(deltas.length / 2)
      avgDaysToDecision = Math.round(
        deltas.length % 2 === 0
          ? (deltas[mid - 1]! + deltas[mid]!) / 2
          : deltas[mid]!
      )
    }
  }

  return {
    winRate,
    winRateFraction,
    pipelineValue,
    pendingCount: pendingCount ?? 0,
    avgDaysToDecision,
  }
}
```

### 9b. MetricsPanel component (mobile-safe layout)

```typescript
// src/components/dashboard/MetricsPanel.tsx
// This is a Server Component — metrics are fetched in the parent RSC page and passed down.
// No 'use client' needed; renders pure HTML.

import type { DashboardMetrics } from '@/lib/bid-log/types'

interface Props {
  metrics: DashboardMetrics
}

function formatCurrency(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`
  return `$${n.toLocaleString()}`
}

export function MetricsPanel({ metrics }: Props) {
  const cards = [
    {
      label: 'Win Rate',
      value: `${metrics.winRate}%`,
      sub:   metrics.winRateFraction,
      icon:  '📊',
    },
    {
      label: 'Pipeline',
      value: formatCurrency(metrics.pipelineValue),
      sub:   'active bids',
      icon:  '💰',
    },
    {
      label: 'Pending',
      value: String(metrics.pendingCount),
      sub:   'need review',
      icon:  '📋',
    },
    {
      label: 'Avg Time',
      value: `${metrics.avgDaysToDecision}d`,
      sub:   'to decision',
      icon:  '⏱',
    },
  ]

  return (
    /*
     * Mobile (390px): 2-column grid, 2 rows → 4 cards, all visible, no scroll
     * Desktop (md+):  4-column single row
     *
     * Each card: min-width 0 (prevents grid blowout), text truncation on sub-label
     */
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
      {cards.map(({ label, value, sub, icon }) => (
        <div
          key={label}
          className="
            bg-white border border-[--color-stone] rounded-xl
            p-3.5 flex flex-col gap-1
            min-w-0
          "
        >
          <div className="flex items-center gap-1.5">
            <span className="text-base leading-none" aria-hidden="true">{icon}</span>
            <span className="text-[11px] font-medium text-[--color-charcoal]/50 truncate">
              {label}
            </span>
          </div>
          <p className="text-xl font-bold text-[--color-charcoal] leading-tight truncate">
            {value}
          </p>
          <p className="text-[11px] text-[--color-charcoal]/40 truncate">{sub}</p>
        </div>
      ))}
    </div>
  )
}
```

### 9c. Integration into dashboard page

`src/app/(portal)/internal/page.tsx` (add to existing RSC):

```typescript
// Add this fetch alongside existing estimates fetch
import { getDashboardMetrics } from '@/lib/bid-log/queries'

// Inside the page component:
const [estimates, metrics] = await Promise.all([
  getEstimatesList(),       // existing query
  getDashboardMetrics(),    // new
])

// In JSX, add above the estimate list:
<MetricsPanel metrics={metrics} />
```

---

## 10. Mobile Dashboard Metrics Layout (390px Verification)

The 2-column grid layout is the safe approach for 390px screens. Here is the explicit math:

```
Screen width: 390px
Container padding: 16px left + 16px right = 32px total
Available width: 390 - 32 = 358px
Gap between cols: 12px (gap-3)
Each card width: (358 - 12) / 2 = 173px ✓

Card content at 173px:
  Icon + label: "📊 Win Rate" → 11px text, fits in ~120px
  Value: "44%" → 21px bold, 2 chars, fits easily
  Value: "$2.4M" → 5 chars at 21px bold, 173px is plenty
  Sub-label: "active bids" → 11px, truncated if needed (truncate class)

Worst case: "$2.4M" at font-size 21px = ~75px width ✓

NO horizontal scroll at 390px when using grid grid-cols-2.
```

**Critical:** Do NOT use `flex-nowrap` or `overflow-x-auto` for the metrics row. Use `grid grid-cols-2 md:grid-cols-4`. The 2×2 grid is intentional for mobile and does not require scroll.

---

## 11. Bid Log Page

File: `src/app/(portal)/internal/bid-log/page.tsx`

### 11a. RSC page (data fetching)

```typescript
import { createServerClient } from '@/lib/supabase/server'
import { BidLogFilters } from '@/components/bid-log/BidLogFilters'
import { BidLogTable } from '@/components/bid-log/BidLogTable'
import { LossPatternSummary } from '@/components/bid-log/LossPatternSummary'
import type { BidLogRow } from '@/lib/bid-log/types'

// Accept searchParams for filtering
interface Props {
  searchParams: Promise<{
    status?: string
    from?: string
    to?: string
    type?: string
    scope?: string
    sort?: string
    dir?: string
  }>
}

export default async function BidLogPage({ searchParams }: Props) {
  const params = await searchParams
  const supabase = await createServerClient()

  // Joined query: bid_log + jobs
  let query = supabase
    .from('bid_log')
    .select(`
      id,
      estimate_id,
      job_id,
      status,
      submitted_amount,
      loss_reason,
      competitor_price,
      loss_notes,
      created_at,
      updated_at,
      jobs (
        name,
        client_name,
        address,
        project_type,
        bid_due_date
      ),
      estimates (
        sent_at,
        accepted_at
      )
    `)

  // Apply status filter
  if (params.status && params.status !== 'all') {
    query = query.eq('status', params.status)
  }

  // Apply date range filter (on bid_log.created_at)
  if (params.from) {
    query = query.gte('created_at', params.from)
  }
  if (params.to) {
    const toDate = new Date(params.to)
    toDate.setDate(toDate.getDate() + 1)  // inclusive end date
    query = query.lt('created_at', toDate.toISOString())
  }

  // Apply sort
  const sortColumn = params.sort ?? 'created_at'
  const sortDir    = params.dir === 'asc' ? { ascending: true } : { ascending: false }
  const validSorts = ['created_at', 'submitted_amount', 'status']
  if (validSorts.includes(sortColumn)) {
    query = query.order(sortColumn, sortDir)
  }

  const { data: rows, error } = await query

  if (error) throw error

  // Flatten joined data into BidLogRow shape
  const bidLog: BidLogRow[] = (rows ?? []).map((r) => ({
    id:               r.id,
    estimate_id:      r.estimate_id,
    job_id:           r.job_id,
    status:           r.status,
    submitted_amount: r.submitted_amount,
    loss_reason:      r.loss_reason,
    competitor_price: r.competitor_price,
    loss_notes:       r.loss_notes,
    created_at:       r.created_at,
    updated_at:       r.updated_at,
    job_name:         (r.jobs as Record<string,unknown>)?.name as string,
    client_name:      (r.jobs as Record<string,unknown>)?.client_name as string,
    address:          (r.jobs as Record<string,unknown>)?.address as string,
    project_type:     (r.jobs as Record<string,unknown>)?.project_type as string,
    bid_due_date:     (r.jobs as Record<string,unknown>)?.bid_due_date as string,
    sent_at:          (r.estimates as Record<string,unknown>)?.sent_at as string,
    accepted_at:      (r.estimates as Record<string,unknown>)?.accepted_at as string,
  }))

  // Fetch client view counts (join with estimate_activity)
  // Done separately to avoid a complex sub-select
  const estimateIds = bidLog.map((b) => b.estimate_id)
  const viewCounts: Record<string, number> = {}
  if (estimateIds.length > 0) {
    const { data: openEvents } = await supabase
      .from('estimate_activity')
      .select('estimate_id')
      .eq('event_type', 'client_opened')
      .in('estimate_id', estimateIds)
    for (const e of openEvents ?? []) {
      viewCounts[e.estimate_id] = (viewCounts[e.estimate_id] ?? 0) + 1
    }
  }
  const enrichedBidLog = bidLog.map((b) => ({
    ...b,
    client_view_count: viewCounts[b.estimate_id] ?? 0,
  }))

  return (
    <div className="px-4 py-6 md:px-8">
      <h1 className="font-[--font-fraunces] text-2xl text-[--color-charcoal] mb-5">
        Bid Log
      </h1>

      {/* Filters — client component, changes searchParams → triggers RSC refetch */}
      <BidLogFilters currentParams={params} />

      {/* Mobile: card list. Desktop: table. Both in same component, CSS-switched. */}
      {enrichedBidLog.length === 0 ? (
        <p className="text-sm text-[--color-charcoal]/50 py-12 text-center">
          No bids match the current filters.
        </p>
      ) : (
        <BidLogTable rows={enrichedBidLog} sortColumn={params.sort} sortDir={params.dir} />
      )}

      {/* Loss pattern summary — only meaningful when showing all/lost bids */}
      <LossPatternSummary estimateIds={enrichedBidLog.map((b) => b.estimate_id)} />
    </div>
  )
}
```

### 11b. BidLogCard (mobile card view)

```typescript
// src/components/bid-log/BidLogCard.tsx
// Server-safe (no 'use client' needed)

import type { BidLogRow, EstimateStatus, LossReason } from '@/lib/bid-log/types'
import Link from 'next/link'

const STATUS_LABELS: Record<EstimateStatus, { label: string; color: string }> = {
  draft:      { label: 'Draft',      color: 'text-[--color-charcoal]/40 bg-[--color-stone]' },
  in_review:  { label: 'In Review',  color: 'text-amber-700 bg-amber-50' },
  approved:   { label: 'Approved',   color: 'text-blue-700 bg-blue-50' },
  sent:       { label: 'Sent →',     color: 'text-indigo-700 bg-indigo-50' },
  accepted:   { label: 'Accepted',   color: 'text-green-700 bg-green-50' },
  declined:   { label: 'Declined',   color: 'text-red-700 bg-red-50' },
  expired:    { label: 'Expired',    color: 'text-[--color-charcoal]/40 bg-[--color-stone]' },
  won:        { label: 'Won ✓',      color: 'text-green-800 bg-green-100' },
  lost:       { label: 'Lost ✗',     color: 'text-red-800 bg-red-100' },
}

const LOSS_LABELS: Partial<Record<LossReason, string>> = {
  price_too_high:    'Price too high',
  timeline_conflict: 'Timeline conflict',
  went_with_existing:'Existing contractor',
  no_decision:       'No decision',
  client_cancelled:  'Client cancelled',
  out_bid:           'Out-bid',
  scope_changed:     'Scope changed',
  other:             'Other',
}

function formatDate(iso: string | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatAmount(n: number | null | undefined): string {
  if (!n) return '—'
  return '$' + n.toLocaleString()
}

export function BidLogCard({ row }: { row: BidLogRow }) {
  const statusInfo = STATUS_LABELS[row.status] ?? { label: row.status, color: '' }
  const lostLabel  = row.loss_reason ? LOSS_LABELS[row.loss_reason] : null

  return (
    <Link
      href={`/internal/estimates/${row.estimate_id}`}
      className="block border border-[--color-stone] rounded-xl p-4 bg-white active:bg-[--color-background] transition-colors"
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <h3 className="font-semibold text-[--color-charcoal] text-sm leading-tight">
          {row.job_name ?? 'Unnamed Job'}
        </h3>
        <span className={`shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full ${statusInfo.color}`}>
          {statusInfo.label}
        </span>
      </div>

      <p className="text-xs text-[--color-charcoal]/50 mb-2">
        {formatDate(row.created_at)} · {formatAmount(row.submitted_amount)}
      </p>

      {row.project_type && (
        <p className="text-xs text-[--color-charcoal]/40 mb-1">
          {row.project_type}
          {row.trade_scope ? ` · ${row.trade_scope}` : ''}
        </p>
      )}

      {/* Loss details */}
      {row.status === 'lost' && lostLabel && (
        <p className="text-xs text-red-600 mt-1">
          Loss: {lostLabel}
          {row.competitor_price ? ` · Competitor: ~${formatAmount(row.competitor_price)}` : ''}
        </p>
      )}

      {/* Sent status details */}
      {row.status === 'sent' && (
        <p className="text-xs text-[--color-charcoal]/40 mt-1">
          {row.client_view_count
            ? `Opened ${row.client_view_count}× · `
            : 'Not opened · '}
          {row.sent_at
            ? `${Math.round((Date.now() - new Date(row.sent_at).getTime()) / (1000 * 60 * 60 * 24))} days ago`
            : ''}
        </p>
      )}
    </Link>
  )
}
```

### 11c. BidLogTable (desktop table view + mobile card wrapper)

```typescript
'use client'
// src/components/bid-log/BidLogTable.tsx
// Renders as table on md+, as cards on mobile.

import { BidLogCard } from './BidLogCard'
import type { BidLogRow, EstimateStatus } from '@/lib/bid-log/types'
import Link from 'next/link'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'

interface Props {
  rows: BidLogRow[]
  sortColumn?: string
  sortDir?: string
}

const STATUS_BADGE: Record<EstimateStatus, string> = {
  draft:      'text-[--color-charcoal]/40',
  in_review:  'text-amber-600',
  approved:   'text-blue-600',
  sent:       'text-indigo-600',
  accepted:   'text-green-600',
  declined:   'text-red-600',
  expired:    'text-[--color-charcoal]/40',
  won:        'text-green-700 font-bold',
  lost:       'text-red-700 font-bold',
}

export function BidLogTable({ rows, sortColumn = 'created_at', sortDir = 'desc' }: Props) {
  const router   = useRouter()
  const pathname = usePathname()
  const params   = useSearchParams()

  function setSort(col: string) {
    const sp = new URLSearchParams(params.toString())
    if (sp.get('sort') === col) {
      sp.set('dir', sp.get('dir') === 'asc' ? 'desc' : 'asc')
    } else {
      sp.set('sort', col)
      sp.set('dir', 'desc')
    }
    router.push(`${pathname}?${sp.toString()}`)
  }

  function SortHeader({ col, label }: { col: string; label: string }) {
    const active = sortColumn === col
    const arrow  = sortDir === 'asc' ? '↑' : '↓'
    return (
      <button
        type="button"
        onClick={() => setSort(col)}
        className={`text-left text-xs font-semibold uppercase tracking-wide ${active ? 'text-[--color-teal]' : 'text-[--color-charcoal]/50'}`}
      >
        {label} {active ? arrow : ''}
      </button>
    )
  }

  return (
    <>
      {/* Mobile: card list */}
      <div className="md:hidden space-y-3">
        {rows.map((row) => <BidLogCard key={row.id} row={row} />)}
      </div>

      {/* Desktop: table */}
      <div className="hidden md:block overflow-x-auto rounded-xl border border-[--color-stone]">
        <table className="w-full text-sm border-collapse">
          <thead className="bg-[--color-background]">
            <tr>
              <th className="px-4 py-3 text-left">
                <SortHeader col="created_at" label="Job" />
              </th>
              <th className="px-4 py-3 text-left">
                <SortHeader col="created_at" label="Date" />
              </th>
              <th className="px-4 py-3 text-right">
                <SortHeader col="submitted_amount" label="Amount" />
              </th>
              <th className="px-4 py-3 text-left">
                <SortHeader col="status" label="Status" />
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[--color-charcoal]/50">
                Details
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={row.id}
                className={`border-t border-[--color-stone] hover:bg-[--color-background] cursor-pointer ${i % 2 === 0 ? 'bg-white' : 'bg-white'}`}
                onClick={() => router.push(`/internal/estimates/${row.estimate_id}`)}
              >
                <td className="px-4 py-3 font-medium text-[--color-charcoal]">
                  {row.job_name ?? '—'}
                  {row.client_name && (
                    <span className="block text-xs text-[--color-charcoal]/40 font-normal">
                      {row.client_name}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-[--color-charcoal]/60 whitespace-nowrap">
                  {row.created_at
                    ? new Date(row.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                    : '—'}
                </td>
                <td className="px-4 py-3 text-right font-mono text-[--color-charcoal]">
                  {row.submitted_amount ? '$' + row.submitted_amount.toLocaleString() : '—'}
                </td>
                <td className={`px-4 py-3 ${STATUS_BADGE[row.status] ?? ''}`}>
                  {row.status.replace(/_/g, ' ')}
                </td>
                <td className="px-4 py-3 text-xs text-[--color-charcoal]/50">
                  {row.status === 'lost' && row.loss_reason && (
                    <span>
                      {row.loss_reason.replace(/_/g, ' ')}
                      {row.competitor_price ? ` · ~$${row.competitor_price.toLocaleString()}` : ''}
                    </span>
                  )}
                  {row.status === 'sent' && (
                    <span>
                      {row.client_view_count ? `${row.client_view_count} views` : 'Not opened'}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
```

### 11d. BidLogFilters component

```typescript
'use client'
// src/components/bid-log/BidLogFilters.tsx

import { useRouter, usePathname } from 'next/navigation'

interface Props {
  currentParams: {
    status?: string
    from?: string
    to?: string
    sort?: string
    dir?: string
  }
}

const STATUS_OPTIONS = [
  { value: 'all',       label: 'All' },
  { value: 'draft',     label: 'Draft' },
  { value: 'in_review', label: 'In Review' },
  { value: 'approved',  label: 'Approved' },
  { value: 'sent',      label: 'Sent' },
  { value: 'accepted',  label: 'Accepted' },
  { value: 'won',       label: 'Won' },
  { value: 'lost',      label: 'Lost' },
  { value: 'expired',   label: 'Expired' },
]

export function BidLogFilters({ currentParams }: Props) {
  const router   = useRouter()
  const pathname = usePathname()

  function update(key: string, value: string) {
    const sp = new URLSearchParams()
    // Preserve all current params
    Object.entries(currentParams).forEach(([k, v]) => {
      if (v) sp.set(k, v)
    })
    if (value && value !== 'all') {
      sp.set(key, value)
    } else {
      sp.delete(key)
    }
    router.push(`${pathname}?${sp.toString()}`)
  }

  return (
    <div className="flex flex-wrap gap-2 mb-5">
      {/* Status filter chips */}
      {STATUS_OPTIONS.map(({ value, label }) => {
        const isActive = (currentParams.status ?? 'all') === value
        return (
          <button
            key={value}
            type="button"
            onClick={() => update('status', value)}
            className={`
              px-3 py-1.5 rounded-full text-xs font-medium transition-colors
              min-h-[36px]
              ${isActive
                ? 'bg-[--color-teal] text-white'
                : 'bg-white border border-[--color-stone] text-[--color-charcoal]/70 hover:border-[--color-teal]'}
            `}
          >
            {label}
          </button>
        )
      })}

      {/* Date range: simple from/to inputs */}
      <div className="flex items-center gap-1.5 ml-auto">
        <input
          type="date"
          value={currentParams.from ?? ''}
          onChange={(e) => update('from', e.target.value)}
          className="
            rounded-lg border border-[--color-stone] bg-white
            px-2 py-1.5 text-xs text-[--color-charcoal]
            focus:outline-none focus:ring-2 focus:ring-[--color-teal]
            min-h-[36px]
          "
        />
        <span className="text-xs text-[--color-charcoal]/40">to</span>
        <input
          type="date"
          value={currentParams.to ?? ''}
          onChange={(e) => update('to', e.target.value)}
          className="
            rounded-lg border border-[--color-stone] bg-white
            px-2 py-1.5 text-xs text-[--color-charcoal]
            focus:outline-none focus:ring-2 focus:ring-[--color-teal]
            min-h-[36px]
          "
        />
      </div>
    </div>
  )
}
```

---

## 12. Loss Pattern Analysis

File: `src/components/bid-log/LossPatternSummary.tsx`

### 12a. Query

```typescript
// src/lib/bid-log/queries.ts (add to existing file)

export async function getLossPatterns(estimateIds: string[]) {
  if (estimateIds.length === 0) return { patterns: [], avgLossMargin: null }

  const supabase = await createServerClient()

  // GROUP BY loss_reason for the provided estimate IDs
  const { data: lostBids, error } = await supabase
    .from('bid_log')
    .select('loss_reason, submitted_amount, competitor_price')
    .eq('status', 'lost')
    .in('estimate_id', estimateIds)
    .not('loss_reason', 'is', null)

  if (error) throw error

  // Group counts
  const counts: Record<string, number> = {}
  for (const row of lostBids ?? []) {
    const r = row.loss_reason as string
    counts[r] = (counts[r] ?? 0) + 1
  }

  const patterns = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([reason, count]) => ({ reason, count }))

  // Average loss margin: (submitted - competitor) / competitor × 100
  const marginData = (lostBids ?? []).filter(
    (r) => r.submitted_amount && r.competitor_price && r.competitor_price > 0
  )
  const avgLossMargin = marginData.length > 0
    ? Math.round(
        marginData.reduce((sum, r) => {
          const margin = ((r.submitted_amount! - r.competitor_price!) / r.competitor_price!) * 100
          return sum + margin
        }, 0) / marginData.length
      )
    : null

  return { patterns, avgLossMargin }
}
```

### 12b. Component

```typescript
'use client'
// src/components/bid-log/LossPatternSummary.tsx

import { useEffect, useState } from 'react'

const REASON_LABELS: Record<string, string> = {
  price_too_high:    'Price too high',
  timeline_conflict: 'Timeline',
  went_with_existing:'Existing contractor',
  no_decision:       'No decision',
  client_cancelled:  'Client cancelled',
  out_bid:           'Out-bid',
  scope_changed:     'Scope changed',
  other:             'Other',
}

interface Props {
  estimateIds: string[]
}

interface LossData {
  patterns: { reason: string; count: number }[]
  avgLossMargin: number | null
}

export function LossPatternSummary({ estimateIds }: Props) {
  const [data, setData] = useState<LossData | null>(null)

  useEffect(() => {
    if (estimateIds.length === 0) return
    fetch(`/api/bid-log/loss-patterns?ids=${estimateIds.join(',')}`)
      .then((r) => r.json())
      .then(setData)
      .catch(console.error)
  }, [estimateIds.join(',')])

  if (!data || data.patterns.length === 0) return null

  const quarterLabel = 'this period'

  return (
    <div className="mt-8 border-t border-[--color-stone] pt-6">
      <h2 className="text-sm font-semibold text-[--color-charcoal] mb-3">
        Loss Patterns
      </h2>

      <p className="text-sm text-[--color-charcoal]/70 mb-2">
        Loss reasons {quarterLabel}:{' '}
        {data.patterns.map(({ reason, count }, i) => (
          <span key={reason}>
            {count}× {REASON_LABELS[reason] ?? reason}
            {i < data.patterns.length - 1 ? ', ' : ''}
          </span>
        ))}
      </p>

      {data.avgLossMargin !== null && (
        <p className="text-sm text-[--color-charcoal]/70">
          Average loss margin:{' '}
          <span className="font-semibold text-red-600">
            {data.avgLossMargin > 0 ? '+' : ''}{data.avgLossMargin}% above competitor price
          </span>
        </p>
      )}
    </div>
  )
}
```

---

## 13. Estimate Archive + Search

### 13a. Search query

`src/lib/estimates/queries.ts` (add to existing file):

```typescript
export async function searchEstimates({
  query,
  status,
  fromDate,
  toDate,
}: {
  query: string
  status?: string
  fromDate?: string
  toDate?: string
}) {
  const supabase = await createServerClient()

  // Search across job name, client name, address
  // Supabase ilike is case-insensitive
  let q = supabase
    .from('estimates')
    .select(`
      id, status, grand_total, created_at,
      jobs (
        name,
        client_name,
        address,
        project_type
      )
    `)
    .order('created_at', { ascending: false })
    .limit(50)

  if (query.trim()) {
    // Search in joined jobs table fields
    q = q.or(
      `jobs.name.ilike.%${query}%,` +
      `jobs.client_name.ilike.%${query}%,` +
      `jobs.address.ilike.%${query}%`
    )
  }

  if (status && status !== 'all') {
    q = q.eq('status', status)
  }
  if (fromDate) q = q.gte('created_at', fromDate)
  if (toDate)   q = q.lte('created_at', toDate)

  const { data, error } = await q
  if (error) throw error
  return data ?? []
}
```

**Important note on Supabase ilike across joins:** If the `or` filter across joined tables does not work as expected with Supabase JS v2 (join filters have limitations), fall back to doing the search client-side after fetching all estimates, or use a Postgres function / full-text search index. The recommended approach for production is to add `pg_trgm` GIN indexes on `jobs.name`, `jobs.client_name`, `jobs.address` and use `.textSearch()`.

Alternative RPC approach (more reliable for cross-table search):

```sql
-- Run in Supabase SQL Editor
CREATE OR REPLACE FUNCTION search_estimates(search_query TEXT)
RETURNS TABLE (
  estimate_id UUID,
  job_name TEXT,
  client_name TEXT,
  address TEXT,
  status TEXT,
  grand_total NUMERIC,
  created_at TIMESTAMPTZ
) AS $$
  SELECT
    e.id,
    j.name,
    j.client_name,
    j.address,
    e.status,
    e.grand_total,
    e.created_at
  FROM estimates e
  JOIN jobs j ON j.id = e.job_id
  WHERE
    j.name ILIKE '%' || search_query || '%'
    OR j.client_name ILIKE '%' || search_query || '%'
    OR j.address ILIKE '%' || search_query || '%'
  ORDER BY e.created_at DESC
  LIMIT 50;
$$ LANGUAGE SQL STABLE SECURITY DEFINER;
```

Then call it as:
```typescript
const { data } = await supabase.rpc('search_estimates', { search_query: query })
```

### 13b. ArchiveSearch component

```typescript
'use client'
// src/components/dashboard/ArchiveSearch.tsx

import { useState, useEffect, useRef } from 'react'
import { Search, X } from 'lucide-react'
import Link from 'next/link'

interface SearchResult {
  estimate_id: string
  job_name: string
  client_name: string
  status: string
  grand_total: number | null
  created_at: string
}

export function ArchiveSearch() {
  const [query, setQuery]     = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen]       = useState(false)
  const debounceRef           = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      setOpen(false)
      return
    }

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/estimates/search?q=${encodeURIComponent(query)}`)
        const data = await res.json()
        setResults(data.results ?? [])
        setOpen(true)
      } catch {
        // silent fail
      } finally {
        setLoading(false)
      }
    }, 300)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query])

  return (
    <div className="relative mb-5">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[--color-charcoal]/40" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search job name, client, address…"
          className="
            w-full pl-9 pr-9 py-2.5 rounded-xl
            border border-[--color-stone] bg-white
            text-sm text-[--color-charcoal]
            focus:outline-none focus:ring-2 focus:ring-[--color-teal]
            min-h-[44px]
          "
        />
        {query && (
          <button
            type="button"
            onClick={() => { setQuery(''); setOpen(false) }}
            className="absolute right-3 top-1/2 -translate-y-1/2"
          >
            <X className="size-4 text-[--color-charcoal]/40" />
          </button>
        )}
      </div>

      {/* Dropdown results */}
      {open && (
        <div className="
          absolute z-30 top-full left-0 right-0 mt-1
          bg-white border border-[--color-stone] rounded-xl shadow-lg
          overflow-hidden
        ">
          {loading && (
            <p className="text-sm text-[--color-charcoal]/50 px-4 py-3">Searching…</p>
          )}
          {!loading && results.length === 0 && (
            <p className="text-sm text-[--color-charcoal]/50 px-4 py-3">No results.</p>
          )}
          {!loading && results.map((r) => (
            <Link
              key={r.estimate_id}
              href={`/internal/estimates/${r.estimate_id}`}
              onClick={() => { setQuery(''); setOpen(false) }}
              className="flex items-center justify-between px-4 py-3 hover:bg-[--color-background] transition-colors"
            >
              <div>
                <p className="text-sm font-medium text-[--color-charcoal]">{r.job_name}</p>
                <p className="text-xs text-[--color-charcoal]/50">{r.client_name}</p>
              </div>
              <div className="text-right shrink-0 ml-4">
                <p className="text-xs text-[--color-charcoal]/60">
                  {r.grand_total ? '$' + r.grand_total.toLocaleString() : '—'}
                </p>
                <p className="text-[10px] text-[--color-charcoal]/30 capitalize">
                  {r.status.replace(/_/g, ' ')}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
```

---

## 14. "Copy for Joist" Component

File: `src/components/estimate/JoistOutputPanel.tsx`

This section only renders when the estimate has `status === 'won'`.

```typescript
'use client'

import { useState } from 'react'
import { Copy, Check } from 'lucide-react'

interface TradeTotal {
  name: string
  code: string           // "SP", "SUB", etc.
  total: number
}

interface Props {
  jobName: string
  tradeTotals: TradeTotal[]
  grandTotal: number
}

function formatJoistText(jobName: string, trades: TradeTotal[], grandTotal: number): string {
  const divider = '─'.repeat(33)
  const lines = [
    `${jobName.toUpperCase()} — JOIST ENTRY`,
    divider,
    'Line items to enter in Joist:',
    '',
    ...trades.map((t) => {
      const label = `${t.name} (${t.code})`
      const amount = '$' + t.total.toLocaleString()
      // Right-align amount to column 38
      const padding = Math.max(1, 38 - label.length - amount.length)
      return label + ' '.repeat(padding) + amount
    }),
    divider,
    (() => {
      const label = 'TOTAL:'
      const amount = '$' + grandTotal.toLocaleString()
      const padding = Math.max(1, 38 - label.length - amount.length)
      return label + ' '.repeat(padding) + amount
    })(),
    divider,
  ]
  return lines.join('\n')
}

export function JoistOutputPanel({ jobName, tradeTotals, grandTotal }: Props) {
  const [copied, setCopied] = useState(false)

  const text = formatJoistText(jobName, tradeTotals, grandTotal)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      // Fallback: select all text in the textarea
      const ta = document.getElementById('joist-output') as HTMLTextAreaElement | null
      ta?.select()
      document.execCommand('copy')
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    }
  }

  return (
    <section className="border border-[--color-teal]/30 rounded-xl overflow-hidden">
      <div className="bg-[--color-teal] px-4 py-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white">Prepare for Joist</h2>
        <span className="text-xs text-white/60">Won estimate</span>
      </div>

      <div className="bg-white p-4">
        {/* Formatted output */}
        <textarea
          id="joist-output"
          readOnly
          value={text}
          rows={tradeTotals.length + 6}
          className="
            w-full font-mono text-xs text-[--color-charcoal] bg-[--color-background]
            border border-[--color-stone] rounded-lg p-3
            resize-none focus:outline-none
          "
        />

        <button
          type="button"
          onClick={handleCopy}
          className="
            mt-3 w-full flex items-center justify-center gap-2
            py-3 rounded-xl
            bg-[--color-teal] text-white text-sm font-semibold
            active:scale-[0.98] transition-transform
          "
        >
          {copied
            ? <><Check className="size-4" /> Copied!</>
            : <><Copy className="size-4" /> Copy to Clipboard</>
          }
        </button>
      </div>
    </section>
  )
}
```

Integration in review page: wrap in `{estimate.status === 'won' && <JoistOutputPanel ... />}`.

---

## 15. New API Routes This Phase

| Route | Method | Description |
|---|---|---|
| `GET /api/estimates/[id]/activity` | GET | Returns `estimate_activity` rows for an estimate, ordered `created_at ASC`. Auth required. |
| `GET /api/estimates/search` | GET | Accepts `?q=` param. Calls `search_estimates` RPC. Returns `{ results: SearchResult[] }`. Auth required. |
| `PATCH /api/estimates/[id]` | PATCH | **Extend existing.** Add handling for `action: 'won'`, `action: 'lost'`, `action: 'update_status'` alongside existing `approve` and `request_changes`. |
| `GET /api/bid-log` | GET | Returns all `bid_log` rows joined with `jobs`. Accepts filter params: `?status=&from=&to=&sort=&dir=`. Auth required. |
| `PATCH /api/bid-log/[logId]` | PATCH | **Already exists.** Verify it supports `loss_reason`, `competitor_price`, `loss_notes` fields. |
| `GET /api/metrics` | GET | Returns `DashboardMetrics` object. Auth required. Called by dashboard page (or computed in RSC — prefer RSC). |
| `GET /api/bid-log/loss-patterns` | GET | Accepts `?ids=` (comma-separated estimate IDs). Returns `{ patterns, avgLossMargin }`. Auth required. |

### `/api/estimates/[id]/activity` implementation

`src/app/api/estimates/[id]/activity/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: events, error } = await supabase
    .from('estimate_activity')
    .select('*')
    .eq('estimate_id', id)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ events })
}
```

### Extending `PATCH /api/estimates/[id]`

Add to the discriminated union schema in the existing route:

```typescript
z.object({
  action: z.literal('won'),
}),
z.object({
  action: z.literal('lost'),
  lossReason: z.enum([
    'price_too_high','timeline_conflict','went_with_existing',
    'no_decision','client_cancelled','out_bid','scope_changed','other',
  ]),
  competitorPrice: z.number().positive().nullable(),
  lossNotes: z.string().max(1000).nullable(),
}),
z.object({
  action: z.literal('update_status'),
  status: z.enum(['draft','in_review','approved','sent','accepted','declined','expired']),
}),
```

Handler logic for `won`:
```typescript
if (payload.action === 'won') {
  await supabase.from('estimates').update({ status: 'won' }).eq('id', id)
  await supabase.from('bid_log')
    .update({ status: 'won', updated_at: new Date().toISOString() })
    .eq('estimate_id', id)
  await writeActivity({ estimateId: id, eventType: 'won', actorEmail: user.email ?? undefined })
  return NextResponse.json({ status: 'won' })
}
```

Handler logic for `lost`:
```typescript
if (payload.action === 'lost') {
  await supabase.from('estimates').update({ status: 'lost' }).eq('id', id)
  await supabase.from('bid_log')
    .update({
      status: 'lost',
      loss_reason: payload.lossReason,
      competitor_price: payload.competitorPrice,
      loss_notes: payload.lossNotes,
      updated_at: new Date().toISOString(),
    })
    .eq('estimate_id', id)
  await writeActivity({
    estimateId: id,
    eventType: 'lost',
    actorEmail: user.email ?? undefined,
    metadata: {
      loss_reason: payload.lossReason,
      competitor_price: payload.competitorPrice,
      loss_notes: payload.lossNotes,
    },
  })
  return NextResponse.json({ status: 'lost' })
}
```

---

## 16. Database Migrations

Run these in the Supabase SQL Editor. Run in order. Each is idempotent (`IF NOT EXISTS` / `IF NOT EXISTS` guards).

### Migration 1 — Create `estimate_activity` table (if not yet done in Phase 6)

```sql
CREATE TABLE IF NOT EXISTS estimate_activity (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id UUID NOT NULL REFERENCES estimates(id) ON DELETE CASCADE,
  event_type  TEXT NOT NULL CHECK (event_type IN (
    'created', 'reviewed', 'approved', 'changes_requested', 'rejected',
    'sent_to_client', 'client_opened', 'client_accepted', 'client_declined',
    'status_updated', 'comment_added', 'won', 'lost'
  )),
  actor_email TEXT,
  metadata    JSONB,
  ip_address  TEXT,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_estimate_activity_estimate_id
  ON estimate_activity (estimate_id);

CREATE INDEX IF NOT EXISTS idx_estimate_activity_event_type
  ON estimate_activity (event_type);

CREATE INDEX IF NOT EXISTS idx_estimate_activity_created_at
  ON estimate_activity (created_at DESC);

-- RLS: only authenticated users (Marco) can read; server-side inserts use service role
ALTER TABLE estimate_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Authenticated users can read activity"
  ON estimate_activity FOR SELECT
  USING (auth.role() = 'authenticated');

-- Server-side inserts bypass RLS (service role key used in API routes via admin client)
```

### Migration 2 — Add loss columns to `bid_log` (if not already present)

```sql
ALTER TABLE bid_log
  ADD COLUMN IF NOT EXISTS loss_reason     TEXT CHECK (loss_reason IN (
    'price_too_high', 'timeline_conflict', 'went_with_existing',
    'no_decision', 'client_cancelled', 'out_bid', 'scope_changed', 'other'
  )),
  ADD COLUMN IF NOT EXISTS competitor_price NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS loss_notes       TEXT;
```

### Migration 3 — Extend status ENUM on `estimates` (if using ENUM type)

If `estimates.status` is a Postgres ENUM, you must add the new values:

```sql
-- Check if status is an enum:
-- SELECT column_name, udt_name FROM information_schema.columns WHERE table_name = 'estimates' AND column_name = 'status';
-- If udt_name is not 'text', run:

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'won' AND enumtypid = (
    SELECT oid FROM pg_type WHERE typname = 'estimate_status_enum'
  )) THEN
    ALTER TYPE estimate_status_enum ADD VALUE 'won';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'lost' AND enumtypid = (
    SELECT oid FROM pg_type WHERE typname = 'estimate_status_enum'
  )) THEN
    ALTER TYPE estimate_status_enum ADD VALUE 'lost';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'declined' AND enumtypid = (
    SELECT oid FROM pg_type WHERE typname = 'estimate_status_enum'
  )) THEN
    ALTER TYPE estimate_status_enum ADD VALUE 'declined';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'expired' AND enumtypid = (
    SELECT oid FROM pg_type WHERE typname = 'estimate_status_enum'
  )) THEN
    ALTER TYPE estimate_status_enum ADD VALUE 'expired';
  END IF;
END $$;
```

If status is stored as `TEXT` (recommended), skip Migration 3 — no schema change needed.

### Migration 4 — Add sent_at, accepted_at, won_at, lost_at to `estimates`

```sql
ALTER TABLE estimates
  ADD COLUMN IF NOT EXISTS sent_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS accepted_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS won_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lost_at      TIMESTAMPTZ;
```

### Migration 5 — Full-text search indexes on `jobs` table

```sql
-- Fast ilike / pg_trgm search for archive
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_jobs_name_trgm
  ON jobs USING GIN (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_jobs_client_name_trgm
  ON jobs USING GIN (client_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_jobs_address_trgm
  ON jobs USING GIN (address gin_trgm_ops);
```

---

## 17. Testing Checklist

### Unit tests (Vitest)

```
[ ] writeActivity() — does not throw when Supabase insert fails (error is console.error only)
[ ] getDashboardMetrics() — returns zero values gracefully when no bids exist
[ ] getLossPatterns() — returns empty patterns array when estimateIds is empty
[ ] formatJoistText() — output matches expected fixed-width format for a sample set of trades
[ ] getEstimateMetrics() — returns nulls for all timing metrics when only 'created' event exists
[ ] ordinal() helper — "1st", "2nd", "3rd", "4th", "11th", "21st" are all correct
```

### Integration tests (Playwright, 390px viewport)

```
[ ] Dashboard loads — MetricsPanel renders 4 cards, no horizontal scroll at 390px
[ ] MetricsPanel 2×2 grid — all 4 cards visible without scrolling on iPhone SE (375px)
[ ] Dashboard search — type "bellevue" → dropdown appears with matching result
[ ] Dashboard search — clear button removes query and closes dropdown
[ ] EstimateCard — StatusDropdown shows correct transition options for each status
[ ] EstimateCard — selecting 'lost' opens LossReasonModal
[ ] LossReasonModal — submits correctly with all required fields
[ ] LossReasonModal — "Other" reason shows free-text field, hides general notes field
[ ] LossReasonModal — Cancel closes modal without saving
[ ] Review page — EstimateActivityLog expands on tap, shows events
[ ] Review page — EstimateMetricsCard expands on tap, shows 4 metrics
[ ] Review page — StatusQuickActions shows "Mark Won" and "Mark Lost" when status is 'sent'
[ ] Review page — "Mark Won" confirm flow: confirm dialog → PATCH → toast → page reflects 'won' status
[ ] Review page — JoistOutputPanel only visible on won estimates
[ ] JoistOutputPanel — "Copy to Clipboard" button copies formatted text
[ ] JoistOutputPanel — textarea contains all trade names and grand total
[ ] Bid log page — loads at /internal/bid-log
[ ] Bid log page — mobile (390px): card view renders, no table visible
[ ] Bid log page — desktop (1280px): table view renders with sortable column headers
[ ] Bid log page — status filter chip "Won" shows only won estimates
[ ] Bid log page — sort by Amount changes order (verify first row changes)
[ ] Bid log page — date range filter reduces results
[ ] LossPatternSummary — renders at bottom when lost estimates exist
[ ] LossPatternSummary — shows "N/A" or is hidden when no lost estimates in current filter set
```

### Manual iPhone testing protocol

```
[ ] Open dashboard on iPhone Safari — 4 metric cards visible, 2×2 grid
[ ] No metric card text is cut off (truncate class keeps it in bounds)
[ ] Tap a card status dropdown — native iOS picker appears, transitions as expected
[ ] Find a 'sent' estimate — tap "Mark Lost" — modal slides up from bottom (not centered on phone)
[ ] Loss modal — keyboard does not cover the modal (modal uses items-end on mobile = bottom sheet style)
[ ] Loss modal — scroll through all 8 loss reason options
[ ] Competitor price field — inputMode="decimal" triggers numeric keyboard
[ ] Submit loss — estimate card status badge updates without page refresh
[ ] Open /internal/bid-log — card view on phone, no horizontal overflow
[ ] Filter chips — tap "Lost" chip — list filters in place
[ ] Scroll to bottom of bid log — LossPatternSummary visible
[ ] Open a won estimate — Joist panel visible at bottom of review page
[ ] Tap "Copy to Clipboard" — content copies (verify by pasting in Notes app)
[ ] Activity log on estimate — tap to expand, timeline events load with proper timestamps
[ ] Verify bottom tab bar still works — all 4 tabs navigate correctly (regression check)
```

---

## 18. Implementation Order

Build in this sequence to avoid blocking yourself:

1. **Migrations first** — run all 5 SQL migrations in Supabase before writing any app code
2. **Types file** — `src/lib/bid-log/types.ts` — all other files depend on this
3. **writeActivity helper** — needed by all API route handlers
4. **Extend PATCH /api/estimates/[id]** — add `won`, `lost`, `update_status` actions
5. **GET /api/estimates/[id]/activity** — needed by EstimateActivityLog component
6. **LossReasonModal** — self-contained, build and test in isolation
7. **StatusDropdown** on dashboard card — uses LossReasonModal
8. **StatusQuickActions** on review page — uses LossReasonModal
9. **EstimateActivityLog** — uses the activity API route
10. **EstimateMetricsCard** — uses getEstimateMetrics() query added to existing queries.ts
11. **getDashboardMetrics query** — add to bid-log/queries.ts
12. **MetricsPanel + MetricCard** — pure display, easy to build
13. **Integrate MetricsPanel into dashboard page.tsx**
14. **ArchiveSearch** — add to dashboard page
15. **BidLogCard** — mobile card component
16. **BidLogTable** — desktop table
17. **BidLogFilters** — filter/sort controls
18. **LossPatternSummary** — build after BidLogTable is working
19. **GET /api/bid-log/loss-patterns** — supports LossPatternSummary
20. **/internal/bid-log/page.tsx** — wire together all bid-log components
21. **JoistOutputPanel** — build last (depends on won estimate existing to test)

---

## 19. Common Pitfalls

**`estimate_activity` write failures must not block the main action.**
Always fire `writeActivity()` after the primary Supabase update. Use a try/catch or the existing `writeActivity()` helper (which swallows errors). If the activity log fails, Marco still sees the status change.

**`getLossPatterns` with empty `estimateIds` array.**
Supabase `.in('estimate_id', [])` returns an error or zero rows depending on driver version. Guard with `if (estimateIds.length === 0) return early` before calling the query.

**BidLogFilters uses `useRouter().push()` — this causes full RSC re-render.**
This is intentional and correct. The bid log page is an RSC that re-fetches based on searchParams. Do not attempt to filter client-side to avoid this — the RSC pattern is the right approach here.

**MetricsPanel in dashboard: do not `await getDashboardMetrics()` in a sequential chain.**
Use `Promise.all([getEstimatesList(), getDashboardMetrics()])` so both queries run in parallel. On cold Supabase connections, sequential awaits can add 300-500ms.

**Loss modal on iOS: the modal uses `items-end` on mobile to bottom-sheet it.**
This is intentional — on 390px screens, a centered modal with a keyboard open is painful. The modal slides up from the bottom like a sheet. On md+ it centers. This is controlled by `flex items-end md:items-center` on the overlay div.

**Supabase join filters (`jobs.name.ilike`) may not work in all query shapes.**
If `searchEstimates()` returns incorrect results, fall back to the `search_estimates` SQL function (RPC approach described in §13a). The RPC is more reliable and has better index usage with `pg_trgm`.

**`status` as TEXT vs ENUM.**
If the original schema used a Postgres ENUM for `estimates.status`, adding new enum values requires Migration 3 and a schema refresh in Supabase. If status is TEXT with a CHECK constraint, update the CHECK constraint instead. If the column has no constraint, no migration needed. Verify with:
```sql
SELECT column_default, is_nullable, udt_name 
FROM information_schema.columns 
WHERE table_name = 'estimates' AND column_name = 'status';
```

**`won` and `lost` are final states — the Zustand store must reflect this.**
After a `won` or `lost` PATCH succeeds, update the store's `estimate.status` and re-render the review page. The `StatusQuickActions` component should read status from the store (or local state synced from the API response) so it swaps to the read-only badge without a page reload.
