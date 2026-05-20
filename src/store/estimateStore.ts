'use client'

import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { devtools } from 'zustand/middleware'
import { enableMapSet } from 'immer'
import type {
  ConfidenceLevel,
  Estimate,
  EstimateBundle,
  EstimateConfig,
  Job,
  LineItem,
  Trade,
} from '@/lib/estimates/types'

// Immer does not handle Map/Set mutations out of the box; this plugin must be
// called once at module load. Without it, mutating Sets like `dirtyItemIds`
// inside the immer producer throws.
enableMapSet()

// ─── File-private helpers ────────────────────────────────────────────────────

/**
 * Returns flagged, non-deleted line items sorted by `sort_order` ascending,
 * with `id` as tie-breaker. Object iteration order is not contractually
 * guaranteed for non-integer keys, so this enforces a deterministic order
 * used by both the dashboard flag count and the flag-review walkthrough.
 */
function flaggedItemsSorted(lineItems: Record<string, LineItem>): LineItem[] {
  return Object.values(lineItems)
    .filter((li) => li.flags.length > 0 && !li.is_deleted)
    .sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id))
}

/**
 * Recomputes `direct_cost` and `grand_total` on the given estimate draft from
 * the supplied trades. Mutates `estimate` in place — only safe inside an
 * Immer producer where `estimate` is already a draft.
 */
function recomputeEstimateTotals(
  estimate: Estimate,
  trades: Record<string, Trade>
): void {
  const direct_cost = Object.values(trades).reduce(
    (sum, t) => sum + t.subtotal,
    0
  )
  estimate.direct_cost = direct_cost
  const { overhead_pct, profit_pct, contingency_pct } = estimate.config
  estimate.grand_total =
    direct_cost *
    (1 + contingency_pct / 100) *
    (1 + overhead_pct / 100) *
    (1 + profit_pct / 100)
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
  flagReviewIndex: number
  flagReviewComplete: boolean
  bottomSheetItemId: string | null
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
}

// ─── Selectors (use these in components, not raw state slices) ───────────────

export const selectGrandTotal = (s: EstimateStore) =>
  s.estimate?.grand_total ?? 0

export const selectTradeSubtotalById = (tradeId: string) => (s: EstimateStore) => {
  const trade = s.trades[tradeId]
  if (!trade) return 0
  return trade.line_item_ids.reduce(
    (sum, id) => sum + (s.lineItems[id]?.total ?? 0),
    0
  )
}

/**
 * Returns array of flagged, non-deleted line items.
 *
 * **Re-render warning:** This returns a new array on every call. When using
 * in components, wrap with `useShallow` from `zustand/react/shallow`:
 *
 *   const flagged = useEstimateStore(useShallow(selectFlaggedItems))
 *
 * Otherwise the component re-renders on every store change.
 */
export const selectFlaggedItems = (s: EstimateStore): LineItem[] =>
  flaggedItemsSorted(s.lineItems)

export const selectFlaggedCount = (s: EstimateStore): number =>
  Object.values(s.lineItems).reduce(
    (n, li) => n + (li.flags.length > 0 && !li.is_deleted ? 1 : 0),
    0
  )

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
      dirtyItemIds: new Set<string>(),
      savingItemIds: new Set<string>(),
      lastSavedAt: null,
      saveError: null,
      expandedTradeIds: new Set<string>(),
      flagReviewIndex: 0,
      flagReviewComplete: false,
      bottomSheetItemId: null,
      requestChangesOpen: false,
      approveModalOpen: false,

      hydrate(bundle) {
        set((s) => {
          // Group line items by trade_id so we can decorate trades with the
          // derived fields (line_item_ids, subtotal, flag_count,
          // worst_confidence) the store treats as source of truth.
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
            const worst_confidence: ConfidenceLevel | null = items.some(
              (li) => li.confidence === 'low'
            )
              ? 'low'
              : items.some((li) => li.confidence === 'medium')
                ? 'medium'
                : items.some((li) => li.confidence === 'high')
                  ? 'high'
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
          s.lineItems = Object.fromEntries(
            bundle.line_items.map((li) => [li.id, li])
          )
          s.dirtyItemIds = new Set<string>()
          s.savingItemIds = new Set<string>()
          s.flagReviewIndex = 0
          s.flagReviewComplete = bundle.estimate.flag_count === 0
          s.expandedTradeIds = new Set<string>()
        })
      },

      updateLineItem(id, patch) {
        set((s) => {
          const item = s.lineItems[id]
          if (!item) return
          Object.assign(item, patch)
          // Recompute total: qty × (material + labor) — mirrors DB generated column
          item.total =
            item.quantity * (item.material_unit_cost + item.labor_unit_cost)
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
            recomputeEstimateTotals(s.estimate, s.trades)
          }
          s.dirtyItemIds.add(id)
        })
      },

      openBottomSheet(itemId) {
        set((s) => {
          s.bottomSheetItemId = itemId
        })
      },

      closeBottomSheet() {
        set((s) => {
          s.bottomSheetItemId = null
        })
      },

      updateEstimateConfig(patch) {
        set((s) => {
          if (!s.estimate) return
          Object.assign(s.estimate.config, patch)
          // Recompute grand total with new config
          recomputeEstimateTotals(s.estimate, s.trades)
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
        set((s) => {
          s.expandedTradeIds.add(tradeId)
        })
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
          // Note: id stays in dirtyItemIds so auto-save retries on next cycle.
          s.savingItemIds.delete(id)
          s.saveError = err
        })
      },

      advanceFlagReview() {
        set((s) => {
          const flagged = flaggedItemsSorted(s.lineItems)
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
        set((s) => {
          s.flagReviewComplete = true
        })
      },

      openApproveModal() {
        set((s) => {
          s.approveModalOpen = true
        })
      },

      closeApproveModal() {
        set((s) => {
          s.approveModalOpen = false
        })
      },

      openRequestChanges() {
        set((s) => {
          s.requestChangesOpen = true
        })
      },

      closeRequestChanges() {
        set((s) => {
          s.requestChangesOpen = false
        })
      },
    })),
    { name: 'EstimateStore' }
  )
)
