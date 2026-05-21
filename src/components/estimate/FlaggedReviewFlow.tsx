'use client'

import { useEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'
import {
  useEstimateStore,
  selectFlaggedItems,
} from '@/store/estimateStore'

interface FlaggedReviewFlowProps {
  isOpen: boolean
  onClose: () => void
}

/**
 * Sequential overlay walkthrough of flagged line items. Shows one card at a
 * time with [Skip] [Flag for discussion] [OK] actions. The store owns the
 * cursor (`flagReviewIndex`) and the completion flag (`flagReviewComplete`);
 * this component is just the visual surface.
 *
 * When the cursor advances past the last flag, the store sets
 * `flagReviewComplete=true` and a useEffect here calls `onClose()` to let the
 * Approve button swap in.
 */
export function FlaggedReviewFlow({ isOpen, onClose }: FlaggedReviewFlowProps) {
  // useShallow because selectFlaggedItems returns a fresh array each call.
  const flagged = useEstimateStore(useShallow(selectFlaggedItems))
  const flagReviewIndex = useEstimateStore((s) => s.flagReviewIndex)
  const flagReviewComplete = useEstimateStore((s) => s.flagReviewComplete)
  const advanceFlagReview = useEstimateStore((s) => s.advanceFlagReview)

  const total = flagged.length
  const safeIndex = Math.min(flagReviewIndex, Math.max(0, total - 1))
  const current = total > 0 ? flagged[safeIndex] : null

  // Auto-close when the walkthrough finishes. We watch both the index and the
  // completion flag because advanceFlagReview() on the last item sets
  // flagReviewComplete=true without bumping the index past the end.
  useEffect(() => {
    if (!isOpen) return
    if (total === 0 || flagReviewComplete) {
      onClose()
    }
  }, [isOpen, total, flagReviewComplete, onClose])

  if (!isOpen || !current) return null

  function handleSkip() {
    advanceFlagReview()
  }

  function handleFlagForDiscussion() {
    // TODO Phase 5: persist discussion note alongside the flag so the
    // estimator sees Marco's annotation. For v1 we treat this the same as
    // Skip — moves the cursor forward without resolving the flag.
    advanceFlagReview()
  }

  function handleOk() {
    advanceFlagReview()
  }

  const qtyDisplay = current.unit
    ? `${current.quantity} ${current.unit}`
    : `${current.quantity}`
  const noteDisplay =
    current.flags.length > 0 ? current.flags.join('; ') : 'No note provided'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6 bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-label="Flagged item review"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl bg-white border-l-4 border-[var(--color-gold)] shadow-xl p-5"
      >
        <div
          className="text-xs font-semibold uppercase tracking-wide mb-3"
          style={{ color: 'var(--color-charcoal-light)' }}
        >
          Flag {safeIndex + 1} of {total}
        </div>

        <div
          style={{ fontFamily: 'var(--font-fraunces)' }}
          className="text-lg font-medium text-[var(--color-charcoal)] mb-1"
        >
          <span aria-hidden="true" className="mr-1">{'⚠️'}</span>
          {current.description}
        </div>

        {current.area_location ? (
          <div
            className="text-sm mb-3"
            style={{ color: 'var(--color-charcoal-light)' }}
          >
            {current.area_location}
          </div>
        ) : null}

        <dl className="text-sm space-y-1 mb-4">
          <div className="flex gap-2">
            <dt
              className="font-medium"
              style={{ color: 'var(--color-charcoal-light)' }}
            >
              Qty flagged:
            </dt>
            <dd className="text-[var(--color-charcoal)]">{qtyDisplay}</dd>
          </div>
          <div className="flex gap-2">
            <dt
              className="font-medium shrink-0"
              style={{ color: 'var(--color-charcoal-light)' }}
            >
              Note:
            </dt>
            <dd className="text-[var(--color-charcoal)]">{noteDisplay}</dd>
          </div>
        </dl>

        <div className="flex flex-col sm:flex-row gap-2">
          <button
            type="button"
            onClick={handleSkip}
            className="flex-1 min-h-[44px] rounded-lg border border-[var(--color-stone)] bg-white text-[var(--color-charcoal)] font-medium px-4 py-2 active:scale-[0.98] transition-transform"
          >
            Skip
          </button>
          <button
            type="button"
            onClick={handleFlagForDiscussion}
            className="flex-1 min-h-[44px] rounded-lg border border-[var(--color-gold)] bg-white text-[var(--color-gold-accessible)] font-medium px-4 py-2 active:scale-[0.98] transition-transform"
          >
            Flag for discussion
          </button>
          <button
            type="button"
            onClick={handleOk}
            className="flex-1 min-h-[44px] rounded-lg bg-[var(--color-teal)] text-white font-semibold px-4 py-2 active:scale-[0.98] transition-transform"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  )
}
