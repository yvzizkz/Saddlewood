'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useMemo } from 'react'
import type { DashboardEstimateRow, ReviewStatus } from '@/lib/estimates/types'
import { EstimateCard } from './EstimateCard'

interface EstimateListProps {
  estimates: DashboardEstimateRow[]
  activeTab: 'pending' | 'all'
}

// Statuses that count as "needs attention" on the Pending tab. Approved /
// sent / cancelled are filtered out; the server already strips archived.
const PENDING_STATUSES: readonly ReviewStatus[] = [
  'draft',
  'in_review',
  'changes_requested',
]

export function EstimateList({ estimates, activeTab }: EstimateListProps) {
  // Read the tab from the URL too so we stay in sync if the user uses the
  // browser back/forward buttons (the server prop is the initial truth, the
  // hook keeps us live).
  const searchParams = useSearchParams()
  const liveTab: 'pending' | 'all' =
    searchParams.get('tab') === 'all' ? 'all' : activeTab

  const filtered = useMemo<DashboardEstimateRow[]>(() => {
    if (liveTab === 'all') return estimates
    return estimates.filter((e) => PENDING_STATUSES.includes(e.review_status))
  }, [estimates, liveTab])

  const pendingActive = liveTab === 'pending'
  const allActive = liveTab === 'all'

  return (
    <div>
      <div
        role="tablist"
        aria-label="Estimate filter"
        className="flex items-center gap-2 mb-5"
      >
        <Link
          href="/internal?tab=pending"
          role="tab"
          aria-selected={pendingActive}
          className={
            'inline-flex items-center px-4 py-1.5 rounded-full text-sm font-medium transition-colors ' +
            (pendingActive
              ? 'bg-[var(--color-teal)] text-white'
              : 'bg-transparent text-[var(--color-charcoal)] border border-[var(--color-stone)] hover:bg-[var(--color-stone)]')
          }
        >
          Pending
        </Link>
        <Link
          href="/internal?tab=all"
          role="tab"
          aria-selected={allActive}
          className={
            'inline-flex items-center px-4 py-1.5 rounded-full text-sm font-medium transition-colors ' +
            (allActive
              ? 'bg-[var(--color-teal)] text-white'
              : 'bg-transparent text-[var(--color-charcoal)] border border-[var(--color-stone)] hover:bg-[var(--color-stone)]')
          }
        >
          All
        </Link>
      </div>

      {filtered.length === 0 ? (
        <div
          className="rounded-xl border border-dashed border-[var(--color-stone)] bg-white/40 p-10 text-center"
          style={{ color: 'var(--color-charcoal-light)' }}
        >
          <p className="text-sm">
            {liveTab === 'pending'
              ? 'No pending estimates'
              : 'No estimates yet'}
          </p>
        </div>
      ) : (
        <ul className="list-none p-0 m-0">
          {filtered.map((row) => (
            <li key={row.id}>
              <EstimateCard estimate={row} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
