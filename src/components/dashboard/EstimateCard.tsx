'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { DashboardEstimateRow } from '@/lib/estimates/types'
import { useSwipeGesture } from '@/hooks/useSwipeGesture'

interface EstimateCardProps {
  estimate: DashboardEstimateRow
}

// Phase 3 places flag_count on the joined row in a later task. For now we
// derive a "flagged" boolean from review_status === 'changes_requested' as a
// stand-in so the UI shows the two visual branches (clean vs. flagged).
function deriveFlagCount(row: DashboardEstimateRow): number {
  return row.review_status === 'changes_requested' ? 1 : 0
}

function formatBidDue(iso: string | null): string {
  if (!iso) return 'No bid date'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'No bid date'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatCurrency(value: number): string {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  })
}

export function EstimateCard({ estimate }: EstimateCardProps) {
  const router = useRouter()
  const [swipeOpen, setSwipeOpen] = useState<boolean>(false)
  const [approving, setApproving] = useState<boolean>(false)

  const { bind, swipeOffsetX } = useSwipeGesture({
    onSwipeLeft: () => setSwipeOpen(true),
    onSwipeRight: () => setSwipeOpen(false),
    threshold: 80,
  })

  const flagCount = deriveFlagCount(estimate)
  const flagged = flagCount > 0

  const job = estimate.job
  const projectName = job?.name ?? 'Untitled project'
  const clientName = job?.client_name ?? 'Unknown client'
  const bidLabel = formatBidDue(job?.bid_due_date ?? null)
  const totalLabel = formatCurrency(estimate.grand_total)

  // While the finger is on the card we follow the drag directly (clamped to
  // 120px). When swipe-open is latched we hold at the open offset so the
  // action tray stays visible. Negative values translate the card to the
  // left; touchend resets swipeOffsetX to 0 in the hook itself.
  const dragOffset = Math.max(-120, Math.min(0, swipeOffsetX))
  const restingOffset = swipeOpen ? -120 : 0
  const visualOffset = swipeOffsetX < 0 ? dragOffset : restingOffset

  function navigateToDetail() {
    router.push(`/internal/estimates/${estimate.id}`)
  }

  async function handleQuickApprove() {
    if (flagged || approving) return
    setApproving(true)
    try {
      const res = await fetch(`/api/estimates/${estimate.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve', notifyEstimator: false }),
      })
      if (!res.ok) {
        // PATCH endpoint is built in a later phase-3 task; surface a
        // lightweight error rather than blocking the UX.
        if (res.status === 404) {
          window.alert('Quick approve endpoint coming soon.')
        } else {
          window.alert(`Approve failed (${res.status}).`)
        }
        return
      }
      router.refresh()
    } catch {
      window.alert('Approve failed — check your connection and retry.')
    } finally {
      setApproving(false)
    }
  }

  return (
    <div className="relative mb-3">
      {/* Action tray revealed by the swipe gesture. Sits behind the card so
          the card slides off it. Only visually present while dragging or
          latched open. */}
      <div
        aria-hidden={!swipeOpen && swipeOffsetX >= 0}
        className="absolute inset-y-0 right-0 flex items-center gap-2 pr-3"
      >
        <button
          type="button"
          onClick={() => {
            setSwipeOpen(false)
            void handleQuickApprove()
          }}
          disabled={flagged || approving}
          className="h-10 px-3 rounded text-white text-sm font-medium bg-[var(--color-teal)] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {'✓ Approve'}
        </button>
        <button
          type="button"
          onClick={() => {
            setSwipeOpen(false)
            navigateToDetail()
          }}
          className="h-10 px-3 rounded text-sm font-medium border border-[var(--color-stone)] bg-white text-[var(--color-charcoal)]"
        >
          {'↩ Changes'}
        </button>
      </div>

      <div
        onTouchStart={bind.onTouchStart}
        onTouchMove={bind.onTouchMove}
        onTouchEnd={bind.onTouchEnd}
        onClick={() => {
          if (swipeOpen) setSwipeOpen(false)
        }}
        style={{
          transform: `translateX(${visualOffset}px)`,
          transition:
            swipeOffsetX === 0 ? 'transform 150ms ease-out' : 'none',
        }}
        className="relative rounded-xl border border-[var(--color-stone)] bg-white p-4"
      >
        {/* Top row: project name + flag/confidence indicator */}
        <div className="flex items-start justify-between gap-3 mb-1">
          <h2
            style={{ fontFamily: 'var(--font-fraunces)' }}
            className="text-lg font-medium leading-snug text-[var(--color-charcoal)]"
          >
            {projectName}
          </h2>
          {flagged ? (
            <span
              role="status"
              aria-label={`${flagCount} flag${flagCount === 1 ? '' : 's'}`}
              className="shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-[var(--color-gold)] text-[var(--color-charcoal)]"
            >
              <span aria-hidden="true">{'⚠'}</span>
              <span>{flagCount}</span>
            </span>
          ) : (
            <span
              role="status"
              aria-label="No flags"
              className="shrink-0 size-3 rounded-full bg-[var(--color-teal)]"
            />
          )}
        </div>

        {/* Sub-row: client + bid date */}
        <p
          className="text-sm mb-4"
          style={{ color: 'var(--color-charcoal-light)' }}
        >
          {clientName} {'·'} Bid {bidLabel}
        </p>

        {/* Centered total */}
        <div className="text-center mb-4">
          <div
            style={{ fontFamily: 'var(--font-fraunces)' }}
            className="text-3xl font-medium text-[var(--color-charcoal)]"
          >
            {totalLabel}
          </div>
          <div
            className="text-xs mt-1"
            style={{ color: 'var(--color-charcoal-light)' }}
          >
            {/* Per spec: trade-level confidence isn't on the dashboard row,
                so we render a placeholder rather than misleading dots. */}
            {'—'} trades
          </div>
        </div>

        {/* Action row */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              void handleQuickApprove()
            }}
            disabled={flagged || approving}
            aria-disabled={flagged || approving}
            className="flex-1 h-10 rounded text-sm font-medium text-white bg-[var(--color-teal)] disabled:bg-[var(--color-stone-mid)] disabled:text-[var(--color-charcoal-light)] disabled:cursor-not-allowed"
          >
            {approving ? 'Approving…' : 'Quick Approve'}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              navigateToDetail()
            }}
            className="flex-1 h-10 rounded text-sm font-medium border border-[var(--color-stone)] bg-white text-[var(--color-charcoal)] hover:bg-[var(--color-cream)] transition-colors"
          >
            {'Review →'}
          </button>
        </div>
      </div>
    </div>
  )
}
