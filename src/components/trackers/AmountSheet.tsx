'use client'

import { useEffect, useState } from 'react'

import { BottomSheet } from '@/components/ui/BottomSheet'
import { lineCalc, money, money2, parseMoney } from '@/lib/trackers/core'
import type { TrackerLine } from '@/lib/trackers/types'

export type AmountField = 'thisInvoice' | 'draw'

export type AmountRequest = { line: TrackerLine; field: AmountField }

type Props = {
  request: AmountRequest | null
  onClose: () => void
  onApply: (lineId: string, field: AmountField, value: number) => void
}

const LABEL: Record<AmountField, string> = { thisInvoice: 'This invoice', draw: 'Advance draw' }
const HELP: Record<AmountField, string> = {
  thisInvoice: 'Work completed this period, billed now. It moves into completed work when the owner pays.',
  draw: 'Money requested ahead of the work (mobilization). Billed now, earned as the work is done.',
}

/**
 * Phone-first amount entry: tap the This-invoice or Draw figure on a line card
 * and this slides up with a decimal keypad, the remaining value one tap away.
 */
export function AmountSheet({ request, onClose, onApply }: Props) {
  const [raw, setRaw] = useState('')
  const line = request?.line ?? null
  const field = request?.field ?? 'thisInvoice'
  const current = line ? Number(line[field]) || 0 : 0
  const calc = line ? lineCalc(line) : null

  useEffect(() => {
    // Re-seed the draft each time the sheet opens for a different line/field.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (request) setRaw(current ? current.toFixed(2) : '')
  }, [request, current])

  if (!line || !calc) return <BottomSheet isOpen={false} onClose={onClose}>{null}</BottomSheet>

  const remainingForField = Math.max(0, field === 'thisInvoice' ? calc.remaining - calc.draw + calc.cp : calc.remaining - calc.cp)
  const parsed = parseMoney(raw)
  const invalid = Number.isNaN(parsed)
  const over = !invalid && field === 'thisInvoice' && parsed > calc.D - calc.prior + 0.005

  function apply() {
    const v = parseMoney(raw)
    if (Number.isNaN(v) || v < 0) return
    onApply(line!.id, field, v)
    onClose()
  }

  return (
    <BottomSheet isOpen={!!request} onClose={onClose} maxHeightDvh={70} ariaLabel={`${LABEL[field]} for ${line.name}`}>
      <div className="px-5 py-4 flex flex-col gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-teal)]">{LABEL[field]}</p>
          <p className="text-base mt-0.5 text-[var(--color-charcoal)]" style={{ fontFamily: 'var(--font-fraunces)' }}>
            {line.name}
          </p>
          <p className="text-xs mt-1 tabular-nums" style={{ color: 'var(--color-charcoal-light)' }}>
            {money(calc.prior)} completed before this invoice · {money(calc.D)} current total · {money(Math.max(0, calc.D - calc.prior))} left to bill
          </p>
        </div>

        <div
          className="flex items-center gap-2 border-2 rounded-xl px-4 py-3 bg-white"
          style={{ borderColor: invalid ? '#a23b2a' : 'var(--color-teal)' }}
        >
          <span className="text-2xl" style={{ color: 'var(--color-charcoal-light)' }} aria-hidden="true">
            $
          </span>
          <input
            autoFocus
            inputMode="decimal"
            aria-label={`${LABEL[field]} amount`}
            className="text-3xl font-semibold text-[var(--color-charcoal)] bg-transparent outline-none w-full tabular-nums"
            value={raw}
            placeholder="0.00"
            onChange={(e) => setRaw(e.target.value.replace(/[^0-9.,]/g, ''))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                apply()
              }
            }}
          />
        </div>
        {over ? (
          <p className="text-xs" style={{ color: '#a23b2a' }} role="alert">
            More than the {money2(Math.max(0, calc.D - calc.prior))} left on this line. You can still generate, with a warning.
          </p>
        ) : (
          <p className="text-xs" style={{ color: 'var(--color-charcoal-light)' }}>
            {HELP[field]}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          {remainingForField > 0.005 ? (
            <button
              type="button"
              onClick={() => setRaw(remainingForField.toFixed(2))}
              className="text-sm px-3 py-2 rounded-full border"
              style={{ borderColor: 'var(--color-stone)', color: 'var(--color-charcoal)' }}
            >
              {field === 'thisInvoice' ? 'Bill remaining' : 'Draw remaining'} {money(remainingForField)}
            </button>
          ) : null}
          {current > 0 ? (
            <button
              type="button"
              onClick={() => setRaw('')}
              className="text-sm px-3 py-2 rounded-full border"
              style={{ borderColor: 'var(--color-stone)', color: 'var(--color-charcoal)' }}
            >
              Clear
            </button>
          ) : null}
        </div>

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
            onClick={apply}
            disabled={invalid}
            className="flex-1 py-4 rounded-xl bg-[var(--color-teal)] text-[var(--color-cream)] font-semibold min-h-[44px] disabled:opacity-50"
          >
            Apply
          </button>
        </div>
      </div>
    </BottomSheet>
  )
}
