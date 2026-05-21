'use client'

import { useState } from 'react'
import {
  useEstimateStore,
  selectFlaggedCount,
} from '@/store/estimateStore'
import { FlaggedReviewFlow } from './FlaggedReviewFlow'

/**
 * The primary call-to-action below the summary header. Two states:
 *
 * 1. **Approve** — full-width green button when there are no flags OR all
 *    flags have been reviewed (`flagReviewComplete === true`). Tap opens the
 *    approve modal (Task 8) via the store action.
 * 2. **Review flags** — full-width amber button when there are unreviewed
 *    flags. Tap opens an inline `FlaggedReviewFlow` overlay tracked by local
 *    state (not the store — the overlay is purely a UI surface for the
 *    existing `flagReviewIndex` walkthrough).
 */
export function ApproveButton() {
  const flagCount = useEstimateStore(selectFlaggedCount)
  const flagReviewComplete = useEstimateStore((s) => s.flagReviewComplete)
  const openApproveModal = useEstimateStore((s) => s.openApproveModal)
  const [flowOpen, setFlowOpen] = useState<boolean>(false)

  const showApprove = flagCount === 0 || flagReviewComplete

  if (showApprove) {
    return (
      <button
        type="button"
        onClick={openApproveModal}
        className="w-full bg-green-600 text-white rounded-xl py-4 px-6 font-semibold text-lg active:scale-[0.98] transition-transform min-h-[56px] flex items-center justify-center gap-2"
      >
        <span>APPROVE &amp; SEND</span>
        <span aria-hidden="true">{'→'}</span>
      </button>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setFlowOpen(true)}
        className="w-full bg-[var(--color-gold)] text-white rounded-xl py-4 px-6 font-semibold text-lg active:scale-[0.98] transition-transform min-h-[56px] flex items-center justify-center gap-2"
      >
        <span>Review {flagCount} flagged item{flagCount === 1 ? '' : 's'}</span>
        <span aria-hidden="true">{'→'}</span>
      </button>
      <FlaggedReviewFlow
        isOpen={flowOpen}
        onClose={() => setFlowOpen(false)}
      />
    </>
  )
}
