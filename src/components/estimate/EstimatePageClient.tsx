'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useEstimateStore } from '@/store/estimateStore'
import type { EstimateBundle } from '@/lib/estimates/types'
import { EstimateSkeleton } from './EstimateSkeleton'
import { EstimateSummaryHeader } from './EstimateSummaryHeader'
import { TradeSection } from './TradeSection'
import { BottomSheetEditor } from './BottomSheetEditor'
import { RequestChangesPanel } from './RequestChangesPanel'
import { ApproveModal } from './ApproveModal'

interface EstimatePageClientProps {
  bundle: EstimateBundle
}

/**
 * Top-level client wrapper for the estimate review page. Hydrates the Zustand
 * store from the server-fetched bundle and renders the page structure,
 * including the bottom sheet editor, request-changes panel, and approve modal.
 */
export function EstimatePageClient({ bundle }: EstimatePageClientProps) {
  const hydrate = useEstimateStore((s) => s.hydrate)
  const isHydrated = useEstimateStore(
    (s) => s.estimate !== null && s.estimate.id === bundle.estimate.id
  )
  const tradeIds = useEstimateStore(
    useShallow((s) => s.estimate?.trade_ids ?? [])
  )
  const job = useEstimateStore((s) => s.job)

  // useEffect rather than useLayoutEffect: pre-hydration skeleton already
  // prevents flash, and useLayoutEffect produces an SSR warning.
  useEffect(() => {
    hydrate(bundle)
    // Depend on the estimate id PLUS fields that change on server-side updates
    // (review_status, updated_at). Without updated_at, a router.refresh() after
    // approve/request-changes would bring back a new bundle with the same id
    // and the store would keep stale data (e.g., "APPROVE & SEND" still
    // showing after approval). updated_at is bumped by the set_updated_at()
    // trigger on any row mutation, so it's a reliable re-hydrate signal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bundle.estimate.id, bundle.estimate.review_status, bundle.estimate.updated_at, hydrate])

  // Debounced auto-save: 800ms after ANY dirty change.
  // This is a GLOBAL debounce — if Marco edits item A then starts editing item B
  // 500ms later, A's save is delayed until 800ms after B settles. This is safe
  // for the Phase 3 bottom-sheet UX (one Apply per item, batched commits), but
  // will need rethinking when Phase 4 adds inline-editable fields.
  const dirtyItemIds = useEstimateStore((s) => s.dirtyItemIds)
  const lineItems = useEstimateStore((s) => s.lineItems)
  const estimateId = useEstimateStore((s) => s.estimate?.id ?? null)

  useEffect(() => {
    if (!estimateId || dirtyItemIds.size === 0) return
    const timer = setTimeout(async () => {
      const store = useEstimateStore.getState()
      for (const id of Array.from(dirtyItemIds)) {
        const item = lineItems[id]
        if (!item) continue
        // Guard against concurrent in-flight save for the same id. Read the
        // latest snapshot directly (we deliberately don't subscribe here).
        if (useEstimateStore.getState().savingItemIds.has(id)) continue
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
          console.error('Autosave failed for', id, err)
          store.markError(id, String(err))
        }
      }
    }, 800)
    return () => clearTimeout(timer)
  }, [dirtyItemIds, estimateId, lineItems])

  // Pre-hydration: render the same shape as loading.tsx to keep layout stable.
  if (!isHydrated) {
    return <EstimateSkeleton ariaLabel="Preparing estimate" />
  }

  const jobName = job?.name ?? bundle.job.name

  return (
    <div className="min-h-screen bg-[var(--color-cream)]">
      {/* Sticky back nav */}
      <div className="sticky top-0 z-10 bg-[var(--color-cream)] border-b border-[var(--color-stone)]">
        <Link
          href="/internal"
          className="flex items-center gap-2 px-4 py-3 text-[var(--color-charcoal)] font-medium min-h-[44px]"
        >
          <span aria-hidden="true">{'←'}</span>
          <span
            style={{ fontFamily: 'var(--font-fraunces)' }}
            className="text-base uppercase tracking-wide truncate"
          >
            {jobName}
          </span>
        </Link>
      </div>

      <div className="px-4 max-w-3xl mx-auto">
        <EstimateSummaryHeader />

        <div className="space-y-3 pb-8">
          {tradeIds.map((tradeId) => (
            <TradeSection key={tradeId} tradeId={tradeId} />
          ))}
        </div>
      </div>

      {/* Spacer for bottom tab bar clearance — matches the layout's padding. */}
      <div className="h-[calc(56px+env(safe-area-inset-bottom,0px))] md:hidden" />

      <BottomSheetEditor />
      <RequestChangesPanel />
      <ApproveModal />
    </div>
  )
}
