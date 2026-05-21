'use client'

import { useState } from 'react'
import { useEstimateStore } from '@/store/estimateStore'
import { LineItemCell } from './LineItemCell'

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
 * Single line item inside an expanded trade section.
 *
 * - description and area_location are inline-editable via LineItemCell
 *   (click/tap → edit input, Tab/Enter commits, Escape reverts). Edits
 *   land in the store via updateLineItemField; the autosave hook flushes
 *   2s after the user stops typing.
 * - The math row (total) is still tappable → opens BottomSheetEditor for
 *   the 3 numeric fields at once. Per-numeric-field NumericBottomSheets
 *   are wired but not yet plumbed into individual numbers; that's a
 *   follow-up when we add the diff-cell yellow-highlight UX.
 * - Soft-deleted rows render with line-through + opacity, and a small
 *   "Undo" button replaces the delete X.
 */
export function LineItemCard({ itemId }: LineItemCardProps) {
  const item = useEstimateStore((s) => s.lineItems[itemId])
  const openBottomSheet = useEstimateStore((s) => s.openBottomSheet)
  const updateLineItemField = useEstimateStore((s) => s.updateLineItemField)
  const softDeleteLineItem = useEstimateStore((s) => s.softDeleteLineItem)
  const estimateId = useEstimateStore((s) => s.estimate?.id ?? null)
  const [deletePending, setDeletePending] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  if (!item) return null

  const flagged = item.flags.length > 0
  const isManual = item.source_sheet === 'MANUAL'
  const isDeleted = item.is_deleted
  const isOverridden = item.is_manual_override
  const unitCost = item.material_unit_cost + item.labor_unit_cost
  const unitLabel = item.unit ?? 'ea'
  const dimensionLabel = item.dimension_type
    ? item.dimension_type.charAt(0).toUpperCase() + item.dimension_type.slice(1)
    : 'Unspecified'
  const confidenceLabel = item.confidence
    ? item.confidence.toUpperCase()
    : 'UNREVIEWED'
  const sourceFragment = item.source_sheet
    ? item.source_grid
      ? `${item.source_sheet}/${item.source_grid}`
      : item.source_sheet
    : 'No source'

  const cardClass = [
    'bg-white rounded-lg border border-[var(--color-stone)] p-3',
    flagged ? 'border-l-4 border-l-[var(--color-gold)]' : '',
    isDeleted ? 'opacity-60' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const handleDelete = async () => {
    if (!estimateId || deletePending) return
    setDeletePending(true)
    setDeleteError(null)
    // Optimistic local soft-delete.
    softDeleteLineItem(item.id)
    // Manual rows that haven't synced (temp-id) shouldn't hit the API.
    if (item.id.startsWith('temp-')) {
      setDeletePending(false)
      return
    }
    try {
      const res = await fetch(
        `/api/estimates/${estimateId}/line-items/${item.id}`,
        { method: 'DELETE' }
      )
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
    } catch (err) {
      // Surface the error inline; user can retry. Local state stays soft-
      // deleted so the UI matches what we sent — explicit "Retry" rather
      // than silent inconsistency.
      console.error('Soft-delete failed:', err)
      setDeleteError(String(err))
    } finally {
      setDeletePending(false)
    }
  }

  return (
    <div className={cardClass}>
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div
            style={{ fontFamily: 'var(--font-fraunces)' }}
            className={`text-base font-semibold text-[var(--color-charcoal)] leading-snug ${isDeleted ? 'line-through' : ''}`}
          >
            {flagged ? (
              <span aria-hidden="true" className="mr-1">
                {'⚠️'}
              </span>
            ) : null}
            {isManual ? (
              <span
                className="inline-flex items-center mr-2 align-middle rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-[var(--color-teal)] text-[var(--color-cream)]"
                aria-label="Manually added row"
              >
                MANUAL
              </span>
            ) : null}
            {/* description: inline-editable */}
            <span className="inline-block align-middle min-w-[8ch]">
              <LineItemCell
                field="description"
                value={item.description}
                type="text"
                onCommit={(field, value) => updateLineItemField(item.id, field, value)}
                ariaLabel={`Edit description for ${item.description || 'this row'}`}
              />
            </span>
          </div>

          {/* area_location: inline-editable */}
          <div
            className="text-xs mt-0.5"
            style={{ color: 'var(--color-charcoal-light)' }}
          >
            <LineItemCell
              field="area_location"
              value={item.area_location ?? ''}
              type="text"
              onCommit={(field, value) => updateLineItemField(item.id, field, value)}
              ariaLabel="Edit area / location"
            />
          </div>
        </div>

        {/* Delete control. Hide when already deleted — the row's strike-through
            communicates the state; an undo path can land in a later slice. */}
        {!isDeleted ? (
          <button
            type="button"
            onClick={handleDelete}
            disabled={deletePending}
            aria-label={`Delete ${item.description || 'this row'}`}
            className="shrink-0 size-8 rounded text-[var(--color-charcoal-light)] hover:bg-red-50 hover:text-red-600 disabled:opacity-40 flex items-center justify-center text-lg leading-none"
          >
            {'×'}
          </button>
        ) : null}
      </div>

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
        <span aria-hidden="true" className="mx-1">
          {'×'}
        </span>
        <span>
          {formatUnitCost(unitCost)}/{unitLabel}
        </span>
        <span aria-hidden="true" className="mx-1">
          {'='}
        </span>
        <button
          type="button"
          onClick={() => openBottomSheet(item.id)}
          aria-label={`Edit ${item.description || 'line item'} — current total ${formatCurrency(item.total)}`}
          className={`underline text-[var(--color-teal)] font-semibold active:opacity-70 min-h-[44px] inline-flex items-center ${
            isOverridden ? 'decoration-yellow-500 decoration-2' : ''
          }`}
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

      {deleteError ? (
        <div className="text-xs mt-2 text-red-600" role="alert">
          Delete failed — {deleteError}
        </div>
      ) : null}
    </div>
  )
}
