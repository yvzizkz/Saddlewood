'use client'

import { TRADE_LICENSES, tradeLabel } from '@/lib/accounting/tradeList'
import { TEMPLATE_TRADES, pickFor, pickTrades, type PhaseTemplatePick } from '@/lib/crew/phases'

// What a job's phases start from: the whole job (we are the GC), or the job's
// own trades, picked from the shared trade list. Several trades interleave in
// build order (phases.ts). Used by Award and by a job with no phases yet.

const chip = (on: boolean) =>
  `min-h-9 rounded-full border px-3 text-[13px] font-medium ${
    on ? 'border-[var(--color-teal)] bg-[var(--color-teal)] text-white' : 'border-[var(--color-stone-mid)] bg-white text-[var(--color-charcoal)]'
  }`

export function PhasePick({
  value,
  onChange,
  allowNone = false,
}: {
  value: PhaseTemplatePick | 'none'
  onChange: (v: PhaseTemplatePick | 'none') => void
  allowNone?: boolean
}) {
  const trades = value === 'none' ? [] : pickTrades(value) ?? []
  const gc = value === 'gc'
  const toggle = (t: string) => {
    const next = trades.includes(t as (typeof trades)[number]) ? trades.filter((x) => x !== t) : [...trades, t]
    const pick = pickFor(next)
    onChange(pick === 'none' && !allowNone ? 'gc' : pick)
  }
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Phases to start from">
      <button type="button" aria-pressed={gc} className={chip(gc)} onClick={() => onChange('gc')}>
        Whole job (GC)
      </button>
      {TEMPLATE_TRADES.map((t) => {
        const on = !gc && trades.includes(t)
        const license = TRADE_LICENSES[t]
        return (
          <button key={t} type="button" aria-pressed={on} className={chip(on)} onClick={() => toggle(t)} title={license ? `${tradeLabel(t)}, our ${license} license` : undefined}>
            {tradeLabel(t)}
          </button>
        )
      })}
      {allowNone ? (
        <button type="button" aria-pressed={value === 'none'} className={chip(value === 'none')} onClick={() => onChange('none')}>
          None
        </button>
      ) : null}
    </div>
  )
}
