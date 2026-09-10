'use client'

import { useState } from 'react'
import { X } from 'lucide-react'

import { money2, parseMoney } from '@/lib/trackers/core'
import type { TrackerPayment } from '@/lib/trackers/types'
import { fmt, H2, selectOnFocus } from './format'

type Props = {
  payments: TrackerPayment[]
  onChange: (index: number, patch: Partial<TrackerPayment>) => void
  onAdd: () => void
  onRemove: (index: number) => void
}

const cell = 'bg-transparent border-0 border-b py-2 px-1 outline-none focus:bg-white text-base md:text-sm min-w-0 w-full min-h-[44px] md:min-h-[40px]'

function AmountCell({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  const [draft, setDraft] = useState<string | null>(null)
  const [bad, setBad] = useState(false)
  return (
    <input
      aria-label={label}
      inputMode="decimal"
      className={cell + ' text-right tabular-nums'}
      style={{ borderColor: bad ? '#a23b2a' : 'var(--color-stone-mid)', color: bad ? '#a23b2a' : 'var(--color-charcoal)' }}
      value={draft ?? money2(value)}
      onFocus={selectOnFocus}
      onChange={(e) => {
        setDraft(e.target.value)
        const v = parseMoney(e.target.value)
        if (Number.isNaN(v)) {
          setBad(true)
          return
        }
        setBad(false)
        onChange(v)
      }}
      onBlur={() => {
        setDraft(null)
        setBad(false)
      }}
    />
  )
}

/** Cash received to date: the Payment Summary block of the workbook. */
export function PaymentsSection({ payments, onChange, onAdd, onRemove }: Props) {
  const total = payments.reduce((a, p) => a + (Number(p.amount) || 0), 0)
  return (
    <section aria-labelledby="pay-heading" className="rounded-lg border bg-white" style={{ borderColor: 'var(--color-stone)' }}>
      <div className="px-4 pt-4 pb-2 flex items-start justify-between gap-3">
        <div>
          <h2 id="pay-heading" className={H2} style={{ fontFamily: 'var(--font-fraunces)' }}>
            Payments received
          </h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--color-charcoal-light)' }}>
            Fill the reference and the date as they come in.
          </p>
        </div>
        <button type="button" onClick={onAdd} className="text-sm px-3.5 min-h-[44px] rounded-lg border shrink-0" style={{ borderColor: 'var(--color-stone)', color: 'var(--color-charcoal)' }}>
          + Add
        </button>
      </div>
      <div className="px-4 pb-2 flex flex-col">
        {payments.map((p, i) => (
          <div key={i} className="flex items-start gap-2 py-2 border-t md:grid md:grid-cols-[minmax(0,1fr)_118px_130px_44px] md:items-center md:gap-x-2" style={{ borderColor: 'var(--color-stone)' }}>
            <div className="flex-1 min-w-0 md:contents">
              <input aria-label="Payment label" className={cell} style={{ borderColor: 'var(--color-stone-mid)' }} value={p.label} onChange={(e) => onChange(i, { label: e.target.value })} maxLength={160} />
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(120px,42%)] gap-2 mt-1 md:contents">
                <input aria-label="Payment date" className={cell + ' tabular-nums'} style={{ borderColor: 'var(--color-stone-mid)' }} value={p.date} placeholder="MM/DD/YYYY" onChange={(e) => onChange(i, { date: e.target.value })} maxLength={24} />
                <AmountCell value={Number(p.amount) || 0} label="Payment amount" onChange={(v) => onChange(i, { amount: v })} />
              </div>
            </div>
            <button type="button" onClick={() => onRemove(i)} aria-label={`Remove payment ${p.label}`} className="size-11 shrink-0 rounded-full flex items-center justify-center text-[var(--color-charcoal-light)] hover:bg-red-50 hover:text-red-600 self-center">
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
        ))}
        {payments.length === 0 ? (
          <p className="text-sm py-3" style={{ color: 'var(--color-charcoal-light)' }}>
            No payments recorded yet.
          </p>
        ) : null}
      </div>
      <div className="px-4 py-3 border-t flex items-baseline justify-between gap-3" style={{ borderColor: 'var(--color-stone)' }}>
        <span className="text-[10px] tracking-[0.14em] uppercase" style={{ color: 'var(--color-charcoal-light)' }}>
          Total paid to date
        </span>
        <span className="text-2xl tabular-nums text-[var(--color-charcoal)]" style={{ fontFamily: 'var(--font-fraunces)' }}>
          {fmt(total)}
        </span>
      </div>
    </section>
  )
}
