'use client'

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

/**
 * Collapsed/expanded trade card. Header is always visible (tappable header
 * row); expanded state reveals the trade's line items in order.
 *
 * Reads the trade and its line items via `useShallow` since both selectors
 * return arrays of objects from the store.
 */
export function TradeSection({ tradeId }: TradeSectionProps) {
  const trade = useEstimateStore((s): Trade | undefined => s.trades[tradeId])
  const expanded = useEstimateStore((s) => s.expandedTradeIds.has(tradeId))
  const lineItems = useEstimateStore(
    useShallow((s): LineItem[] => {
      const t = s.trades[tradeId]
      if (!t) return []
      return t.line_item_ids
        .map((id) => s.lineItems[id])
        .filter((li): li is LineItem => li !== undefined && !li.is_deleted)
    })
  )
  const toggleTrade = useEstimateStore((s) => s.toggleTrade)

  if (!trade) return null

  const flagCount = trade.flag_count
  const itemCount = lineItems.length

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
          {lineItems.length === 0 ? (
            <div
              className="px-4 py-4 text-sm"
              style={{ color: 'var(--color-charcoal-light)' }}
            >
              No line items.
            </div>
          ) : (
            lineItems.map((item) => (
              <div key={item.id} className="p-3">
                <LineItemCard itemId={item.id} />
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  )
}
