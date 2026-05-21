'use client'

import { useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useEstimateStore } from '@/store/estimateStore'
import type { LineItem, Trade } from '@/lib/estimates/types'
import { LineItemCard } from './LineItemCard'

interface TradeSectionProps {
  tradeId: string
}

function formatCurrency(value: number): string {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  })
}

// Local id generator for optimistic add-row. Doesn't need crypto-quality
// uniqueness — collisions in the temp namespace within a session are
// extremely unlikely and the server-assigned id replaces it via
// replaceLineItemId before any persisted reference matters.
let tempIdCounter = 0
function nextTempId(): string {
  tempIdCounter += 1
  return `temp-${Date.now()}-${tempIdCounter}`
}

export function TradeSection({ tradeId }: TradeSectionProps) {
  const trade = useEstimateStore((s): Trade | undefined => s.trades[tradeId])
  const expanded = useEstimateStore((s) => s.expandedTradeIds.has(tradeId))
  const estimateId = useEstimateStore((s) => s.estimate?.id ?? null)
  const addLineItem = useEstimateStore((s) => s.addLineItem)
  const replaceLineItemId = useEstimateStore((s) => s.replaceLineItemId)
  const softDeleteLineItem = useEstimateStore((s) => s.softDeleteLineItem)

  // All items in the trade (including deleted) — the "Show deleted" toggle
  // decides which to render.
  const allItems = useEstimateStore(
    useShallow((s): LineItem[] => {
      const t = s.trades[tradeId]
      if (!t) return []
      return t.line_item_ids
        .map((id) => s.lineItems[id])
        .filter((li): li is LineItem => li !== undefined)
    })
  )
  const toggleTrade = useEstimateStore((s) => s.toggleTrade)

  const [showDeleted, setShowDeleted] = useState(false)
  const [addPending, setAddPending] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  if (!trade) return null

  const flagCount = trade.flag_count
  const visibleItems = showDeleted
    ? allItems
    : allItems.filter((li) => !li.is_deleted)
  const deletedCount = allItems.filter((li) => li.is_deleted).length
  const itemCount = visibleItems.filter((li) => !li.is_deleted).length

  const handleAddRow = async () => {
    if (!estimateId || addPending) return
    setAddPending(true)
    setAddError(null)
    const tempId = nextTempId()
    addLineItem(tradeId, { id: tempId })
    try {
      const res = await fetch(`/api/estimates/${estimateId}/line-items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trade_id: tradeId }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const payload = (await res.json()) as { item: { id: string } }
      replaceLineItemId(tempId, payload.item.id)
    } catch (err) {
      console.error('Add row failed:', err)
      setAddError(String(err))
      // Roll back the optimistic add by soft-deleting locally — keeps the
      // store consistent without needing a dedicated "remove temp" action.
      // The user can toggle Show deleted to inspect; in practice they'll
      // just retry.
      softDeleteLineItem(tempId)
    } finally {
      setAddPending(false)
    }
  }

  return (
    <div className="rounded-xl border border-[var(--color-stone)] bg-white overflow-hidden">
      <button
        type="button"
        onClick={() => toggleTrade(tradeId)}
        aria-expanded={expanded}
        aria-controls={`trade-${tradeId}-items`}
        className="w-full min-h-[64px] px-4 py-3 flex items-center gap-3 text-left active:bg-[var(--color-cream)] transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span
              style={{ fontFamily: 'var(--font-fraunces)' }}
              className="text-base font-semibold uppercase tracking-wide text-[var(--color-charcoal)] truncate"
            >
              {trade.trade_name}
            </span>
            <span
              className="shrink-0 inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide border border-[var(--color-stone)] text-[var(--color-charcoal-light)]"
              aria-label={`Status ${trade.trade_status}`}
            >
              {trade.trade_status}
            </span>
          </div>
          <div
            className="text-xs"
            style={{ color: 'var(--color-charcoal-light)' }}
          >
            {itemCount} item{itemCount === 1 ? '' : 's'}
            {flagCount > 0
              ? ` · ${flagCount} flag${flagCount === 1 ? '' : 's'}`
              : ''}
          </div>
        </div>

        <div
          className="text-base font-semibold text-[var(--color-charcoal)] tabular-nums"
          aria-label={`Subtotal ${formatCurrency(trade.subtotal)}`}
        >
          {formatCurrency(trade.subtotal)}
        </div>

        {flagCount > 0 ? (
          <span
            role="status"
            aria-label={`${flagCount} flag${flagCount === 1 ? '' : 's'}`}
            className="shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-[var(--color-gold)] text-white"
          >
            <span aria-hidden="true">{'⚠'}</span>
            <span>{flagCount}</span>
          </span>
        ) : null}

        <span
          aria-hidden="true"
          className="shrink-0 text-[var(--color-charcoal-light)] transition-transform"
          style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
        >
          {'▶'}
        </span>
      </button>

      {expanded ? (
        <div
          id={`trade-${tradeId}-items`}
          className="border-t border-[var(--color-stone)] divide-y divide-[var(--color-stone)] bg-[var(--color-cream)]"
        >
          {visibleItems.length === 0 ? (
            <div
              className="px-4 py-4 text-sm"
              style={{ color: 'var(--color-charcoal-light)' }}
            >
              No line items.
            </div>
          ) : (
            visibleItems.map((item) => (
              <div key={item.id} className="p-3">
                <LineItemCard itemId={item.id} />
              </div>
            ))
          )}

          {/* Action bar: add-row + show-deleted toggle */}
          <div className="px-3 py-3 flex flex-wrap items-center justify-between gap-2 bg-white">
            <button
              type="button"
              onClick={handleAddRow}
              disabled={addPending}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 min-h-[44px] text-sm font-semibold border-2 border-dashed border-[var(--color-stone)] text-[var(--color-teal)] hover:bg-[var(--color-cream)] disabled:opacity-50"
            >
              <span aria-hidden="true">{'+'}</span>
              {addPending ? 'Adding…' : 'Add row'}
            </button>
            {deletedCount > 0 ? (
              <label className="inline-flex items-center gap-2 text-xs cursor-pointer min-h-[44px]">
                <input
                  type="checkbox"
                  checked={showDeleted}
                  onChange={(e) => setShowDeleted(e.target.checked)}
                  className="accent-[var(--color-teal)]"
                />
                <span style={{ color: 'var(--color-charcoal-light)' }}>
                  Show {deletedCount} deleted
                </span>
              </label>
            ) : null}
          </div>
          {addError ? (
            <div className="px-3 pb-3 text-xs text-red-600 bg-white" role="alert">
              Add row failed — {addError}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
