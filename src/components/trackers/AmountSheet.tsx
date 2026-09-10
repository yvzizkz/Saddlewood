'use client'

import { useState } from 'react'

import { BottomSheet } from '@/components/ui/BottomSheet'
import { lineCalc, money, money2, parseMoney } from '@/lib/trackers/core'
import type { TrackerLine } from '@/lib/trackers/types'
import { selectOnFocus } from './format'

export type AmountField = 'thisInvoice' | 'draw'

export type AmountRequest = { line: TrackerLine; field: AmountField }

type Props = {
  request: AmountRequest | null
  onClose: () => void
  onApply: (lineId: string, field: AmountField, value: number) => void
}

const LABEL: Record<AmountField, string> = { thisInvoice: 'This invoice', draw: 'Advance draw' }
const HELP: Record<AmountField, string> = {
  thisInvoice: 'Work completed this period, billed now.',
  draw: 'Requested ahead of the work; earned as it is done.',
}

/**
 * Phone-first amount entry: tap the This-invoice or Draw figure on a line card
 * and this slides up with a decimal keypad, the remaining value one tap away.
 */
export function AmountSheet({ request, onClose, onApply }: Props) {
  return (
    <BottomSheet isOpen={!!request} onClose={onClose} maxHeightDvh={70} ariaLabel={request ? `${LABEL[request.field]} for ${request.line.name}` : 'Amount'}>
      {request ? <AmountForm key={`${request.line.id}:${request.field}`} line={request.line} field={request.field} onClose={onClose} onApply={onApply} /> : null}
    </BottomSheet>
  )
}

function AmountForm({ line, field, onClose, onApply }: { line: TrackerLine; field: AmountField } & Omit<Props, 'request'>) {
  const current = Number(line[field]) || 0
  const [raw, setRaw] = useState(current ? current.toFixed(2) : '')
  const calc = lineCalc(line)
  const left = Math.max(0, calc.D - calc.prior)
  // What this field could be set to without over-billing the line (the other field stays as it is).
  const other = field === 'thisInvoice' ? calc.draw : calc.cp
  const fillValue = Math.max(0, left - other)
  const parsed = parseMoney(raw)
  const invalid = Number.isNaN(parsed) || parsed < 0
  const over = !invalid && parsed + other > left + 0.005

  function apply() {
    if (invalid) return
    onApply(line.id, field, parsed)
    onClose()
  }

  return (
    <div className="px-5 py-4 flex flex-col gap-3">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-teal)]">{LABEL[field]}</p>
        <p className="text-base mt-0.5 text-[var(--color-charcoal)] line-clamp-2" style={{ fontFamily: 'var(--font-fraunces)' }}>
          {line.name}
        </p>
        <p className="text-xs mt-1 tabular-nums" style={{ color: 'var(--color-charcoal-light)' }}>
          {money(calc.prior)} completed before · {money(calc.D)} total · {money(left)} left to bill
        </p>
      </div>

      <div className="flex items-center gap-2 border-2 rounded-xl px-4 py-2.5 bg-white" style={{ borderColor: invalid ? '#a23b2a' : 'var(--color-teal)' }}>
        <span className="text-2xl" style={{ color: 'var(--color-charcoal-light)' }} aria-hidden="true">
          $
        </span>
        <input
          autoFocus
          inputMode="decimal"
          aria-label={`${LABEL[field]} amount`}
          className="text-3xl font-semibold text-[var(--color-charcoal)] bg-transparent outline-none focus-visible:outline-none w-full tabular-nums"
          value={raw}
          placeholder="0.00"
          onFocus={selectOnFocus}
          onChange={(e) => setRaw(e.target.value.replace(/[^0-9.,]/g, ''))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              apply()
            }
          }}
        />
      </div>
      <p className="text-xs" style={{ color: over ? '#a23b2a' : 'var(--color-charcoal-light)' }} role={over ? 'alert' : undefined}>
        {over ? `More than the ${money2(Math.max(0, left - other))} still open on this line. You can still generate, with a warning.` : HELP[field]}
      </p>

      <div className="flex flex-wrap gap-2">
        {fillValue > 0.005 ? (
          <button
            type="button"
            onClick={() => setRaw(fillValue.toFixed(2))}
            className="text-sm px-3.5 rounded-full border min-h-[44px]"
            style={{ borderColor: 'var(--color-stone)', color: 'var(--color-charcoal)' }}
          >
            {field === 'thisInvoice' ? 'Bill remaining' : 'Draw remaining'} {money(fillValue)}
          </button>
        ) : null}
        {current > 0 ? (
          <button type="button" onClick={() => setRaw('')} className="text-sm px-3.5 rounded-full border min-h-[44px]" style={{ borderColor: 'var(--color-stone)', color: 'var(--color-charcoal)' }}>
            Clear
          </button>
        ) : null}
      </div>

      <div className="flex gap-3 pt-1">
        <button type="button" onClick={onClose} className="flex-1 py-3 rounded-xl border-2 border-[var(--color-stone)] text-[var(--color-charcoal)] font-semibold min-h-[48px]">
          Cancel
        </button>
        <button type="button" onClick={apply} disabled={invalid} className="flex-1 py-3 rounded-xl bg-[var(--color-teal)] text-[var(--color-cream)] font-semibold min-h-[48px] disabled:opacity-50">
          Apply
        </button>
      </div>
    </div>
  )
}
