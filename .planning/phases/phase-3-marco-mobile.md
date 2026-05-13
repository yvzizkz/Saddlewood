# Phase 3: Marco Mobile UI — Execution Plan

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
│   │   ├── layout.tsx                          # Shell: bottom tab bar (mobile) + sidebar (desktop)
│   │   ├── dashboard/
│   │   │   └── page.tsx                        # RSC — fetches pending/all estimates
│   │   └── estimates/
│   │       └── [id]/
│   │           ├── page.tsx                    # RSC — fetches estimate + trades + line items
│   │           └── loading.tsx                 # Suspense skeleton
│   └── api/
│       └── estimates/
│           └── [id]/
│               └── route.ts                    # PATCH handler (status, comments)
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

```
┌────────────────────────────────────────┐  ← full viewport, blurred bg
│  [blurred content behind...]           │
│                                        │
│  ╔══════════════════════════════════╗  │
│  ║  3-5/8" metal stud @ 16" OC     ║  │  ← item name, non-editable
│  ║                                  ║  │
│  ║         $3,017                   ║  │  ← large current value
│  ║         842 LF × $3.58/LF        ║  │
│  ║                                  ║  │
│  ║  Edit unit price:  [  3.58  ]    ║  │  ← text input, decimal, focused
│  ║                                  ║  │
│  ║  Section total: $142,500         ║  │  ← live preview
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

export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW' | 'UNREVIEWED'
export type DimensionType = 'written' | 'scaled' | 'schedule' | 'calculated' | 'assumed'
export type EstimateStatus = 'draft' | 'pending_review' | 'approved' | 'changes_requested'

export interface LineItem {
  id: string
  tradeId: string
  description: string
  area: string                      // e.g. "Franklin Hall"
  quantity: number
  unit: string                      // "LF" | "SF" | "EA" etc.
  unitPrice: number
  materialRate: number
  laborRate: number
  total: number                     // computed: quantity × unitPrice
  sourceSheet: string               // e.g. "A3.1/B4"
  dimensionType: DimensionType
  confidence: ConfidenceLevel
  isFlagged: boolean
  flagNote: string | null
}

export interface Trade {
  id: string
  estimateId: string
  name: string                      // "FRAMING"
  subcontractorCode: string         // "SP" | "SUB" | etc.
  lineItems: string[]               // ordered array of LineItem ids
  total: number                     // sum of line item totals (derived)
  flagCount: number
  confidence: ConfidenceLevel       // worst-case roll-up
}

export interface EstimateConfig {
  markupPct: number
  bondPct: number
  taxPct: number
}

export interface Estimate {
  id: string
  projectName: string
  clientName: string
  bidDueDate: string                // ISO date string
  status: EstimateStatus
  subtotal: number
  grandTotal: number
  config: EstimateConfig
  tradeIds: string[]                // ordered
  flagCount: number
  createdAt: string
  updatedAt: string
}

// ─── Store shape ─────────────────────────────────────────────────────────────

export interface EstimateStore {
  // State
  estimate: Estimate | null
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
  hydrate: (
    estimate: Estimate,
    trades: Trade[],
    lineItems: LineItem[]
  ) => void

  // Line item editing
  updateLineItem: (id: string, patch: Partial<Pick<LineItem, 'quantity' | 'unitPrice' | 'materialRate' | 'laborRate'>>) => void
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
  s.estimate?.grandTotal ?? 0

export const selectTradeTotalById = (tradeId: string) => (s: EstimateStore) => {
  const trade = s.trades[tradeId]
  if (!trade) return 0
  return trade.lineItems.reduce((sum, id) => sum + (s.lineItems[id]?.total ?? 0), 0)
}

export const selectFlaggedItems = (s: EstimateStore): LineItem[] =>
  Object.values(s.lineItems).filter((li) => li.isFlagged)

export const selectBottomSheetItem = (s: EstimateStore): LineItem | null =>
  s.bottomSheetItemId ? (s.lineItems[s.bottomSheetItemId] ?? null) : null

export const selectIsDirty = (s: EstimateStore) => s.dirtyItemIds.size > 0

// ─── Store implementation ────────────────────────────────────────────────────

export const useEstimateStore = create<EstimateStore>()(
  devtools(
    immer((set, get) => ({
      // Initial state
      estimate: null,
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

      hydrate(estimate, trades, lineItems) {
        set((s) => {
          s.estimate = estimate
          s.trades = Object.fromEntries(trades.map((t) => [t.id, t]))
          s.lineItems = Object.fromEntries(lineItems.map((li) => [li.id, li]))
          s.dirtyItemIds = new Set()
          s.savingItemIds = new Set()
          s.flagReviewIndex = 0
          s.flagReviewComplete = estimate.flagCount === 0
          s.expandedTradeIds = new Set()
        })
      },

      updateLineItem(id, patch) {
        set((s) => {
          const item = s.lineItems[id]
          if (!item) return
          Object.assign(item, patch)
          // Recompute total
          item.total = item.quantity * item.unitPrice
          // Recompute trade total
          const trade = s.trades[item.tradeId]
          if (trade) {
            trade.total = trade.lineItems.reduce(
              (sum, liId) => sum + (s.lineItems[liId]?.total ?? 0),
              0
            )
          }
          // Recompute estimate grand total from trades
          if (s.estimate) {
            const subtotal = Object.values(s.trades).reduce(
              (sum, t) => sum + t.total,
              0
            )
            s.estimate.subtotal = subtotal
            const { markupPct, bondPct, taxPct } = s.estimate.config
            s.estimate.grandTotal =
              subtotal * (1 + markupPct / 100) * (1 + bondPct / 100) * (1 + taxPct / 100)
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
          const { subtotal } = s.estimate
          const { markupPct, bondPct, taxPct } = s.estimate.config
          s.estimate.grandTotal =
            subtotal * (1 + markupPct / 100) * (1 + bondPct / 100) * (1 + taxPct / 100)
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
          const flagged = Object.values(s.lineItems).filter((li) => li.isFlagged)
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
useEffect(() => {
  const dirty = Array.from(store.dirtyItemIds)
  if (dirty.length === 0) return
  const timer = setTimeout(async () => {
    for (const id of dirty) {
      const item = store.lineItems[id]
      if (!item) continue
      set((s) => { s.savingItemIds.add(id) })
      try {
        await fetch(`/api/estimates/${estimateId}/line-items/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({ quantity: item.quantity, unitPrice: item.unitPrice }),
          headers: { 'Content-Type': 'application/json' },
        })
        store.markSaved(id)
      } catch (err) {
        store.markError(id, String(err))
      }
    }
  }, 800)
  return () => clearTimeout(timer)
}, [store.dirtyItemIds])
```

---

## 7. Server Component vs. Client Component Boundaries

| File | Directive | Reason |
|---|---|---|
| `app/(portal)/layout.tsx` | RSC | Static shell; passes no interactive state |
| `app/(portal)/dashboard/page.tsx` | RSC | Fetches estimates from Supabase server-side |
| `app/(portal)/estimates/[id]/page.tsx` | RSC | Fetches full estimate tree server-side |
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
import { createServerClient } from '@/lib/supabase/server'

export async function getEstimateWithTrades(id: string) {
  const supabase = await createServerClient()
  
  const { data: estimate, error: estErr } = await supabase
    .from('estimates')
    .select('*')
    .eq('id', id)
    .single()
  if (estErr) throw estErr

  const { data: trades, error: tradeErr } = await supabase
    .from('trades')
    .select('*')
    .eq('estimate_id', id)
    .order('sort_order')
  if (tradeErr) throw tradeErr

  const { data: lineItems, error: liErr } = await supabase
    .from('line_items')
    .select('*')
    .eq('estimate_id', id)
    .order('sort_order')
  if (liErr) throw liErr

  return { estimate, trades, lineItems }
}
```

`src/app/(portal)/estimates/[id]/page.tsx`:

```typescript
import { getEstimateWithTrades } from '@/lib/estimates/queries'
import { EstimatePageClient } from '@/components/estimate/EstimatePageClient'
import { notFound } from 'next/navigation'

interface Props {
  params: Promise<{ id: string }>
}

export default async function EstimatePage({ params }: Props) {
  const { id } = await params
  
  let data
  try {
    data = await getEstimateWithTrades(id)
  } catch {
    notFound()
  }

  // Serialize and pass to client component
  // EstimatePageClient calls store.hydrate() in a useEffect (once)
  return (
    <EstimatePageClient
      initialEstimate={data.estimate}
      initialTrades={data.trades}
      initialLineItems={data.lineItems}
    />
  )
}
```

`EstimatePageClient.tsx` receives the serialized data and calls `store.hydrate()` inside a `useLayoutEffect` (not `useEffect`) to avoid flash:

```typescript
'use client'
import { useLayoutEffect } from 'react'
import { useEstimateStore } from '@/store/estimateStore'

export function EstimatePageClient({ initialEstimate, initialTrades, initialLineItems }) {
  const hydrate = useEstimateStore((s) => s.hydrate)

  useLayoutEffect(() => {
    hydrate(initialEstimate, initialTrades, initialLineItems)
  }, [initialEstimate.id]) // re-hydrate only if estimate id changes

  // ... render components
}
```

---

## 9. API Routes Spec

### `PATCH /api/estimates/[id]` — Status update (approve / request changes)

File: `src/app/api/estimates/[id]/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
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
  const supabase = await createServerClient()

  // Auth check
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = PatchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const payload = parsed.data

  if (payload.action === 'approve') {
    const { error } = await supabase
      .from('estimates')
      .update({
        status: 'approved',
        approved_by: user.id,
        approved_at: new Date().toISOString(),
      })
      .eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    if (payload.notifyEstimator) {
      // Fire-and-forget Resend email — import sendEstimateApprovedEmail from lib
      await sendEstimateApprovedEmail(id)
    }

    return NextResponse.json({ status: 'approved' })
  }

  if (payload.action === 'request_changes') {
    // Write to estimate_comments table
    const { error: commentErr } = await supabase
      .from('estimate_comments')
      .insert({
        estimate_id: id,
        author_id: user.id,
        body: payload.overallNote,
        type: 'request_changes',
        flag_notes: payload.flagNotes ?? [],
        created_at: new Date().toISOString(),
      })
    if (commentErr) return NextResponse.json({ error: commentErr.message }, { status: 500 })

    // Update estimate status
    await supabase
      .from('estimates')
      .update({ status: 'changes_requested' })
      .eq('id', id)

    // Notify estimator via Resend
    await sendChangesRequestedEmail(id, payload.overallNote)

    return NextResponse.json({ status: 'changes_requested' })
  }
}
```

---

## 10. Bottom Tab Bar Implementation

The tab bar must appear only on mobile AND must coexist with the desktop sidebar without JS-based show/hide that causes layout shift.

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
    { href: '/dashboard?tab=pending', label: 'Pending', Icon: Home, badge: pendingCount },
    { href: '/dashboard?tab=all',     label: 'All',     Icon: List },
    { href: '/bid-log',               label: 'Bid Log', Icon: BookOpen },
    { href: '/activity',              label: 'Activity', Icon: Activity },
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

Layout padding so content is never hidden behind the tab bar — in the portal layout:

```typescript
// app/(portal)/layout.tsx
<div className="pb-[calc(56px+env(safe-area-inset-bottom,0px))] md:pb-0">
  {children}
</div>
```

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

Supabase session TTL is configured in the Supabase Dashboard → Auth → Session settings. Set "JWT expiry" to 2592000 seconds (30 days). Also set in the Supabase client:

```typescript
// src/lib/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr'

export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      persistSession: true,
      storageKey: 'saddlewood-auth',
      storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    },
  }
)
```

Ensure `persistSession: true` (default) and that localStorage is available. Do not use `sessionStorage` — it does not survive tab closes.
