'use client'

import { useState } from 'react'

import { BottomSheet } from '@/components/ui/BottomSheet'
import { money2, nextInvoiceNumber, parseMoney, todayStr } from '@/lib/trackers/core'

type Props = {
  open: boolean
  invoiceNumber: string
  totalDue: number
  billed: number
  busy: boolean
  onClose: () => void
  onSubmit: (input: { amount: number; date: string; label: string }) => void
}

const fieldClass =
  'w-full rounded-lg border px-3 py-2.5 bg-white text-[var(--color-charcoal)] text-base outline-none focus:border-[var(--color-teal)] tabular-nums'

/** "The owners paid this invoice": record it and open the next invoice. */
export function PaidSheet({ open, onClose, ...rest }: Props) {
  return (
    <BottomSheet isOpen={open} onClose={onClose} maxHeightDvh={92} ariaLabel={`Client paid invoice ${rest.invoiceNumber}`}>
      {/* Mounted only while open, so the form seeds itself from the invoice each time. */}
      {open ? <PaidForm onClose={onClose} {...rest} /> : null}
    </BottomSheet>
  )
}

function PaidForm({ invoiceNumber, totalDue, billed, busy, onClose, onSubmit }: Omit<Props, 'open'>) {
  const [amount, setAmount] = useState(totalDue > 0 ? totalDue.toFixed(2) : '')
  const [date, setDate] = useState(() => todayStr())
  const [label, setLabel] = useState(`Owner Payment (ref. ________) — Inv #${invoiceNumber}`)

  const parsed = parseMoney(amount)
  const invalid = Number.isNaN(parsed) || parsed <= 0
  const diff = invalid ? 0 : parsed - totalDue
  const next = nextInvoiceNumber(invoiceNumber)

  return (
    <form
      className="px-5 py-4 flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (invalid || busy) return
        onSubmit({ amount: parsed, date: date.trim(), label: label.trim() || 'Owner Payment' })
      }}
    >
      <div>
        <h2 className="text-lg text-[var(--color-charcoal)]" style={{ fontFamily: 'var(--font-fraunces)' }}>
          Client paid invoice #{invoiceNumber}
        </h2>
        <p className="text-sm mt-1 leading-relaxed" style={{ color: 'var(--color-charcoal-light)' }}>
          {billed > 0
            ? `Records the payment, moves this invoice's ${money2(billed)} of progress and draws into completed work, and opens invoice #${next} with nothing billed yet.`
            : `Nothing is billed on this invoice. Recording a payment adds it to Total Paid to Date and opens invoice #${next}.`}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-xs uppercase tracking-wide" style={{ color: 'var(--color-charcoal-light)' }}>
          Amount received $
          <input className={fieldClass} style={{ borderColor: 'var(--color-stone)' }} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required autoFocus />
        </label>
        <label className="flex flex-col gap-1 text-xs uppercase tracking-wide" style={{ color: 'var(--color-charcoal-light)' }}>
          Date received
          <input className={fieldClass} style={{ borderColor: 'var(--color-stone)' }} value={date} onChange={(e) => setDate(e.target.value)} placeholder="MM/DD/YYYY" required />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-xs uppercase tracking-wide" style={{ color: 'var(--color-charcoal-light)' }}>
        Label on the workbook
        <input className={fieldClass} style={{ borderColor: 'var(--color-stone)' }} value={label} onChange={(e) => setLabel(e.target.value)} maxLength={160} />
      </label>
      {!invalid && Math.abs(diff) > 0.005 ? (
        <p className="text-sm rounded-lg px-3 py-2" style={{ backgroundColor: 'rgba(212,175,55,0.18)', color: '#8f6c18' }}>
          {diff < 0
            ? `${money2(-diff)} less than the ${money2(totalDue)} due. The shortfall carries forward and the next tracker's notes say so.`
            : `${money2(diff)} more than the ${money2(totalDue)} due. The excess carries as a credit on the next invoice.`}
        </p>
      ) : null}
      <div className="flex gap-3 pt-1">
        <button type="button" onClick={onClose} className="flex-1 py-3 rounded-xl border-2 border-[var(--color-stone)] text-[var(--color-charcoal)] font-semibold min-h-[44px]">
          Cancel
        </button>
        <button type="submit" disabled={invalid || busy} className="flex-1 py-3 rounded-xl bg-[var(--color-teal)] text-[var(--color-cream)] font-semibold min-h-[44px] disabled:opacity-50">
          {busy ? 'Recording…' : 'Record & start next invoice'}
        </button>
      </div>
    </form>
  )
}
