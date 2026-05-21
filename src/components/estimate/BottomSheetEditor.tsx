'use client'

import { useEffect, useRef, useState } from 'react'
import { useEstimateStore, selectBottomSheetItem } from '@/store/estimateStore'
import { useBottomSheet } from '@/hooks/useBottomSheet'

/**
 * Bottom sheet editor for a single line item. Edits quantity, material $/unit,
 * and labor $/unit; on Apply, dispatches `updateLineItem` and closes. The
 * autosave effect on EstimatePageClient picks up the dirty id from there.
 *
 * Local form state is kept as strings so blank inputs work naturally — the
 * numeric values are derived (with `Number(x) || 0`) on each render.
 */
export function BottomSheetEditor() {
  const bottomSheetItemId = useEstimateStore((s) => s.bottomSheetItemId)
  const item = useEstimateStore(selectBottomSheetItem)
  const trade = useEstimateStore((s) =>
    item ? (s.trades[item.trade_id] ?? null) : null
  )
  const closeBottomSheet = useEstimateStore((s) => s.closeBottomSheet)
  const updateLineItem = useEstimateStore((s) => s.updateLineItem)

  const isOpen = bottomSheetItemId !== null
  const { state, shouldRender } = useBottomSheet(isOpen)

  const [quantity, setQuantity] = useState('')
  const [material, setMaterial] = useState('')
  const [labor, setLabor] = useState('')

  const materialRef = useRef<HTMLInputElement>(null)

  // Seed local form whenever the target item changes. Keyed on item.id so
  // re-renders that keep the same item don't clobber in-progress edits.
  useEffect(() => {
    if (!item) return
    setQuantity(String(item.quantity))
    setMaterial(item.material_unit_cost.toFixed(2))
    setLabor(item.labor_unit_cost.toFixed(2))
  }, [item?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-focus the material input once the sheet has finished sliding in.
  useEffect(() => {
    if (state === 'open') {
      materialRef.current?.focus()
    }
  }, [state])

  // Esc closes the sheet.
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeBottomSheet()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, closeBottomSheet])

  if (!shouldRender || !item) return null

  const qtyNum = Number(quantity) || 0
  const matNum = Number(material) || 0
  const labNum = Number(labor) || 0
  const localTotal = qtyNum * (matNum + labNum)
  const oldItemTotal = item.total ?? 0
  const previewSectionTotal = (trade?.subtotal ?? 0) - oldItemTotal + localTotal

  const currencyFmt = (n: number) =>
    n.toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    })

  return (
    <div
      className="fixed inset-0 z-50"
      role="dialog"
      aria-modal="true"
      aria-label="Edit line item"
    >
      {/* backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-[250ms]"
        style={{ opacity: state === 'open' ? 1 : 0 }}
        onClick={closeBottomSheet}
      />
      {/* sheet */}
      <div
        className="absolute bottom-0 inset-x-0 bg-[var(--color-background)] rounded-t-2xl shadow-2xl transition-transform duration-[250ms] ease-out"
        style={{
          transform: state === 'open' ? 'translateY(0)' : 'translateY(100%)',
          maxHeight: '90dvh',
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <div className="p-6">
          <h2
            style={{ fontFamily: 'var(--font-fraunces)' }}
            className="text-xl mb-1"
          >
            {item.description}
          </h2>
          {item.area_location && (
            <p className="text-sm text-[var(--color-charcoal)] opacity-60 mb-4">
              {item.area_location}
            </p>
          )}
          {/* Current total + math row */}
          <div className="text-center mb-4">
            <div
              style={{ fontFamily: 'var(--font-fraunces)' }}
              className="text-3xl"
            >
              {currencyFmt(localTotal)}
            </div>
            <div className="text-sm opacity-60 mt-1">
              {qtyNum} {item.unit ?? ''} × ${(matNum + labNum).toFixed(2)}/unit
            </div>
          </div>
          {/* three labeled inputs */}
          <div className="space-y-3 mb-4">
            <label className="block">
              <span className="text-sm font-medium block mb-1">Quantity</span>
              <input
                inputMode="decimal"
                type="text"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-full px-3 py-3 rounded-lg border border-[var(--color-stone)] text-lg min-h-[48px]"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium block mb-1">
                Material $/unit
              </span>
              <input
                ref={materialRef}
                inputMode="decimal"
                type="text"
                value={material}
                onChange={(e) => setMaterial(e.target.value)}
                className="w-full px-3 py-3 rounded-lg border border-[var(--color-stone)] text-lg min-h-[48px]"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium block mb-1">
                Labor $/unit
              </span>
              <input
                inputMode="decimal"
                type="text"
                value={labor}
                onChange={(e) => setLabor(e.target.value)}
                className="w-full px-3 py-3 rounded-lg border border-[var(--color-stone)] text-lg min-h-[48px]"
              />
            </label>
          </div>
          {/* Section total preview */}
          <div className="text-sm text-center mb-4 opacity-70">
            Section total: {currencyFmt(previewSectionTotal)}
            {trade && Math.abs(previewSectionTotal - trade.subtotal) > 0.01 && (
              <span className="block opacity-60 text-xs">
                (was {currencyFmt(trade.subtotal)})
              </span>
            )}
          </div>
          {/* Buttons */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={closeBottomSheet}
              className="flex-1 min-h-[56px] rounded-xl border border-[var(--color-stone)] font-medium"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                updateLineItem(item.id, {
                  quantity: qtyNum,
                  material_unit_cost: matNum,
                  labor_unit_cost: labNum,
                })
                closeBottomSheet()
              }}
              className="flex-1 min-h-[56px] rounded-xl bg-[var(--color-teal)] text-white font-semibold"
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
