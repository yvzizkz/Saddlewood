'use client'

import { useEffect, useState } from 'react'
import { BottomSheet } from '@/components/ui/BottomSheet'

interface NumericBottomSheetProps {
  isOpen: boolean
  onClose: () => void
  onApply: (newValue: number) => void
  /** Human label for the field being edited, shown as the small all-caps header. */
  fieldLabel: string
  /** Full description of the line item for context. Truncates on overflow. */
  itemDescription: string
  /** Current (possibly already-overridden) value to seed the input with. */
  currentValue: number
  /** Original AI value for comparison header. Null hides the AI sub-label. */
  aiValue: number | null
  /** Currency / unit symbol prefix. Default '$'. Pass empty string for quantity. */
  prefix?: string
  /** Number of decimals for the seed value. Default 2. */
  decimals?: number
}

// Strip everything except digits and one decimal point. Exported for testing.
export function sanitizeDecimalInput(raw: string): string {
  const cleaned = raw.replace(/[^\d.]/g, '')
  const parts = cleaned.split('.')
  if (parts.length <= 1) return cleaned
  return `${parts[0]}.${parts.slice(1).join('')}`
}

/**
 * iPhone-first numeric editor. Tap a numeric cell on mobile → this slides
 * up with a decimal keypad. Shows the AI baseline next to the current
 * value so Marco knows what he's overriding.
 */
export function NumericBottomSheet({
  isOpen,
  onClose,
  onApply,
  fieldLabel,
  itemDescription,
  currentValue,
  aiValue,
  prefix = '$',
  decimals = 2,
}: NumericBottomSheetProps) {
  const [raw, setRaw] = useState<string>(currentValue.toFixed(decimals))

  // Re-seed the input whenever the sheet opens with a fresh item/value.
  // setState-in-effect is the simplest way to express "reset draft on
  // open"; same pattern as BottomSheetEditor.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isOpen) setRaw(currentValue.toFixed(decimals))
  }, [isOpen, currentValue, decimals])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setRaw(sanitizeDecimalInput(e.target.value))
  }

  function handleApply() {
    const num = parseFloat(raw)
    if (Number.isFinite(num)) onApply(num)
    onClose()
  }

  const parsed = parseFloat(raw)
  const isDirtyFromAi =
    aiValue !== null && Number.isFinite(parsed) && parsed !== aiValue

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      maxHeightDvh={50}
      ariaLabel={`Edit ${fieldLabel}`}
    >
      <div className="px-5 py-4 flex flex-col gap-4">
        {/* Context header */}
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-teal)]">
            {fieldLabel}
          </p>
          <p
            className="text-sm mt-0.5 truncate"
            style={{ color: 'var(--color-charcoal-light)' }}
          >
            {itemDescription}
          </p>
          {aiValue !== null && isDirtyFromAi && (
            <p
              className="text-xs mt-1"
              style={{ color: 'var(--color-charcoal-light)' }}
            >
              AI value: {prefix}
              {aiValue.toFixed(decimals)}
            </p>
          )}
        </div>

        {/* Input */}
        <div className="flex items-center gap-2 border-2 border-[var(--color-teal)] rounded-xl px-4 py-3 bg-white">
          {prefix && (
            <span
              className="text-2xl"
              style={{ color: 'var(--color-charcoal-light)' }}
              aria-hidden="true"
            >
              {prefix}
            </span>
          )}
          <input
            autoFocus
            inputMode="decimal"
            aria-label={fieldLabel}
            className="text-3xl font-semibold text-[var(--color-charcoal)] bg-transparent outline-none w-full"
            value={raw}
            onChange={handleChange}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handleApply()
              }
            }}
          />
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-4 rounded-xl border-2 border-[var(--color-stone)] text-[var(--color-charcoal)] font-semibold min-h-[44px]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="flex-1 py-4 rounded-xl bg-[var(--color-teal)] text-[var(--color-cream)] font-semibold min-h-[44px]"
          >
            Apply
          </button>
        </div>
      </div>
    </BottomSheet>
  )
}
