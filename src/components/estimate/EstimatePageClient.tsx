'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useEstimateStore } from '@/store/estimateStore'
import { useAutosave } from '@/hooks/useAutosave'
import type { EstimateBundle } from '@/lib/estimates/types'
import { AutosaveIndicator } from './AutosaveIndicator'
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
  const bottomSheetItemId = useEstimateStore((s) => s.bottomSheetItemId)

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

  // Per-item debounced autosave (replaces Phase 3's global 800ms debounce).
  // Each line item flushes 2s after its own last edit, independent of edits
  // to sibling items — so Marco editing item A then immediately tabbing to
  // item B doesn't defer A's save until B settles.
  const { status: saveStatus, lastSavedAt, triggerSave } = useAutosave({
    estimateId: bundle.estimate.id,
  })

  // Pre-hydration: render the same shape as loading.tsx to keep layout stable.
  if (!isHydrated) {
    return <EstimateSkeleton ariaLabel="Preparing estimate" />
  }

  const jobName = job?.name ?? bundle.job.name

  return (
    <div className="min-h-screen bg-[var(--color-cream)]">
      {/* Sticky back nav */}
      <div className="sticky top-0 z-10 bg-[var(--color-cream)] border-b border-[var(--color-stone)]">
        <div className="flex items-center justify-between gap-3 px-4 py-3 min-h-[44px]">
          <Link
            href="/internal"
            className="flex items-center gap-2 text-[var(--color-charcoal)] font-medium min-w-0"
          >
            <span aria-hidden="true">{'←'}</span>
            <span
              style={{ fontFamily: 'var(--font-fraunces)' }}
              className="text-base uppercase tracking-wide truncate"
            >
              {jobName}
            </span>
          </Link>
          <AutosaveIndicator
            status={saveStatus}
            lastSavedAt={lastSavedAt}
            onRetry={triggerSave}
          />
        </div>
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

      <BottomSheetEditor key={bottomSheetItemId ?? 'none'} />
      <RequestChangesPanel />
      <ApproveModal />
    </div>
  )
}
