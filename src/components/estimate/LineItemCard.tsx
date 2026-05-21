'use client'

import { useEstimateStore } from '@/store/estimateStore'

interface LineItemCardProps {
  itemId: string
}

function formatCurrency(value: number): string {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  })
}

function formatUnitCost(value: number): string {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/**
 * Single line item inside an expanded trade section. The total amount is a
 * tappable button that opens the bottom sheet editor (Task 8). When the line
 * has flags, we paint a left amber rule and prefix the description with a
 * warning glyph.
 */
export function LineItemCard({ itemId }: LineItemCardProps) {
  const item = useEstimateStore((s) => s.lineItems[itemId])
  const openBottomSheet = useEstimateStore((s) => s.openBottomSheet)

  if (!item) return null

  const flagged = item.flags.length > 0
  const unitCost = item.material_unit_cost + item.labor_unit_cost
  const unitLabel = item.unit ?? 'ea'
  const dimensionLabel = item.dimension_type
    ? item.dimension_type.charAt(0).toUpperCase() + item.dimension_type.slice(1)
    : 'Unspecified'
  const confidenceLabel = item.confidence ? item.confidence.toUpperCase() : 'UNREVIEWED'
  const sourceFragment = item.source_sheet
    ? item.source_grid
      ? `${item.source_sheet}/${item.source_grid}`
      : item.source_sheet
    : 'No source'

  const cardClass = flagged
    ? 'bg-white rounded-lg border border-[var(--color-stone)] border-l-4 border-l-[var(--color-gold)] p-3'
    : 'bg-white rounded-lg border border-[var(--color-stone)] p-3'

  return (
    <div className={cardClass}>
      <div
        style={{ fontFamily: 'var(--font-fraunces)' }}
        className="text-base font-semibold text-[var(--color-charcoal)] leading-snug"
      >
        {flagged ? (
          <span aria-hidden="true" className="mr-1">{'⚠️'}</span>
        ) : null}
        {item.description}
      </div>

      {item.area_location ? (
        <div
          className="text-xs mt-0.5"
          style={{ color: 'var(--color-charcoal-light)' }}
        >
          {item.area_location}
        </div>
      ) : null}

      {flagged ? (
        <div
          className="text-xs mt-2 italic"
          style={{ color: 'var(--color-gold-accessible)' }}
        >
          Flag: {item.flags.join('; ')}
        </div>
      ) : null}

      <div className="mt-3 text-sm text-[var(--color-charcoal)] tabular-nums">
        <span>
          {item.quantity} {unitLabel}
        </span>
        <span aria-hidden="true" className="mx-1">{'×'}</span>
        <span>
          {formatUnitCost(unitCost)}/{unitLabel}
        </span>
        <span aria-hidden="true" className="mx-1">{'='}</span>
        <button
          type="button"
          onClick={() => openBottomSheet(item.id)}
          aria-label={`Edit ${item.description} — current total ${formatCurrency(item.total)}`}
          className="underline text-[var(--color-teal)] font-semibold active:opacity-70 min-h-[44px] inline-flex items-center"
        >
          {formatCurrency(item.total)}
        </button>
      </div>

      <div
        className="text-xs mt-1 tabular-nums"
        style={{ color: 'var(--color-charcoal-light)' }}
      >
        mat: {formatUnitCost(item.material_unit_cost)} · lab:{' '}
        {formatUnitCost(item.labor_unit_cost)}
      </div>

      <div
        className="text-xs mt-1"
        style={{ color: 'var(--color-charcoal-light)' }}
      >
        {sourceFragment} · {dimensionLabel} · {confidenceLabel}
      </div>
    </div>
  )
}
