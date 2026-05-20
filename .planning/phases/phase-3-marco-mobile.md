# Phase 3: Marco Mobile UI — Execution Plan

---

## 0. Patch Notes — 2026-05-20

This plan was originally drafted before the Phase 1/2 schema was finalized. The patches below reconcile the plan with the actually-shipped foundation (`supabase/schema.sql` + Phase 1's `(portal)/internal/*` routes). **Where this section conflicts with §3–§13 below, this section wins.**

| Area | Original plan | Corrected (Phase 1/2 reality) |
|---|---|---|
| Dashboard route | `app/(portal)/dashboard/page.tsx` | `app/(portal)/internal/page.tsx` *(replaces existing welcome page)* |
| Review route | `app/(portal)/estimates/[id]/page.tsx` | `app/(portal)/internal/estimates/[id]/page.tsx` |
| API route | `app/api/estimates/[id]/route.ts` | unchanged — same path |
| Trades table | `trades` | `estimate_trades` (FK `estimate_id`, name col `trade_name`, status col `trade_status`, order col `sort_order`) |
| Line items table | `line_items` | `estimate_line_items` (FK `trade_id`, separate `material_unit_cost` + `labor_unit_cost`, generated `total`, `flags text[]`, `area_location`) |
| Comments table | `estimate_comments` | **Does not exist.** Deferred to Phase 5 (communications). For Phase 3, `request_changes` updates `review_status` + writes to `email_log`; the note travels in the outbound email body, not a DB row. |
| Estimate status col | `status` | `review_status` (values: `draft`, `in_review`, `approved`, `sent`, `archived`, `cancelled`) |
| `EstimateConfig` fields | `markupPct`, `bondPct`, `taxPct` | `overhead_pct`, `profit_pct`, `contingency_pct`, `gc_sub_markup_pct` *(snake_case TS to mirror DB; same convention as Phase 4 plan)* |
| `LineItem.unitPrice` | single field | Split into `material_unit_cost` + `labor_unit_cost`; derived `unit_cost = material + labor`. Bottom sheet edits both. |
| `LineItem.isFlagged` / `flagNote` | boolean + string | `flags: string[]` (DB stores `text[]`). Derived `is_flagged = flags.length > 0` for UI. |
| `LineItem.confidence` values | `'HIGH' \| 'MEDIUM' \| 'LOW' \| 'UNREVIEWED'` | `'high' \| 'medium' \| 'low' \| null` (DB values are lowercase; `null` for unreviewed) |
| `LineItem.area` | `area: string` | `area_location: string \| null` |
| Approval columns | `approved_by`, `approved_at` on estimates | **Need migration `0002_estimates_approval_cols.sql`** — neither column exists yet |
| Supabase server import | `import { createServerClient } from '@/lib/supabase/server'` | `import { createClient } from '@/lib/supabase/server'` *(existing wrapper exports `createClient`)* |
| `BottomTabBar` mount point | `(portal)/layout.tsx` | `(portal)/internal/layout.tsx` *(otherwise it'd appear on `/login` and `/share/[token]`)* |
| Zustand install | assumed | **Not installed** — run `npm install zustand` |
| TS field naming | mixed camelCase | All domain types use **snake_case mirroring DB columns** (matches Phase 4 convention; avoids mapping layer) |
| Grand-total formula | `subtotal * (1+markup) * (1+bond) * (1+tax)` | `direct_cost * (1+contingency/100) * (1+overhead/100) * (1+profit/100)` — `gc_sub_markup_pct` ignored in Phase 3 (per-SUB-trade markup is a Phase 4 concern when Marco edits config) |

### Prerequisites (before starting any subtask)

1. `npm install zustand` — adds zustand to deps; immer middleware ships with it
2. Apply migration `supabase/migrations/0002_estimates_approval_cols.sql` (creates `estimates.approved_by uuid` + `estimates.approved_at timestamptz`)
3. Confirm `viewport-fit=cover` is on the root `<meta name="viewport">` in `src/app/layout.tsx` *(needed for `env(safe-area-inset-bottom)` to return real values on iPhone)*
4. Confirm `.pb-safe` utility is in `globals.css` *(added in the layout task)*

### Out-of-scope for Phase 3 (defer)

- Email send for Approve / Request Changes — wire a `try { ... } catch {}` stub that writes to `email_log` with `status='queued'`. Phase 5 builds the Resend templates and actually sends.
- `EstimateConfig` editing (overhead/profit/contingency inputs) — read-only in Phase 3; Phase 4 builds the editor.
- Per-line-item soft-delete / add row — Phase 4 surface.
- Diff view / audit log UI — Phase 4 / Phase 8.

---

## 1. Phase Goal

Build the core mobile-first estimate review portal that Marco (the owner) uses on his iPhone to review, edit values, and approve construction estimates. Every interaction is thumb-first: primary actions live at the bottom of the screen, trade sections are expandable cards, and numeric edits open a bottom sheet with a decimal keypad — no laptop required, ever.

---

## 2. Success Criteria

- [ ] Dashboard renders in <300ms on a cold Supabase fetch (RSC streaming + Suspense skeleton)
- [ ] Bottom tab bar visible on all pages on iOS Safari, never covered by home indicator (safe-area-inset-bottom applied)
- [ ] No horizontal scroll at 390px or 430px viewport widths
- [ ] "Quick Approve" from dashboard card works end-to-end (DB status update + optional Resend notification)
- [ ] Flagged-item guided review walks Marco through each flag before Approve button appears
- [ ] Bottom sheet editor opens on tap of any line item total, blurs background, accepts decimal input, live-previews section total
- [ ] Swipe-left gesture on dashboard card reveals Approve / Request Changes
- [ ] Request Changes submits to `estimate_comments` table and sends email to estimator
- [ ] Session persists 30 days (Supabase auth cookie TTL set to 30d)
- [ ] Desktop layout (md: breakpoint) shows sidebar + two-column review with full table view — no regression
- [ ] All interactive elements meet 44px minimum touch target
- [ ] TypeScript strict — zero `any` types, zero `ts-ignore`

---

## 3. Pages and Components — Exact File Paths

```
src/
├── app/
│   ├── (portal)/
│   │   ├── layout.tsx                          # Minimal portal shell (already exists from Phase 1)
│   │   └── internal/
│   │       ├── layout.tsx                      # Shell: bottom tab bar (mobile) + sidebar (desktop) — UPDATED IN THIS PHASE
│   │       ├── page.tsx                        # DASHBOARD — RSC — replaces existing welcome page
│   │       └── estimates/
│   │           └── [id]/
│   │               ├── page.tsx                # RSC — fetches estimate + trades + line items
│   │               └── loading.tsx             # Suspense skeleton
│   └── api/
│       └── estimates/
│           └── [id]/
│               ├── route.ts                    # PATCH handler (status: approve, request_changes)
│               └── line-items/
│                   └── [itemId]/
│                       └── route.ts            # PATCH (qty / material_unit_cost / labor_unit_cost) — autosave target
│
├── components/
│   ├── layout/
│   │   ├── BottomTabBar.tsx                    # 'use client' — 4-tab mobile nav
│   │   └── DesktopSidebar.tsx                  # 'use client' — active link highlighting
│   │
│   ├── dashboard/
│   │   ├── EstimateCard.tsx                    # 'use client' — swipe gesture, quick-approve tap
│   │   ├── EstimateCardSkeleton.tsx            # server-safe skeleton
│   │   ├── PendingTab.tsx                      # RSC wrapper, passes data to EstimateCard list
│   │   └── TradeConfidenceDots.tsx             # Pure display, can be RSC
│   │
│   └── estimate/
│       ├── EstimatePageClient.tsx              # 'use client' — Zustand provider + hydration
│       ├── EstimateSummaryHeader.tsx           # 'use client' — reads store total
│       ├── ApproveButton.tsx                   # 'use client' — conditional Approve vs. Review Flags
│       ├── FlaggedReviewFlow.tsx               # 'use client' — sequential flag walkthrough
│       ├── TradeSection.tsx                    # 'use client' — expand/collapse, reads store
│       ├── LineItemCard.tsx                    # 'use client' — tap opens bottom sheet
│       ├── BottomSheetEditor.tsx               # 'use client' — slides up, decimal input
│       ├── RequestChangesPanel.tsx             # 'use client' — slide-up, note fields, submit
│       └── ApproveModal.tsx                    # 'use client' — post-approve notification prompt
│
├── store/
│   └── estimateStore.ts                        # Zustand store (full spec in §6)
│
├── lib/
│   ├── supabase/
│   │   ├── server.ts                           # createServerClient for RSC
│   │   └── client.ts                           # createBrowserClient (singleton)
│   └── estimates/
│       ├── queries.ts                          # Typed Supabase query fns
│       └── types.ts                            # Estimate, Trade, LineItem, Flag types
│
└── hooks/
    ├── useSwipeGesture.ts                      # Touch-based swipe detection
    ├── useBottomSheet.ts                       # Sheet open/close animation state
    └── useEstimateStore.ts                     # Re-export + selector helpers
```

---

## 4. Component Hierarchy — Review Page

```
page.tsx (RSC)
└── EstimatePageClient (CC — Zustand Provider + initial hydration)
    ├── EstimateSummaryHeader (CC)
    │   └── [grand total, flag count badge]
    ├── ApproveButton (CC)
    │   ├── <button> "APPROVE & SEND" (no flags state)
    │   └── <button> "Review 3 flagged items" (flags state)
    │       └── FlaggedReviewFlow (CC — modal-like sequential walkthrough)
    ├── [trades list — virtualized on long lists]
    │   └── TradeSection × N (CC)
    │       ├── [trade header: name, subcontractor, total, flag badge, chevron]
    │       └── [expanded] LineItemCard × N (CC)
    │           └── [tap total] → BottomSheetEditor (CC — portal to body)
    ├── RequestChangesPanel (CC — conditionally rendered)
    └── ApproveModal (CC — conditionally rendered post-approve)
```

RSC boundary: `page.tsx` fetches all data server-side and passes serializable props to `EstimatePageClient`. No client data fetching for the initial render.

---

## 5. ASCII Wireframes

### 5a. Mobile Dashboard — Pending Tab (390px)

```
┌────────────────────────────────────────┐
│  Saddlewood                        🔔  │  ← header (sticky)
│                                        │
│  ┌──────────────────────────────────┐  │
│  │ BELLEVUE CHURCH           ⚠️  3  │  │
│  │ Sunrise Community · Bid Jun 15   │  │
│  │                                  │  │
│  │           $847,500               │  │
│  │                                  │  │
│  │  ●●●●●●●●●●○○  16/18 trades     │  │
│  │  [Quick Approve]  [Review →]     │  │
│  └──────────────────────────────────┘  │
│                                        │
│  ┌──────────────────────────────────┐  │
│  │ MESA OFFICE PARK          ●      │  │
│  │ Desert Prop · Bid Jun 22         │  │
│  │                                  │  │
│  │           $312,000               │  │
│  │                                  │  │
│  │  ●●●●●●●●●●●●  12/12 trades     │  │
│  │  [Quick Approve]  [Review →]     │  │
│  └──────────────────────────────────┘  │
│                                        │
│  ┌──────────────────────────────────┐  │  ← card partially visible = more below
│  │ CHANDLER MEDICAL          ⚠️  1  │  │
│  │ ...                              │  │
│                                        │
│ ──────────────────────────────────── │
│ [Pending 2] [All]  [Bid Log] [Activity]│  ← bottom tab bar
└────────────────────────────────────────┘
  ⠿⠿⠿⠿⠿⠿⠿⠿⠿  ← iOS home indicator row (safe-area-inset-bottom)
```

Swipe-left on card reveals action tray:
```
┌──────────────────────────────────────────────┐
│ BELLEVUE CHURCH           ⚠️  3    [✓ Approve]│
│ (card slides left 120px)          [↩ Changes] │
└──────────────────────────────────────────────┘
```

### 5b. Mobile Review Page — Quick Approve State (no flags)

```
┌────────────────────────────────────────┐
│  ←  BELLEVUE CHURCH              •••  │  ← sticky nav
├────────────────────────────────────────┤
│                                        │
│             $847,500                   │
│             Grand Total                │
│         ✅ All items confirmed         │
│                                        │
│  ╔══════════════════════════════════╗  │
│  ║    APPROVE & SEND →              ║  │  ← green, full width, 56px tall
│  ╚══════════════════════════════════╝  │
├────────────────────────────────────────┤
│  FRAMING          SP   $142,500    ●  ▶│  ← collapsed trade card
│  DRYWALL          SP    $89,200    ●  ▶│
│  INSULATION       SP    $34,800    ●  ▶│
│  DOORS & FRAMES   SUB   $28,400    ●  ▶│
│  ...                                   │
│                                        │
│                                        │
│                                        │
│ ──────────────────────────────────── │
│ [Pending 2] [All]  [Bid Log] [Activity]│
└────────────────────────────────────────┘
```

### 5c. Mobile Review Page — Flagged State with Guided Review

```
┌────────────────────────────────────────┐
│  ←  BELLEVUE CHURCH              •••  │
├────────────────────────────────────────┤
│                                        │
│             $847,500                   │
│             Grand Total                │
│         ⚠️  3 items need attention     │
│                                        │
│  ╔══════════════════════════════════╗  │
│  ║  Review 3 flagged items →        ║  │  ← amber/orange, full width
│  ╚══════════════════════════════════╝  │
│                                        │
│  ┌ ─ ─ FLAG 1 of 3 ─ ─ ─ ─ ─ ─ ─ ─┐  │  ← guided review overlay card
│  │  ⚠️  FRAMING                     │  │    slides up when tapped
│  │  3-5/8" metal stud @ 16" OC      │  │
│  │  Franklin Hall                   │  │
│  │                                  │  │
│  │  Qty flagged: 842 LF             │  │
│  │  Note: "Verify with A3.1 dims"   │  │
│  │                                  │  │
│  │  [Skip]  [Flag for discussion]  [OK] │
│  └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┘  │
│                                        │
│  FRAMING          SP   $142,500   ⚠️1 ▶│
│  DRYWALL          SP    $89,200    ●  ▶│
│ ──────────────────────────────────── │
│ [Pending 2] [All]  [Bid Log] [Activity]│
└────────────────────────────────────────┘

After all flags resolved → Approve button swaps in:
│  ╔══════════════════════════════════╗  │
│  ║    APPROVE & SEND →              ║  │
│  ╚══════════════════════════════════╝  │
```

### 5d. Mobile Trade Section Card — Collapsed + Expanded

```
COLLAPSED:
┌─────────────────────────────────────────┐
│  FRAMING              SP   $142,500  ⚠️1│▶│
│  35 items · 1 flag                      │
└─────────────────────────────────────────┘

EXPANDED (▼ chevron):
┌─────────────────────────────────────────┐
│  FRAMING              SP   $142,500  ⚠️1│▼│
│  35 items · 1 flag                      │
├─────────────────────────────────────────┤
│  ┌───────────────────────────────────┐  │
│  │ 3-5/8" metal stud wall @ 16" OC  │  │  ← line item card
│  │ Franklin Hall                     │  │
│  │                                   │  │
│  │  842 LF × $3.58/LF = [$3,017]    │  │  ← tap $3,017 → bottom sheet
│  │  mat: $1.18  lab: $2.40           │  │
│  │  A3.1/B4 · Written · HIGH ✅      │  │
│  └───────────────────────────────────┘  │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │ 6" metal stud wall @ 16" OC       │  │
│  │ Franklin Hall                     │  │
│  │  318 LF × $4.12/LF = $1,310      │  │
│  │  mat: $1.52  lab: $2.60           │  │
│  │  A3.1/C2 · Written · HIGH ✅      │  │
│  └───────────────────────────────────┘  │
│  ... (more line items)                  │
└─────────────────────────────────────────┘
```

### 5e. Mobile Line Item Card (detail view)

```
┌──────────────────────────────────────────┐
│  3-5/8" metal stud wall @ 16" OC         │
│  Franklin Hall                           │
│                                          │
│  842 LF  ×  $3.58/LF  =  $3,017         │  ← $3,017 is tappable (underlined)
│               (mat: $1.18 + lab: $2.40)  │
│                                          │
│  Source: A3.1/B4 · Written · HIGH ✅     │
└──────────────────────────────────────────┘

Flag state variant:
┌──────────────────────────────────────────┐
│  ⚠️  3-5/8" metal stud wall @ 16" OC    │  ← amber left border
│  Franklin Hall                           │
│  Flag: "Confirm qty against A3.1 dims"   │
│                                          │
│  842 LF  ×  $3.58/LF  =  [$3,017]      │
│               (mat: $1.18 + lab: $2.40)  │
│                                          │
│  Source: A3.1/B4 · Scaled · MED ⚠️      │
└──────────────────────────────────────────┘
```

### 5f. Bottom Sheet Editor

The DB stores material and labor separately (`material_unit_cost` + `labor_unit_cost`), so the editor surfaces both. Quantity is also editable.

```
┌────────────────────────────────────────┐  ← full viewport, blurred bg
│  [blurred content behind...]           │
│                                        │
│  ╔══════════════════════════════════╗  │
│  ║  3-5/8" metal stud @ 16" OC     ║  │  ← item name, non-editable
│  ║                                  ║  │
│  ║         $3,017                   ║  │  ← large current total
│  ║         842 LF × $3.58/LF        ║  │  ← derived: qty × (mat + lab)
│  ║                                  ║  │
│  ║  Quantity:         [   842  ]    ║  │  ← decimal input
│  ║  Material $/unit:  [  1.18  ]    ║  │  ← decimal input, focused first
│  ║  Labor $/unit:     [  2.40  ]    ║  │  ← decimal input
│  ║                                  ║  │
│  ║  Section total: $142,500         ║  │  ← live preview (Zustand-driven)
│  ║  (was $142,500 → now $142,500)   ║  │
│  ║                                  ║  │
│  ║  [    Cancel    ]  [  Apply  ]   ║  │
│  ╚══════════════════════════════════╝  │
│  ┌──────────────────────────────────┐  │  ← native decimal keyboard
│  │  1   2   3                       │  │    (inputMode="decimal" triggers it)
│  │  4   5   6                       │  │
│  │  7   8   9                       │  │
│  │  .   0   ⌫                       │  │
│  └──────────────────────────────────┘  │
└────────────────────────────────────────┘
```

Apply behavior: write all three values via single `store.updateLineItem(id, { quantity, material_unit_cost, labor_unit_cost })`. Cancel resets the local form state without touching the store.

### 5g. Desktop Review Page Layout (md: breakpoint)

```
┌──────────────────────────────────────────────────────────────────┐
│  Saddlewood Contracting                                      🔔  │  ← top nav
├──────────────┬───────────────────────────────────────────────────┤
│  NAVIGATION  │  ← BELLEVUE CHURCH                           ···  │
│              │  ─────────────────────────────────────────────── │
│  Dashboard   │  Grand Total: $847,500    ⚠️ 3 items need attention│
│  ──────────  │                                                   │
│  Pending (2) │  [APPROVE & SEND →]      [Request Changes]        │
│  All Ests    │  ─────────────────────────────────────────────── │
│  Bid Log     ├───────────────────────────────────────────────────┤
│  Activity    │  FRAMING                                    ⚠️ 1  │
│              │  ┌──────────┬──────┬───────────┬──────┬────────┐  │
│  ──────────  │  │ Item     │ Qty  │ Unit      │ Rate │ Total  │  │
│  Settings    │  ├──────────┼──────┼───────────┼──────┼────────┤  │
│              │  │ 3-5/8"   │ 842  │ LF        │ 3.58 │ $3,017 │  │
│              │  │ stud wall│      │           │      │        │  │
│              │  │ 6" stud  │ 318  │ LF        │ 4.12 │ $1,310 │  │
│              │  └──────────┴──────┴───────────┴──────┴────────┘  │
│              │                                                   │
│              │  DRYWALL                                      ●   │
│              │  ┌──────────┬──────┬───────────┬──────┬────────┐  │
│              │  │ ...      │      │           │      │        │  │
└──────────────┴───────────────────────────────────────────────────┘
```

---

## 6. Zustand Store — Full TypeScript Implementation Spec

File: `src/store/estimateStore.ts`

```typescript
'use client'

import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { devtools } from 'zustand/middleware'

// ─── Domain types (src/lib/estimates/types.ts) ───────────────────────────────
// NOTE: All fields use snake_case mirroring DB columns. No camelCase mapping
// layer — domain objects pass straight from Supabase through the wire to the
// store. Same convention as Phase 4.

export type ConfidenceLevel = 'high' | 'medium' | 'low'
export type DimensionType = 'written' | 'scaled' | 'schedule' | 'calculated' | 'assumed'
export type ReviewStatus = 'draft' | 'in_review' | 'approved' | 'sent' | 'archived' | 'cancelled' | 'changes_requested'
export type TradeStatus = 'SP' | 'SUB' | 'DEFERRED' | 'NIS'

export interface LineItem {
  id: string
  trade_id: string
  description: string
  area_location: string | null         // e.g. "Franklin_Hall"
  quantity: number
  unit: string | null                  // "LF" | "SF" | "EA" etc.
  material_unit_cost: number           // separate from labor — schema column
  labor_unit_cost: number              // separate from material — schema column
  labor_hours_per_unit: number | null
  total: number                        // DB-generated: qty × (material + labor); store mirrors it on edits
  source_sheet: string | null          // e.g. "A3.1"
  source_grid: string | null           // e.g. "B4"
  dimension_type: DimensionType | null
  confidence: ConfidenceLevel | null   // null = unreviewed
  flags: string[]                      // empty array = not flagged
  is_allowance: boolean
  is_deleted: boolean
  is_manual_override: boolean
  sort_order: number
}

export interface Trade {
  id: string
  estimate_id: string
  trade_name: string                   // "FRAMING"
  trade_status: TradeStatus            // "SP" | "SUB" | "DEFERRED" | "NIS"
  sort_order: number
  labor_rate_override: number | null
  ai_blended_labor_rate: number | null
  // Derived (computed in store, not stored on Trade record from DB):
  line_item_ids: string[]              // ordered array of LineItem ids
  subtotal: number                     // sum of line item totals
  flag_count: number                   // count of line items where flags.length > 0
  worst_confidence: ConfidenceLevel | null
}

export interface EstimateConfig {
  overhead_pct: number
  profit_pct: number
  contingency_pct: number
  gc_sub_markup_pct: number
}

export interface Estimate {
  id: string
  job_id: string
  version: number
  review_status: ReviewStatus
  config: EstimateConfig
  direct_cost: number                  // sum of all line item totals (recomputed in store)
  grand_total: number                  // direct_cost × (1+contingency/100) × (1+overhead/100) × (1+profit/100)
  trade_ids: string[]                  // ordered
  flag_count: number                   // total across all line items
  created_at: string
  updated_at: string
  approved_by: string | null           // uuid (auth.users) — added in migration 0002
  approved_at: string | null           // ISO timestamp — added in migration 0002
}

// Job — joined into Estimate display but separate row in DB
export interface Job {
  id: string
  name: string                         // project name
  client_name: string | null
  address: string | null
  bid_due_date: string | null          // ISO date
  project_type: string | null
}

// Compound type returned by getEstimateWithTrades
export interface EstimateBundle {
  estimate: Estimate
  job: Job
  trades: Trade[]
  line_items: LineItem[]
}

// ─── Store shape ─────────────────────────────────────────────────────────────

export interface EstimateStore {
  // State
  estimate: Estimate | null
  job: Job | null
  trades: Record<string, Trade>
  lineItems: Record<string, LineItem>
  dirtyItemIds: Set<string>
  savingItemIds: Set<string>
  lastSavedAt: Date | null
  saveError: string | null
  expandedTradeIds: Set<string>
  flagReviewIndex: number           // which flag Marco is currently reviewing (0-based)
  flagReviewComplete: boolean
  bottomSheetItemId: string | null  // null = closed
  requestChangesOpen: boolean
  approveModalOpen: boolean

  // Hydration (called once from EstimatePageClient after RSC fetch)
  hydrate: (bundle: EstimateBundle) => void

  // Line item editing — patch keys mirror DB column names
  updateLineItem: (
    id: string,
    patch: Partial<Pick<LineItem, 'quantity' | 'material_unit_cost' | 'labor_unit_cost'>>
  ) => void
  openBottomSheet: (itemId: string) => void
  closeBottomSheet: () => void

  // Estimate-level config
  updateEstimateConfig: (patch: Partial<EstimateConfig>) => void

  // Trade accordion
  toggleTrade: (tradeId: string) => void
  expandTrade: (tradeId: string) => void

  // Save tracking (called by auto-save effect)
  markSaved: (id: string) => void
  markError: (id: string, err: string) => void

  // Flag review flow
  advanceFlagReview: () => void
  skipFlag: () => void
  completeFlagReview: () => void

  // Approve / request-changes UI
  openApproveModal: () => void
  closeApproveModal: () => void
  openRequestChanges: () => void
  closeRequestChanges: () => void

  // Derived helpers (not state — use selectors below)
}

// ─── Selectors (use these in components, not raw state slices) ───────────────

export const selectGrandTotal = (s: EstimateStore) =>
  s.estimate?.grand_total ?? 0

export const selectTradeSubtotalById = (tradeId: string) => (s: EstimateStore) => {
  const trade = s.trades[tradeId]
  if (!trade) return 0
  return trade.line_item_ids.reduce((sum, id) => sum + (s.lineItems[id]?.total ?? 0), 0)
}

export const selectFlaggedItems = (s: EstimateStore): LineItem[] =>
  Object.values(s.lineItems).filter((li) => li.flags.length > 0 && !li.is_deleted)

export const selectBottomSheetItem = (s: EstimateStore): LineItem | null =>
  s.bottomSheetItemId ? (s.lineItems[s.bottomSheetItemId] ?? null) : null

export const selectIsDirty = (s: EstimateStore) => s.dirtyItemIds.size > 0

// ─── Store implementation ────────────────────────────────────────────────────

export const useEstimateStore = create<EstimateStore>()(
  devtools(
    immer((set, get) => ({
      // Initial state
      estimate: null,
      job: null,
      trades: {},
      lineItems: {},
      dirtyItemIds: new Set(),
      savingItemIds: new Set(),
      lastSavedAt: null,
      saveError: null,
      expandedTradeIds: new Set(),
      flagReviewIndex: 0,
      flagReviewComplete: false,
      bottomSheetItemId: null,
      requestChangesOpen: false,
      approveModalOpen: false,

      hydrate(bundle) {
        set((s) => {
          // Decorate trades with derived line_item_ids / subtotal / flag_count
          // grouped by trade_id from the line_items slice.
          const itemsByTrade: Record<string, LineItem[]> = {}
          for (const li of bundle.line_items) {
            if (li.is_deleted) continue
            ;(itemsByTrade[li.trade_id] ??= []).push(li)
          }
          for (const arr of Object.values(itemsByTrade)) {
            arr.sort((a, b) => a.sort_order - b.sort_order)
          }
          const decoratedTrades: Record<string, Trade> = {}
          for (const t of bundle.trades) {
            const items = itemsByTrade[t.id] ?? []
            const subtotal = items.reduce((acc, li) => acc + li.total, 0)
            const flag_count = items.filter((li) => li.flags.length > 0).length
            const worst_confidence: ConfidenceLevel | null =
              items.some((li) => li.confidence === 'low') ? 'low'
              : items.some((li) => li.confidence === 'medium') ? 'medium'
              : items.some((li) => li.confidence === 'high') ? 'high'
              : null
            decoratedTrades[t.id] = {
              ...t,
              line_item_ids: items.map((li) => li.id),
              subtotal,
              flag_count,
              worst_confidence,
            }
          }
          s.estimate = bundle.estimate
          s.job = bundle.job
          s.trades = decoratedTrades
          s.lineItems = Object.fromEntries(bundle.line_items.map((li) => [li.id, li]))
          s.dirtyItemIds = new Set()
          s.savingItemIds = new Set()
          s.flagReviewIndex = 0
          s.flagReviewComplete = bundle.estimate.flag_count === 0
          s.expandedTradeIds = new Set()
        })
      },

      updateLineItem(id, patch) {
        set((s) => {
          const item = s.lineItems[id]
          if (!item) return
          Object.assign(item, patch)
          // Recompute total: qty × (material + labor) — mirrors DB generated column
          item.total = item.quantity * (item.material_unit_cost + item.labor_unit_cost)
          // Recompute trade subtotal
          const trade = s.trades[item.trade_id]
          if (trade) {
            trade.subtotal = trade.line_item_ids.reduce(
              (sum, liId) => sum + (s.lineItems[liId]?.total ?? 0),
              0
            )
          }
          // Recompute estimate direct_cost + grand_total
          if (s.estimate) {
            const direct_cost = Object.values(s.trades).reduce(
              (sum, t) => sum + t.subtotal,
              0
            )
            s.estimate.direct_cost = direct_cost
            const { overhead_pct, profit_pct, contingency_pct } = s.estimate.config
            s.estimate.grand_total =
              direct_cost *
              (1 + contingency_pct / 100) *
              (1 + overhead_pct / 100) *
              (1 + profit_pct / 100)
          }
          s.dirtyItemIds.add(id)
        })
      },

      openBottomSheet(itemId) {
        set((s) => { s.bottomSheetItemId = itemId })
      },

      closeBottomSheet() {
        set((s) => { s.bottomSheetItemId = null })
      },

      updateEstimateConfig(patch) {
        set((s) => {
          if (!s.estimate) return
          Object.assign(s.estimate.config, patch)
          // Recompute grand total with new config
          const { direct_cost } = s.estimate
          const { overhead_pct, profit_pct, contingency_pct } = s.estimate.config
          s.estimate.grand_total =
            direct_cost *
            (1 + contingency_pct / 100) *
            (1 + overhead_pct / 100) *
            (1 + profit_pct / 100)
        })
      },

      toggleTrade(tradeId) {
        set((s) => {
          if (s.expandedTradeIds.has(tradeId)) {
            s.expandedTradeIds.delete(tradeId)
          } else {
            s.expandedTradeIds.add(tradeId)
          }
        })
      },

      expandTrade(tradeId) {
        set((s) => { s.expandedTradeIds.add(tradeId) })
      },

      markSaved(id) {
        set((s) => {
          s.dirtyItemIds.delete(id)
          s.savingItemIds.delete(id)
          s.lastSavedAt = new Date()
          s.saveError = null
        })
      },

      markError(id, err) {
        set((s) => {
          s.savingItemIds.delete(id)
          s.saveError = err
        })
      },

      advanceFlagReview() {
        set((s) => {
          const flagged = Object.values(s.lineItems).filter(
            (li) => li.flags.length > 0 && !li.is_deleted
          )
          if (s.flagReviewIndex < flagged.length - 1) {
            s.flagReviewIndex += 1
          } else {
            s.flagReviewComplete = true
          }
        })
      },

      skipFlag() {
        get().advanceFlagReview()
      },

      completeFlagReview() {
        set((s) => { s.flagReviewComplete = true })
      },

      openApproveModal() {
        set((s) => { s.approveModalOpen = true })
      },

      closeApproveModal() {
        set((s) => { s.approveModalOpen = false })
      },

      openRequestChanges() {
        set((s) => { s.requestChangesOpen = true })
      },

      closeRequestChanges() {
        set((s) => { s.requestChangesOpen = false })
      },
    })),
    { name: 'EstimateStore' }
  )
)
```

Auto-save effect — put this in `EstimatePageClient.tsx`:

```typescript
// Debounced auto-save: 800ms after last change
const dirtyItemIds = useEstimateStore((s) => s.dirtyItemIds)
const lineItems = useEstimateStore((s) => s.lineItems)
const estimateId = useEstimateStore((s) => s.estimate?.id)

useEffect(() => {
  if (!estimateId || dirtyItemIds.size === 0) return
  const timer = setTimeout(async () => {
    const store = useEstimateStore.getState()
    for (const id of Array.from(dirtyItemIds)) {
      const item = lineItems[id]
      if (!item) continue
      // Optimistically mark saving — non-Immer set via getState/setState
      useEstimateStore.setState((s) => {
        s.savingItemIds.add(id)
      })
      try {
        const res = await fetch(
          `/api/estimates/${estimateId}/line-items/${id}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              quantity: item.quantity,
              material_unit_cost: item.material_unit_cost,
              labor_unit_cost: item.labor_unit_cost,
            }),
          }
        )
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        store.markSaved(id)
      } catch (err) {
        store.markError(id, String(err))
      }
    }
  }, 800)
  return () => clearTimeout(timer)
}, [dirtyItemIds, estimateId, lineItems])
```

---

## 7. Server Component vs. Client Component Boundaries

| File | Directive | Reason |
|---|---|---|
| `app/(portal)/layout.tsx` | RSC | Minimal portal shell (already exists) — no tab bar here |
| `app/(portal)/internal/layout.tsx` | RSC | Shell with `<BottomTabBar pendingCount={...} />` + `<DesktopSidebar />` — protected route group |
| `app/(portal)/internal/page.tsx` | RSC | Dashboard — fetches estimates from Supabase server-side |
| `app/(portal)/internal/estimates/[id]/page.tsx` | RSC | Fetches full estimate tree server-side |
| `components/layout/BottomTabBar.tsx` | `'use client'` | Needs `usePathname()` for active tab |
| `components/layout/DesktopSidebar.tsx` | `'use client'` | Needs `usePathname()` for active link |
| `components/dashboard/EstimateCard.tsx` | `'use client'` | Swipe gesture (touch events), Quick Approve mutation |
| `components/dashboard/TradeConfidenceDots.tsx` | RSC | Pure display, no interactivity |
| `components/dashboard/EstimateCardSkeleton.tsx` | RSC | No interactivity |
| `components/estimate/EstimatePageClient.tsx` | `'use client'` | Zustand Provider + hydration + auto-save effect |
| `components/estimate/EstimateSummaryHeader.tsx` | `'use client'` | Reads Zustand grandTotal (live) |
| `components/estimate/ApproveButton.tsx` | `'use client'` | Conditional render based on flag state; fires mutation |
| `components/estimate/FlaggedReviewFlow.tsx` | `'use client'` | Sequential UI state machine |
| `components/estimate/TradeSection.tsx` | `'use client'` | Expand/collapse state from Zustand |
| `components/estimate/LineItemCard.tsx` | `'use client'` | Tappable total → opens bottom sheet |
| `components/estimate/BottomSheetEditor.tsx` | `'use client'` | Touch animation, controlled decimal input |
| `components/estimate/RequestChangesPanel.tsx` | `'use client'` | Form state + submission |
| `components/estimate/ApproveModal.tsx` | `'use client'` | Post-approve dialog |

Rule of thumb: if it reads from Zustand or has a touch/click handler → `'use client'`. Pure display or data-fetch-only → RSC.

---

## 8. Data Fetching Pattern

### Server-side fetch in RSC page

`src/lib/estimates/queries.ts`:

```typescript
import { createClient } from '@/lib/supabase/server'
import type { Estimate, Trade, LineItem, Job, EstimateBundle } from './types'

export async function getEstimateWithTrades(id: string): Promise<EstimateBundle> {
  const supabase = await createClient()

  const { data: estimateRow, error: estErr } = await supabase
    .from('estimates')
    .select(`
      id, job_id, version, review_status,
      overhead_pct, profit_pct, contingency_pct, gc_sub_markup_pct,
      direct_cost, grand_total,
      approved_by, approved_at,
      created_at, updated_at
    `)
    .eq('id', id)
    .single()
  if (estErr || !estimateRow) throw estErr ?? new Error('Estimate not found')

  const { data: jobRow, error: jobErr } = await supabase
    .from('jobs')
    .select('id, name, client_name, address, bid_due_date, project_type')
    .eq('id', estimateRow.job_id)
    .single()
  if (jobErr || !jobRow) throw jobErr ?? new Error('Job not found')

  const { data: tradeRows, error: tradeErr } = await supabase
    .from('estimate_trades')
    .select('id, estimate_id, trade_name, trade_status, sort_order, labor_rate_override, ai_blended_labor_rate')
    .eq('estimate_id', id)
    .order('sort_order')
  if (tradeErr) throw tradeErr

  const tradeIds = (tradeRows ?? []).map((t) => t.id)
  const { data: lineItemRows, error: liErr } = await supabase
    .from('estimate_line_items')
    .select(`
      id, trade_id, description, area_location, quantity, unit,
      material_unit_cost, labor_unit_cost, labor_hours_per_unit, total,
      source_sheet, source_grid, dimension_type, confidence, flags,
      is_allowance, is_deleted, is_manual_override, sort_order
    `)
    .in('trade_id', tradeIds.length ? tradeIds : ['00000000-0000-0000-0000-000000000000'])
    .eq('is_deleted', false)
    .order('sort_order')
  if (liErr) throw liErr

  // Recompute flag_count + direct_cost client-side as source of truth
  // (the DB columns may be stale until Marco saves)
  const lineItems = (lineItemRows ?? []) as LineItem[]
  const flag_count = lineItems.filter((li) => li.flags.length > 0).length
  const direct_cost = lineItems.reduce((acc, li) => acc + Number(li.total ?? 0), 0)

  const estimate: Estimate = {
    id: estimateRow.id,
    job_id: estimateRow.job_id,
    version: estimateRow.version,
    review_status: estimateRow.review_status,
    config: {
      overhead_pct: Number(estimateRow.overhead_pct),
      profit_pct: Number(estimateRow.profit_pct),
      contingency_pct: Number(estimateRow.contingency_pct),
      gc_sub_markup_pct: Number(estimateRow.gc_sub_markup_pct),
    },
    direct_cost,
    grand_total:
      direct_cost *
      (1 + Number(estimateRow.contingency_pct) / 100) *
      (1 + Number(estimateRow.overhead_pct) / 100) *
      (1 + Number(estimateRow.profit_pct) / 100),
    trade_ids: tradeIds,
    flag_count,
    created_at: estimateRow.created_at,
    updated_at: estimateRow.updated_at,
    approved_by: estimateRow.approved_by,
    approved_at: estimateRow.approved_at,
  }

  const trades: Trade[] = (tradeRows ?? []).map((t) => ({
    ...t,
    line_item_ids: [],   // populated in store.hydrate
    subtotal: 0,         // populated in store.hydrate
    flag_count: 0,       // populated in store.hydrate
    worst_confidence: null,
  }))

  return { estimate, job: jobRow as Job, trades, line_items: lineItems }
}

export async function listEstimatesForDashboard() {
  const supabase = await createClient()
  // Latest version per job, joined with job info
  const { data, error } = await supabase
    .from('estimates')
    .select(`
      id, job_id, version, review_status, direct_cost, grand_total, updated_at,
      job:jobs(id, name, client_name, bid_due_date, project_type)
    `)
    .neq('review_status', 'archived')
    .order('updated_at', { ascending: false })
  if (error) throw error
  return data ?? []
}
```

`src/app/(portal)/internal/estimates/[id]/page.tsx`:

```typescript
import { getEstimateWithTrades } from '@/lib/estimates/queries'
import { EstimatePageClient } from '@/components/estimate/EstimatePageClient'
import { notFound } from 'next/navigation'

interface Props {
  params: Promise<{ id: string }>
}

export default async function EstimatePage({ params }: Props) {
  const { id } = await params

  let bundle
  try {
    bundle = await getEstimateWithTrades(id)
  } catch {
    notFound()
  }

  return <EstimatePageClient bundle={bundle} />
}
```

`EstimatePageClient.tsx` receives the bundle and calls `store.hydrate()` inside a `useLayoutEffect` (not `useEffect`) to avoid flash:

```typescript
'use client'
import { useLayoutEffect } from 'react'
import { useEstimateStore } from '@/store/estimateStore'
import type { EstimateBundle } from '@/lib/estimates/types'

export function EstimatePageClient({ bundle }: { bundle: EstimateBundle }) {
  const hydrate = useEstimateStore((s) => s.hydrate)

  useLayoutEffect(() => {
    hydrate(bundle)
  }, [bundle.estimate.id]) // re-hydrate only if estimate id changes

  // ... render components
}
```

---

## 9. API Routes Spec

### `PATCH /api/estimates/[id]` — Status update (approve / request changes)

File: `src/app/api/estimates/[id]/route.ts`

**Phase 5 dependency:** Email sending (Resend) and the `estimate_comments` table are built in Phase 5. For Phase 3, the `request_changes` action writes the note to `email_log` with `status='queued'` (Phase 5's email worker will pick it up). Approve fires the same stubbed email send. The `try { ... } catch {}` around email-send means missing `RESEND_API_KEY` doesn't break the user flow.

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const PatchSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('approve'),
    notifyEstimator: z.boolean(),
  }),
  z.object({
    action: z.literal('request_changes'),
    overallNote: z.string().min(1).max(2000),
    flagNotes: z.array(
      z.object({
        lineItemId: z.string().uuid(),
        note: z.string().max(500),
      })
    ).optional(),
  }),
])

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()

  // Auth check
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const parsed = PatchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const payload = parsed.data
  const estimatorEmail = process.env.ESTIMATOR_EMAIL ?? null

  if (payload.action === 'approve') {
    const { error } = await supabase
      .from('estimates')
      .update({
        review_status: 'approved',
        approved_by: user.id,
        approved_at: new Date().toISOString(),
      })
      .eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    if (payload.notifyEstimator && estimatorEmail) {
      await supabase.from('email_log').insert({
        estimate_id: id,
        recipient: estimatorEmail,
        template: 'estimate_approved',
        subject: 'Estimate approved by Marco',
        status: 'queued',
      })
    }

    return NextResponse.json({ status: 'approved' })
  }

  // request_changes
  const { error: updateErr } = await supabase
    .from('estimates')
    .update({ review_status: 'changes_requested' })
    .eq('id', id)
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  // Phase 5 will replace this with proper comments table + Resend send.
  // For now, queue the note via email_log.
  if (estimatorEmail) {
    await supabase.from('email_log').insert({
      estimate_id: id,
      recipient: estimatorEmail,
      template: 'estimate_changes_requested',
      subject: 'Marco requested changes',
      status: 'queued',
      error_message: null,
      // body lives in the subsequent comment surface; for now we keep note
      // payload addressable via a side-table or recompute from review_status.
      // Phase 5 task: introduce estimate_comments + body column on email_log.
    })
  }

  return NextResponse.json({
    status: 'changes_requested',
    note: payload.overallNote,
    flagNotes: payload.flagNotes ?? [],
  })
}
```

### `PATCH /api/estimates/[id]/line-items/[itemId]` — Autosave target

File: `src/app/api/estimates/[id]/line-items/[itemId]/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const PatchSchema = z.object({
  quantity: z.number().nonnegative().optional(),
  material_unit_cost: z.number().nonnegative().optional(),
  labor_unit_cost: z.number().nonnegative().optional(),
}).refine(
  (v) => v.quantity !== undefined || v.material_unit_cost !== undefined || v.labor_unit_cost !== undefined,
  { message: 'At least one of quantity, material_unit_cost, labor_unit_cost is required' }
)

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const { id, itemId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const parsed = PatchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  // Read current row for audit-log old_value
  const { data: before, error: beforeErr } = await supabase
    .from('estimate_line_items')
    .select('id, quantity, material_unit_cost, labor_unit_cost, trade_id')
    .eq('id', itemId)
    .single()
  if (beforeErr || !before) {
    return NextResponse.json({ error: 'Line item not found' }, { status: 404 })
  }

  // Verify the line item belongs to the estimate (cross-tenant guard)
  const { data: trade } = await supabase
    .from('estimate_trades')
    .select('estimate_id')
    .eq('id', before.trade_id)
    .single()
  if (!trade || trade.estimate_id !== id) {
    return NextResponse.json({ error: 'Estimate mismatch' }, { status: 400 })
  }

  const patch = { ...parsed.data, is_manual_override: true }
  const { data: after, error: updErr } = await supabase
    .from('estimate_line_items')
    .update(patch)
    .eq('id', itemId)
    .select('id, quantity, material_unit_cost, labor_unit_cost, total, is_manual_override')
    .single()
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

  // Append-only audit log — one row per changed field
  const overrideRows = (['quantity', 'material_unit_cost', 'labor_unit_cost'] as const)
    .filter((k) => parsed.data[k] !== undefined && parsed.data[k] !== Number(before[k]))
    .map((k) => ({
      estimate_id: id,
      trade_id: before.trade_id,
      line_item_id: itemId,
      field_name: k,
      old_value: String(before[k]),
      new_value: String(parsed.data[k]),
      changed_by: user.email ?? user.id,
    }))
  if (overrideRows.length > 0) {
    await supabase.from('estimate_overrides').insert(overrideRows)
  }

  return NextResponse.json({ item: after })
}
```

---

## 10. Bottom Tab Bar Implementation

The tab bar must appear only on mobile AND must coexist with the desktop sidebar without JS-based show/hide that causes layout shift. **Mount it in `app/(portal)/internal/layout.tsx`, not `app/(portal)/layout.tsx`** — the latter wraps login + share routes too, where the tab bar would be wrong.

### Pattern: CSS-only visibility split

`src/components/layout/BottomTabBar.tsx`:

```typescript
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, List, BookOpen, Activity } from 'lucide-react'

interface Tab {
  href: string
  label: string
  Icon: React.ComponentType<{ className?: string }>
  badge?: number
}

interface Props {
  pendingCount: number
}

export function BottomTabBar({ pendingCount }: Props) {
  const pathname = usePathname()

  const tabs: Tab[] = [
    { href: '/internal?tab=pending', label: 'Pending', Icon: Home, badge: pendingCount },
    { href: '/internal?tab=all',     label: 'All',     Icon: List },
    { href: '/internal/bid-log',     label: 'Bid Log', Icon: BookOpen },
    { href: '/internal/activity',    label: 'Activity', Icon: Activity },
  ]

  return (
    // md:hidden — invisible on desktop; the desktop sidebar handles nav there
    // pb-safe — custom utility for env(safe-area-inset-bottom)
    <nav
      className="
        fixed bottom-0 inset-x-0 z-50
        bg-[--color-background] border-t border-[--color-stone]
        flex items-stretch
        md:hidden
        pb-safe
      "
      aria-label="Main navigation"
    >
      {tabs.map(({ href, label, Icon, badge }) => {
        const isActive = pathname.startsWith(href.split('?')[0])
        return (
          <Link
            key={href}
            href={href}
            className="
              flex-1 flex flex-col items-center justify-center gap-1
              py-2 min-h-[56px]
              text-[--color-charcoal]
              data-[active=true]:text-[--color-teal]
            "
            data-active={isActive}
          >
            <div className="relative">
              <Icon className="size-6" />
              {badge != null && badge > 0 && (
                <span
                  className="
                    absolute -top-1 -right-2
                    size-4 text-[10px] font-bold
                    bg-[--color-gold] text-white
                    rounded-full flex items-center justify-center
                  "
                >
                  {badge}
                </span>
              )}
            </div>
            <span className="text-[11px] font-medium">{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
```

Safe-area utility — add to `src/app/globals.css` in the `@layer utilities` block:

```css
@layer utilities {
  .pb-safe {
    padding-bottom: env(safe-area-inset-bottom, 0px);
  }
}
```

Layout padding so content is never hidden behind the tab bar — in the **internal** portal layout:

```typescript
// app/(portal)/internal/layout.tsx
<div className="pb-[calc(56px+env(safe-area-inset-bottom,0px))] md:pb-0">
  {children}
</div>
```

Tabs route within `/internal/*`:
- `/internal?tab=pending` and `/internal?tab=all` for dashboard tabs (single page, query-param controlled)
- `/internal/bid-log` for Bid Log (built in Phase 8 — link present, target route stubbed)
- `/internal/activity` for Activity (built in Phase 8 — link present, target route stubbed)

---

## 11. Tailwind v4 Responsive Pattern

Tailwind v4 uses CSS `@theme inline` in `globals.css` — no `tailwind.config.ts`. Mobile-first is the default.

### Token definition (in `globals.css`):

```css
@import "tailwindcss";

@theme inline {
  --color-teal: #2d4a4a;
  --color-gold: #c8a55a;
  --color-background: #f5f0e8;
  --color-charcoal: #2c2926;
  --color-stone: #e2dbd0;

  --font-fraunces: 'Fraunces', serif;
  --font-inter: 'Inter', sans-serif;
}
```

### Usage in components:

```tsx
// Mobile-first: mobile styles are default; md: overrides for desktop

// Layout example — mobile single-column, desktop two-column
<div className="flex flex-col md:flex-row gap-4">

// Card background using CSS variable token
<div className="bg-[--color-background] border border-[--color-stone] rounded-xl p-4">

// Heading with brand font
<h1 className="font-[--font-fraunces] text-2xl text-[--color-charcoal]">

// Primary action button — always bottom-aligned on mobile
<button className="
  w-full py-4 px-6 rounded-xl
  bg-green-600 text-white font-semibold text-lg
  active:scale-[0.98] transition-transform
  min-h-[56px]
">

// Trade section card — mobile card, desktop table row
// Mobile: use TradeSection card component
// Desktop (md:): use table layout within the same component
<div className="
  block md:table-row
  rounded-xl md:rounded-none
  border md:border-0
  p-4 md:p-0
">

// Prevent horizontal scroll globally (set on body or root div):
// overflow-x-hidden (this is set once on the layout, never per-component)
```

### v4-specific syntax notes:

- Arbitrary CSS variable values: `bg-[--color-teal]`, `text-[--color-gold]` — these work natively in v4
- No `@apply` needed for brand colors; use the CSS variable syntax directly in className
- `@layer utilities` still works for custom utilities like `.pb-safe`
- Container queries: use `@container` and `@md:` prefix if needed for card-level responsiveness
- No `tailwind.config.ts` — all customization lives in `globals.css`

---

## 12. Testing Checklist

### Device targets

- iPhone SE (375px viewport) — smallest modern iOS device
- iPhone 14 (390px) — primary Marco device size
- iPhone 14 Plus / 15 Pro Max (430px) — wide iPhone

### Automated tests

```
[ ] Vitest unit tests for Zustand store
    [ ] updateLineItem correctly recomputes trade total and grand total
    [ ] hydrate resets dirtyItemIds and flagReviewIndex
    [ ] advanceFlagReview increments index and sets flagReviewComplete at end
    [ ] toggleTrade adds/removes from expandedTradeIds set

[ ] Playwright component tests (390px viewport)
    [ ] EstimateCard renders with correct flag badge count
    [ ] Quick Approve button hidden when flagCount > 0
    [ ] Bottom tab bar visible and all 4 tabs reachable
    [ ] No element overflows viewport width (check scrollWidth === clientWidth)
    [ ] BottomSheetEditor opens on line item total tap
    [ ] BottomSheetEditor input has inputMode="decimal"
    [ ] FlaggedReviewFlow: three sequential flags advance and show Approve at end
    [ ] Request Changes panel submits and calls PATCH /api/estimates/[id]
    [ ] Approve flow shows post-approve modal, Yes sends notification
```

### Manual iPhone testing protocol

```
[ ] Open on iPhone Safari — NOT Chrome on iPhone (Safari has different safe area behavior)
[ ] Tap "Quick Approve" on a zero-flag card — confirm one-tap approval works
[ ] Rotate to landscape — confirm no horizontal scroll appears
[ ] Expand Framing trade section — confirm all line items render without overflow
[ ] Tap a line item total — confirm bottom sheet slides up and keyboard appears
[ ] Enter a new value — confirm section total updates live
[ ] Tap Cancel — confirm no changes persisted
[ ] Enter a new value, tap Apply — confirm dirty indicator appears, auto-save fires
[ ] Verify bottom tab bar is above iOS home indicator (not covered by it)
[ ] Tap "Request Changes" — confirm note panel slides up, text area is reachable above keyboard
[ ] Approve an estimate with flags — confirm guided review flow works sequentially
[ ] Check 30-day session: log out, log back in; confirm 30-day cookie TTL set
```

---

## 13. Common Pitfalls

### iOS Safari safe area (most common mobile bug)

**Problem:** The bottom tab bar is hidden behind or overlapping the iOS home indicator bar.

**Fix:** Apply `padding-bottom: env(safe-area-inset-bottom, 0px)` to the `<nav>` element. Also add `padding-bottom: calc(56px + env(safe-area-inset-bottom, 0px))` to the main content wrapper so content isn't hidden behind the tab bar.

**Required HTML meta tag** (must be present in `app/layout.tsx`):
```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
```
Without `viewport-fit=cover`, `env(safe-area-inset-bottom)` returns 0 on all iPhones.

**Required `<html>` class or style:** none — `viewport-fit=cover` is sufficient.

---

### Zustand hydration with Server Components

**Problem:** Zustand store is initialized with empty state on the server. If a Client Component reads from the store before `hydrate()` has been called, it renders empty/null content and causes a hydration mismatch.

**Fix:** Use `useLayoutEffect` (not `useEffect`) to call `hydrate()` in `EstimatePageClient`. Render a skeleton or loading state while `estimate === null`:

```typescript
const estimate = useEstimateStore((s) => s.estimate)
if (!estimate) return <EstimatePageSkeleton />
```

**Do NOT** use `zustand/middleware/persist` for the estimate store — persisted state will conflict with fresh server data on navigation. The Zustand store is ephemeral; Supabase is the source of truth.

---

### Bottom sheet and iOS keyboard displacement

**Problem:** When the bottom sheet editor opens and the numeric keyboard appears, `window.innerHeight` shrinks. On older iOS, `position: fixed` elements can shift or disappear.

**Fix:** The bottom sheet should be positioned using `position: fixed; bottom: 0; left: 0; right: 0` with `max-height: 90dvh` (use `dvh` not `vh` — dynamic viewport height accounts for the keyboard on iOS 15.4+). For older iOS, fall back to `vh` with JS-based height adjustment.

```css
.bottom-sheet {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  max-height: 90dvh;  /* dvh = dynamic viewport height, excludes keyboard */
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}
```

---

### Horizontal scroll from overflow children

**Problem:** A table inside a trade section, or a long item description, causes the page to scroll horizontally.

**Fix:** Set `overflow-x: hidden` on the root layout `<body>` or the portal layout wrapper. For trade sections: use vertical card layout on mobile (default) and only switch to table layout at `md:` breakpoint. Never use `<table>` markup for mobile card view — use `<div>` cards and CSS Grid.

---

### `Set` in Zustand with Immer

**Problem:** Zustand's Immer middleware does not automatically handle `Set` mutations — you must use `Set` methods (`.add()`, `.delete()`) or replace the set entirely.

**Fix:** In Immer producers, mutate `Set` objects with their native methods:
```typescript
// CORRECT
s.dirtyItemIds.add(id)
s.expandedTradeIds.delete(tradeId)

// WRONG — Immer cannot track this
s.dirtyItemIds = new Set([...s.dirtyItemIds, id])
```
If you need to serialize the store (e.g., for devtools display), convert `Set` to `Array` at the serialization boundary only.

---

### `usePathname` causes full re-render on navigation

**Problem:** `BottomTabBar` calls `usePathname()`. On every route change, the component re-renders. If it's in the root layout, this is fine. But if it's nested inside a large component tree, it adds re-render cost.

**Fix:** Keep `BottomTabBar` in the root portal layout (`app/(portal)/layout.tsx`) as a direct child. It re-renders cheaply since it has no heavy children.

---

### 30-day session persistence

Supabase session TTL is configured in the Supabase Dashboard → Auth → Session settings. Set "JWT expiry" to 2592000 seconds (30 days). The browser client (`src/lib/supabase/client.ts`) already exists from Phase 1. Only modify it if you need to add explicit `storageKey` / persistence overrides; default `@supabase/ssr` config already uses localStorage with `persistSession: true`. Do not switch to `sessionStorage` — it does not survive tab closes.

---

### Server-side Supabase import

Phase 1's wrapper at `src/lib/supabase/server.ts` exports a function named **`createClient`** (not `createServerClient`). All `import { createServerClient } from '@/lib/supabase/server'` references in the plan should read:

```typescript
import { createClient } from '@/lib/supabase/server'
```

Internally, `createClient` wraps `@supabase/ssr`'s `createServerClient` with cookie plumbing.
