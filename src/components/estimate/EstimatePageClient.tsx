'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useEstimateStore } from '@/store/estimateStore'
import type { EstimateBundle } from '@/lib/estimates/types'
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
 * store from the server-fetched bundle and renders the page structure.
 *
 * Bottom sheet editor, request-changes panel, and approve modal are Task 8 —
 * the store actions exist and are wired through child components, but the
 * visual surfaces aren't rendered yet.
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
    // We deliberately depend on bundle.estimate.id (and hydrate) rather than
    // the whole bundle, so re-renders with the same estimate don't re-hydrate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bundle.estimate.id, hydrate])

  // Debounced auto-save: 800ms after last dirty change
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
    return (
      <div
        className="min-h-screen bg-[var(--color-cream)]"
        role="status"
        aria-label="Preparing estimate"
      >
        <div className="sticky top-0 z-10 bg-[var(--color-cream)] border-b border-[var(--color-stone)] px-4 py-3">
          <div className="h-5 w-40 rounded bg-[var(--color-stone)] animate-pulse" />
        </div>
        <div className="px-4 py-8 max-w-3xl mx-auto">
          <div className="flex flex-col items-center gap-3 mb-6">
            <div className="h-12 w-56 rounded bg-[var(--color-stone)] animate-pulse" />
            <div className="h-4 w-24 rounded bg-[var(--color-stone)] animate-pulse" />
          </div>
          <div className="h-14 w-full rounded-xl bg-[var(--color-stone)] animate-pulse" />
        </div>
        <div className="px-4 max-w-3xl mx-auto space-y-3">
          <div className="h-16 rounded-xl border border-[var(--color-stone)] bg-white animate-pulse" />
          <div className="h-16 rounded-xl border border-[var(--color-stone)] bg-white animate-pulse" />
        </div>
      </div>
    )
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
