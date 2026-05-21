'use client'

import {
  useEstimateStore,
  selectGrandTotal,
  selectFlaggedCount,
} from '@/store/estimateStore'
import { ApproveButton } from './ApproveButton'

function formatCurrency(value: number): string {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  })
}

/**
 * Centered hero section above the trade list: large grand total, status line
 * (flag count or all-clear), and the Approve / Review-Flags action button.
 *
 * All selectors return primitives, so no `useShallow` needed.
 */
export function EstimateSummaryHeader() {
  const grandTotal = useEstimateStore(selectGrandTotal)
  const flagCount = useEstimateStore(selectFlaggedCount)

  return (
    <div className="py-6 md:py-8">
      <div className="text-center mb-5">
        <div
          style={{ fontFamily: 'var(--font-fraunces)' }}
          className="text-4xl md:text-5xl font-medium text-[var(--color-charcoal)] leading-none"
        >
          {formatCurrency(grandTotal)}
        </div>
        <div
          className="text-sm mt-2 uppercase tracking-wide"
          style={{ color: 'var(--color-charcoal-light)' }}
        >
          Grand Total
        </div>

        {flagCount > 0 ? (
          <div className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-[var(--color-gold-accessible)]">
            <span aria-hidden="true">{'⚠️'}</span>
            <span>
              {flagCount} {flagCount === 1 ? 'item needs' : 'items need'}{' '}
              attention
            </span>
          </div>
        ) : (
          <div className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-[var(--color-teal)]">
            <span aria-hidden="true">{'✅'}</span>
            <span>All items confirmed</span>
          </div>
        )}
      </div>

      <ApproveButton />
    </div>
  )
}
